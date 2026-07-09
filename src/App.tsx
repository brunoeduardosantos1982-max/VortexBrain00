import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createNote, listNotes, softDeleteNote } from './db/notes.ts'
import NoteList from './components/NoteList.tsx'
import NoteEditor from './components/NoteEditor.tsx'

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // useLiveQuery reflete gravações de outras abas automaticamente (Dexie
  // faz broadcast) — não crie mecanismo manual de refresh.
  const notes = useLiveQuery(listNotes)
  const selected = notes?.find((n) => n.id === selectedId) ?? null

  async function handleNew() {
    const note = await createNote()
    setSelectedId(note.id)
  }

  async function handleDelete(id: string) {
    await softDeleteNote(id)
    setSelectedId(null)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1>VortexBrain</h1>
          <button onClick={() => void handleNew()}>+ Nova nota</button>
        </header>
        <NoteList notes={notes} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <main aria-label="notes">
        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            onDelete={(id) => void handleDelete(id)}
          />
        ) : (
          <p className="hint">Selecione uma nota ou crie uma nova.</p>
        )}
      </main>
    </div>
  )
}

export default App
