import { render, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../db/schema.ts'
import { createNote, getNote } from '../db/notes.ts'
import NoteEditor from './NoteEditor.tsx'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

it('faz flush do autosave pendente ao desmontar (nenhuma tecla perdida)', async () => {
  const note = await createNote({ title: 'T' })
  const { getByLabelText, unmount } = render(<NoteEditor note={note} onDelete={() => {}} />)

  fireEvent.change(getByLabelText('Conteúdo'), { target: { value: 'texto digitado' } })
  unmount() // antes de o debounce de 500 ms disparar

  await waitFor(async () => {
    expect((await getNote(note.id))?.body).toBe('texto digitado')
  })
})

it('salva automaticamente após o intervalo de debounce', async () => {
  const note = await createNote({ title: 'T' })
  const { getByLabelText } = render(<NoteEditor note={note} onDelete={() => {}} />)

  fireEvent.change(getByLabelText('Título'), { target: { value: 'Novo título' } })

  await waitFor(
    async () => {
      expect((await getNote(note.id))?.title).toBe('Novo título')
    },
    { timeout: 2000 },
  )
})
