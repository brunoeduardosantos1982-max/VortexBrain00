import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note } from '../db/schema.ts'
import { updateNote } from '../db/notes.ts'
import MarkdownPreview from './MarkdownPreview.tsx'

const AUTOSAVE_MS = 500

interface Props {
  note: Note
  onDelete: (id: string) => void
  resolveWikilink?: (title: string) => string
}

// O pai renderiza este componente com key={note.id}: trocar de nota REMONTA
// o editor, então o estado local nunca vaza de uma nota para outra e o
// flush de desmontagem (abaixo) persiste as teclas pendentes do debounce.
function NoteEditor({ note, onDelete, resolveWikilink }: Props) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const pending = useRef<{ title: string; body: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    if (pending.current) {
      const patch = pending.current
      pending.current = null
      void updateNote(note.id, patch)
    }
  }, [note.id])

  // Sem este cleanup, desmontar (ou trocar de nota) dentro da janela de
  // 500 ms perde as últimas teclas digitadas.
  useEffect(() => flush, [flush])

  const schedule = useCallback(
    (nextTitle: string, nextBody: string) => {
      pending.current = { title: nextTitle, body: nextBody }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, AUTOSAVE_MS)
    },
    [flush],
  )

  return (
    <div className="editor">
      <div className="editor-bar">
        <input
          aria-label="Título"
          placeholder="Título"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            schedule(e.target.value, body)
          }}
        />
        <button onClick={() => onDelete(note.id)}>Apagar</button>
      </div>
      <div className="editor-panes">
        <textarea
          aria-label="Conteúdo"
          placeholder="Escreva em markdown…"
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            schedule(title, e.target.value)
          }}
        />
        <MarkdownPreview body={body} resolveWikilink={resolveWikilink} />
      </div>
    </div>
  )
}

export default NoteEditor
