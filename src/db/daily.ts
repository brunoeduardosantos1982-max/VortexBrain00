import { db, type Note } from './schema.ts'
import { createNote, updateNote } from './notes.ts'
import { upsertNote } from '../search/index.ts'
import { flushPendingSaves } from '../lib/flushRegistry.ts'

// Data LOCAL, nunca toISOString(): no Brasil (UTC-3), a chave UTC vira
// "amanhã" às 21h e toda captura noturna cairia no diário do dia errado.
export function localDateKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function timeHM(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

// Compartilhamentos do Android podem trazer artigos inteiros; um bullet de
// 5 páginas inutiliza o diário — acima disso vira nota própria.
const MAX_BULLET_CHARS = 2000

export async function getOrCreateDailyNote(): Promise<Note> {
  const dateKey = localDateKey()
  // Get-or-create DENTRO de uma transação, não check-then-insert: duas
  // chamadas simultâneas (duas abas, ou hotkey + share) veriam ambas
  // "não existe" e criariam dois diários. A transação 'rw' serializa.
  const note = await db.transaction('rw', db.notes, async () => {
    const existing = await db.notes
      .where('dateKey')
      .equals(dateKey)
      .filter((n) => n.deletedAt === null)
      .first()
    if (existing) return existing

    const now = Date.now()
    const fresh: Note = {
      id: crypto.randomUUID(),
      title: `Diário ${dateKey}`,
      body: '',
      tags: ['diario'],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      dateKey,
    }
    await db.notes.add(fresh)
    return fresh
  })
  upsertNote(note) // fora da transação: o índice de busca não é IndexedDB
  return note
}

export async function appendToDaily(text: string): Promise<Note> {
  const clean = text.replace(/\r\n/g, '\n').trim()

  if (clean.length > MAX_BULLET_CHARS) {
    return createNote({ title: clean.slice(0, 60), body: clean })
  }

  // Um editor aberto com autosave em debounce sobrescreveria o bullet —
  // descarrega os saves pendentes ANTES de ler o corpo do diário.
  flushPendingSaves()

  const daily = await getOrCreateDailyNote()
  const bullet = `- ${timeHM()} ${clean}`
  const body = daily.body ? `${daily.body}\n${bullet}` : bullet
  await updateNote(daily.id, { body })
  return { ...daily, body }
}
