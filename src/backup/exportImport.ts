import { db, type Note } from '../db/schema.ts'
import { listNotes } from '../db/notes.ts'
import { buildIndex } from '../search/index.ts'

export interface BackupFile {
  format: 'vortexbrain-backup'
  version: 1
  exportedAt: number
  notes: Note[]
}

export interface ImportReport {
  added: number
  updated: number
  skipped: number
}

export class ImportError extends Error {}

// JSON.parse de arquivo gigante trava a thread principal — recusar com
// mensagem clara em vez de congelar a aba.
const MAX_IMPORT_BYTES = 100 * 1024 * 1024

export async function exportBackup(): Promise<Blob> {
  // db.notes.toArray(), NÃO listNotes(): as soft-deleted precisam viajar.
  // Sem os tombstones, restaurar noutro aparelho ressuscita notas apagadas
  // (ausentes do backup, a cópia local "vence").
  const notes = await db.notes.toArray()
  const payload: BackupFile = {
    format: 'vortexbrain-backup',
    version: 1,
    exportedAt: Date.now(),
    notes,
  }
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

export function backupFilename(now = new Date()): string {
  // Data LOCAL — toISOString().slice(0,10) é UTC e, no Brasil (UTC-3),
  // toda exportação depois das 21h ganharia a data de amanhã.
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `vortexbrain-backup-${y}-${m}-${d}.json`
}

function isNoteLike(v: unknown): v is Note {
  if (typeof v !== 'object' || v === null) return false
  const n = v as Record<string, unknown>
  return (
    typeof n.id === 'string' &&
    typeof n.title === 'string' &&
    typeof n.body === 'string' &&
    Array.isArray(n.tags) &&
    typeof n.createdAt === 'number' &&
    typeof n.updatedAt === 'number' &&
    (n.deletedAt === null || typeof n.deletedAt === 'number')
  )
}

export async function importBackup(file: Blob): Promise<ImportReport> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError('Arquivo grande demais (máximo 100 MB).')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new ImportError('O arquivo não é um JSON válido.')
  }

  const p = parsed as Record<string, unknown> | null
  if (p?.format !== 'vortexbrain-backup' || p.version !== 1 || !Array.isArray(p.notes)) {
    throw new ImportError('O arquivo não é um backup do VortexBrain.')
  }
  // Validação ANTES de escrever qualquer coisa: um registro malformado no
  // meio do arquivo não pode deixar o banco meio-importado.
  if (!p.notes.every(isNoteLike)) {
    throw new ImportError('O backup contém uma nota malformada — nada foi importado.')
  }
  const incoming = p.notes as Note[]

  const report: ImportReport = { added: 0, updated: 0, skipped: 0 }
  // Uma transação única: ou importa tudo, ou nada.
  await db.transaction('rw', db.notes, async () => {
    for (const note of incoming) {
      const existing = await db.notes.get(note.id)
      if (!existing) {
        await db.notes.add(note)
        report.added++
      } else if (note.updatedAt > existing.updatedAt) {
        // merge por id: o updatedAt mais novo vence (inclusive exclusões,
        // já que softDelete também sobe updatedAt)
        await db.notes.put(note)
        report.updated++
      } else {
        report.skipped++
      }
    }
  })

  // O índice de busca ficou obsoleto — reconstruir das notas vivas.
  buildIndex(await listNotes())
  return report
}
