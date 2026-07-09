import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createNote, listNotes, softDeleteNote } from './db/notes.ts'
import { buildIndex } from './search/index.ts'
import NoteList from './components/NoteList.tsx'
import NoteEditor from './components/NoteEditor.tsx'
import SearchBar from './components/SearchBar.tsx'
import Backlinks from './components/Backlinks.tsx'
import BackupControls from './components/BackupControls.tsx'
import UpdatePrompt from './pwa/UpdatePrompt.tsx'

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [indexReady, setIndexReady] = useState(false)
  // useLiveQuery reflete gravações de outras abas automaticamente (Dexie
  // faz broadcast) — não crie mecanismo manual de refresh.
  const notes = useLiveQuery(listNotes)
  const selected = notes?.find((n) => n.id === selectedId) ?? null

  // Índice de busca construído uma vez na inicialização, a partir de
  // listNotes() (exclui soft-deleted). A SearchBar fica desabilitada
  // até indexReady para uma busca precoce não parecer "sem resultados".
  useEffect(() => {
    void listNotes().then((all) => {
      buildIndex(all)
      setIndexReady(true)
    })
  }, [])

  // Navegação dos wikilinks do preview: #/note/<id> abre a nota,
  // #/new/<título> cria e abre. O hash é limpo depois para que clicar
  // duas vezes no mesmo link volte a disparar hashchange.
  useEffect(() => {
    async function onHashChange() {
      const hash = window.location.hash
      const noteMatch = /^#\/note\/(.+)$/.exec(hash)
      const newMatch = /^#\/new\/(.+)$/.exec(hash)
      if (noteMatch) {
        setSelectedId(noteMatch[1])
      } else if (newMatch) {
        const note = await createNote({ title: decodeURIComponent(newMatch[1]) })
        setSelectedId(note.id)
      }
      if (noteMatch || newMatch) {
        history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
    // A referência precisa ser estável — remover uma arrow nova não remove nada.
    const handler = () => void onHashChange()
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  // Resolve [[Título]] → href. Título duplicado: listNotes vem em
  // updatedAt desc, então find() devolve a mais recente (determinístico).
  // encodeURIComponent NÃO codifica parênteses, e ")" quebraria a sintaxe
  // [rótulo](url) do markdown — codificação manual.
  const resolveWikilink = useCallback(
    (title: string): string => {
      const target = notes?.find((n) => n.title === title)
      if (target) return `#/note/${target.id}`
      const encoded = encodeURIComponent(title).replace(/\(/g, '%28').replace(/\)/g, '%29')
      return `#/new/${encoded}`
    },
    [notes],
  )

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
        <SearchBar ready={indexReady} onSelect={setSelectedId} />
        <NoteList notes={notes} selectedId={selectedId} onSelect={setSelectedId} />
        <BackupControls />
      </aside>
      <main aria-label="notes">
        {selected ? (
          <>
            <NoteEditor
              key={selected.id}
              note={selected}
              onDelete={(id) => void handleDelete(id)}
              resolveWikilink={resolveWikilink}
            />
            <Backlinks note={selected} notes={notes} onSelect={setSelectedId} />
          </>
        ) : (
          <p className="hint">Selecione uma nota ou crie uma nova.</p>
        )}
      </main>
      <UpdatePrompt />
    </div>
  )
}

export default App
