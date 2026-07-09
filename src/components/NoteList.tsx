import type { Note } from '../db/schema.ts'

interface Props {
  notes: Note[] | undefined
  selectedId: string | null
  onSelect: (id: string) => void
}

function NoteList({ notes, selectedId, onSelect }: Props) {
  // useLiveQuery devolve undefined no primeiro render (carregando) — não [].
  if (!notes) return <p className="hint">Carregando…</p>
  if (notes.length === 0) return <p className="hint">Nenhuma nota ainda.</p>

  return (
    <ul className="note-list">
      {notes.map((n) => (
        <li key={n.id}>
          <button
            className={n.id === selectedId ? 'selected' : undefined}
            onClick={() => onSelect(n.id)}
          >
            {n.title || '(sem título)'}
          </button>
        </li>
      ))}
    </ul>
  )
}

export default NoteList
