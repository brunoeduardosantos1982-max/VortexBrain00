import { db, type Note } from './schema.ts'

// crypto.randomUUID() exige contexto seguro (localhost ou HTTPS).
// Num dev server acessado por IP de rede (http://192.168.x.x) ele não existe —
// sirva via localhost em vez de adicionar polyfill.

export async function createNote(
  partial: Partial<Pick<Note, 'title' | 'body' | 'tags'>> = {},
): Promise<Note> {
  const now = Date.now()
  const note: Note = {
    id: crypto.randomUUID(),
    title: partial.title ?? '',
    body: partial.body ?? '',
    tags: partial.tags ?? [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await db.notes.add(note)
  return note
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<Note, 'title' | 'body' | 'tags'>>,
): Promise<void> {
  await db.notes.update(id, { ...patch, updatedAt: Date.now() })
}

export async function softDeleteNote(id: string): Promise<void> {
  // updatedAt também sobe: numa mesclagem de backup (PLAN-pwa-offline),
  // a exclusão precisa vencer versões mais antigas da nota.
  await db.notes.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
}

export function getNote(id: string): Promise<Note | undefined> {
  return db.notes.get(id)
}

export function listNotes(): Promise<Note[]> {
  // IndexedDB não indexa null: .where('deletedAt').equals(null) lança
  // DataError. O filtro de excluídas é feito em JS de propósito.
  return db.notes
    .orderBy('updatedAt')
    .reverse()
    .filter((n) => n.deletedAt === null)
    .toArray()
}
