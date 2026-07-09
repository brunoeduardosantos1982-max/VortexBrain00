import { db, type Note } from '../db/schema.ts'
import { createNote, softDeleteNote, getNote } from '../db/notes.ts'
import { exportBackup, importBackup, backupFilename, ImportError } from './exportImport.ts'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function parseBlob(blob: Blob): Promise<{ notes: Note[] }> {
  return JSON.parse(await blob.text()) as { notes: Note[] }
}

it('exporta TODAS as notas, incluindo tombstones de soft-delete', async () => {
  await createNote({ title: 'viva' })
  const dead = await createNote({ title: 'apagada' })
  await softDeleteNote(dead.id)

  const { notes } = await parseBlob(await exportBackup())
  expect(notes).toHaveLength(2)
  expect(notes.find((n) => n.id === dead.id)?.deletedAt).not.toBeNull()
})

it('round-trip: exportar, zerar o banco, importar → tudo restaurado', async () => {
  const a = await createNote({ title: 'a', body: 'corpo a' })
  const dead = await createNote({ title: 'apagada' })
  await softDeleteNote(dead.id)

  const blob = await exportBackup()
  await db.delete()
  await db.open()

  const report = await importBackup(blob)
  expect(report).toEqual({ added: 2, updated: 0, skipped: 0 })
  expect((await getNote(a.id))?.body).toBe('corpo a')
  expect((await getNote(dead.id))?.deletedAt).not.toBeNull()
})

it('conflito: cópia local mais nova sobrevive; backup mais novo vence', async () => {
  const note = await createNote({ title: 'original' })

  // backup contém versão MAIS ANTIGA
  const older = { ...note, title: 'antiga', updatedAt: note.updatedAt - 1000 }
  // e uma versão MAIS NOVA de outra nota
  const other = await createNote({ title: 'outra' })
  const newer = { ...other, title: 'renomeada no backup', updatedAt: other.updatedAt + 1000 }

  const blob = new Blob(
    [JSON.stringify({ format: 'vortexbrain-backup', version: 1, exportedAt: 1, notes: [older, newer] })],
    { type: 'application/json' },
  )
  const report = await importBackup(blob)

  expect(report).toEqual({ added: 0, updated: 1, skipped: 1 })
  expect((await getNote(note.id))?.title).toBe('original') // local venceu
  expect((await getNote(other.id))?.title).toBe('renomeada no backup') // backup venceu
})

it('rejeita arquivos que não são backup, sem tocar no banco', async () => {
  await createNote({ title: 'intacta' })

  for (const bad of ['{"hello":"world"}', '{"format":"vortexbrain-backup","version":1,"notes":[{"id":1}]}', '{trunca']) {
    await expect(importBackup(new Blob([bad]))).rejects.toBeInstanceOf(ImportError)
  }
  expect(await db.notes.count()).toBe(1)
})

it('nome do arquivo usa data LOCAL, não UTC', () => {
  // 23h30 local: em UTC-3 já seria "amanhã" em UTC
  expect(backupFilename(new Date(2026, 6, 9, 23, 30))).toBe('vortexbrain-backup-2026-07-09.json')
})
