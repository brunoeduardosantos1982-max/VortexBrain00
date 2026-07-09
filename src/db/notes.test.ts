import { db } from './schema.ts'
import { createNote, updateNote, softDeleteNote, getNote, listNotes } from './notes.ts'

// fake-indexeddb é carregado globalmente em src/test/setup.ts (antes de
// qualquer import de módulo de teste). Aqui só garantimos isolamento:
// sem delete/open por teste, notas vazam entre testes e asserções de
// contagem falham de forma intermitente.
beforeEach(async () => {
  await db.delete()
  await db.open()
})

it('createNote preenche id, timestamps e deletedAt', async () => {
  const note = await createNote({ title: 'a', body: 'b' })
  expect(note.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(note.createdAt).toBe(note.updatedAt)
  expect(note.deletedAt).toBeNull()
  expect(await getNote(note.id)).toEqual(note)
})

it('updateNote aplica o patch e sobe updatedAt', async () => {
  const note = await createNote({ title: 'a' })
  vi.spyOn(Date, 'now').mockReturnValue(note.updatedAt + 1000)
  await updateNote(note.id, { body: 'novo corpo' })
  vi.restoreAllMocks()

  const updated = await getNote(note.id)
  expect(updated?.body).toBe('novo corpo')
  expect(updated?.updatedAt).toBe(note.updatedAt + 1000)
})

it('listNotes exclui soft-deleted e ordena por updatedAt desc', async () => {
  const a = await createNote({ title: 'a' })
  const b = await createNote({ title: 'b' })
  await createNote({ title: 'c' })

  vi.spyOn(Date, 'now').mockReturnValue(a.updatedAt + 1000)
  await updateNote(a.id, { body: 'mexi na a' })
  await softDeleteNote(b.id)
  vi.restoreAllMocks()

  const list = await listNotes()
  expect(list.map((n) => n.title)).toEqual(['a', 'c'])
})

it('nota soft-deleted continua recuperável por getNote', async () => {
  const note = await createNote({ title: 'a' })
  await softDeleteNote(note.id)

  const deleted = await getNote(note.id)
  expect(deleted).toBeDefined()
  expect(deleted?.deletedAt).not.toBeNull()
})
