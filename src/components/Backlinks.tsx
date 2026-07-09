import type { Note } from '../db/schema.ts'
import { extractWikilinks } from '../links/wikilinks.ts'

interface Props {
  note: Note
  notes: Note[] | undefined
  onSelect: (id: string) => void
}

// Varredura client-side sobre listNotes() — adequado nesta escala, e
// `notes` já exclui soft-deleted, então nota apagada não aparece aqui.
function Backlinks({ note, notes, onSelect }: Props) {
  if (!note.title) return null

  const referrers = (notes ?? []).filter(
    (n) => n.id !== note.id && extractWikilinks(n.body).includes(note.title),
  )
  if (referrers.length === 0) return null

  return (
    <section className="backlinks" aria-label="Backlinks">
      <h2>Backlinks</h2>
      <ul>
        {referrers.map((n) => (
          <li key={n.id}>
            <button onClick={() => onSelect(n.id)}>{n.title || '(sem título)'}</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default Backlinks
