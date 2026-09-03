import { db, type Note, type Valuation } from '../db/schema.ts'
import { listNotes } from '../db/notes.ts'
import { buildIndex } from '../search/index.ts'

export interface BackupFile {
  format: 'vortexbrain-backup'
  version: 1 | 2
  exportedAt: number
  notes: Note[]
  // Presente a partir da v2. Backups v1 não têm — importam com valuations
  // vazios, sem erro.
  valuations?: Valuation[]
}

export interface ImportReport {
  added: number
  updated: number
  skipped: number
  // Contadores dos valuations, separados das notas.
  valuationsAdded: number
  valuationsUpdated: number
  valuationsSkipped: number
}

export class ImportError extends Error {}

// JSON.parse de arquivo gigante trava a thread principal — recusar com
// mensagem clara em vez de congelar a aba.
const MAX_IMPORT_BYTES = 100 * 1024 * 1024

export async function exportBackup(): Promise<Blob> {
  // db.*.toArray(), NÃO as versões que filtram vivos: as soft-deleted precisam
  // viajar. Sem os tombstones, restaurar noutro aparelho ressuscita registros
  // apagados (ausentes do backup, a cópia local "vence").
  const [notes, valuations] = await Promise.all([db.notes.toArray(), db.valuations.toArray()])
  const payload: BackupFile = {
    format: 'vortexbrain-backup',
    version: 2,
    exportedAt: Date.now(),
    notes,
    valuations,
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

function isValuationLike(v: unknown): v is Valuation {
  if (typeof v !== 'object' || v === null) return false
  const x = v as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    typeof x.ticker === 'string' &&
    typeof x.moeda === 'string' &&
    typeof x.precoAtual === 'number' &&
    typeof x.acoes === 'number' &&
    typeof x.taxaDesconto === 'number' &&
    typeof x.lucroBase === 'number' &&
    Array.isArray(x.crescimento) &&
    x.crescimento.every((n) => typeof n === 'number') &&
    typeof x.crescimentoPerpetuo === 'number' &&
    typeof x.margemSegurancaMin === 'number' &&
    typeof x.createdAt === 'number' &&
    typeof x.updatedAt === 'number' &&
    (x.deletedAt === null || typeof x.deletedAt === 'number')
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
  // Aceita v1 e v2. v2 acrescenta valuations; v1 simplesmente não os tem.
  if (
    p?.format !== 'vortexbrain-backup' ||
    (p.version !== 1 && p.version !== 2) ||
    !Array.isArray(p.notes)
  ) {
    throw new ImportError('O arquivo não é um backup do VortexBrain.')
  }
  // Validação ANTES de escrever qualquer coisa: um registro malformado no
  // meio do arquivo não pode deixar o banco meio-importado.
  if (!p.notes.every(isNoteLike)) {
    throw new ImportError('O backup contém uma nota malformada — nada foi importado.')
  }
  // valuations é opcional (ausente na v1); se presente, tem que ser válido.
  const rawValuations = p.valuations
  if (rawValuations !== undefined && !Array.isArray(rawValuations)) {
    throw new ImportError('O backup contém valuations malformados — nada foi importado.')
  }
  if (Array.isArray(rawValuations) && !rawValuations.every(isValuationLike)) {
    throw new ImportError('O backup contém um valuation malformado — nada foi importado.')
  }
  const incoming = p.notes as Note[]
  const incomingValuations = (rawValuations as Valuation[] | undefined) ?? []

  const report: ImportReport = {
    added: 0,
    updated: 0,
    skipped: 0,
    valuationsAdded: 0,
    valuationsUpdated: 0,
    valuationsSkipped: 0,
  }
  // Uma transação única sobre AS DUAS tabelas: ou importa tudo, ou nada.
  await db.transaction('rw', db.notes, db.valuations, async () => {
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
    for (const v of incomingValuations) {
      const existing = await db.valuations.get(v.id)
      if (!existing) {
        await db.valuations.add(v)
        report.valuationsAdded++
      } else if (v.updatedAt > existing.updatedAt) {
        await db.valuations.put(v)
        report.valuationsUpdated++
      } else {
        report.valuationsSkipped++
      }
    }
  })

  // O índice de busca ficou obsoleto — reconstruir das notas vivas.
  buildIndex(await listNotes())
  return report
}
