import { useEffect, useRef, useState } from 'react'
import { searchNotes, type SearchHit } from '../search/index.ts'

interface Props {
  // Uma busca disparada antes de o índice terminar de construir devolveria
  // [] e pareceria "sem resultados" — o input fica desabilitado até ready.
  ready: boolean
  onSelect: (id: string) => void
}

function SearchBar({ ready, onSelect }: Props) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const timer = useRef<number | undefined>(undefined)

  // Só limpa o timer pendente na desmontagem; o debounce vive no handler.
  useEffect(() => () => window.clearTimeout(timer.current), [])

  function handleChange(value: string) {
    setQ(value)
    window.clearTimeout(timer.current)
    if (!value.trim()) {
      setHits([])
      return
    }
    timer.current = window.setTimeout(() => setHits(searchNotes(value).slice(0, 10)), 150)
  }

  function pick(id: string) {
    onSelect(id)
    setQ('')
    setHits([])
  }

  return (
    <div className="searchbar">
      <input
        type="search"
        aria-label="Buscar"
        placeholder={ready ? 'Buscar…' : 'Indexando…'}
        disabled={!ready}
        value={q}
        onChange={(e) => handleChange(e.target.value)}
      />
      {hits.length > 0 && (
        <ul className="search-results">
          {hits.map((h) => (
            <li key={h.id}>
              <button onClick={() => pick(h.id)}>{h.title || '(sem título)'}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SearchBar
