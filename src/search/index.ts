import MiniSearch from 'minisearch'
import type { Note } from '../db/schema.ts'
import { fold } from './normalize.ts'

interface Doc {
  id: string
  title: string
  body: string
}

export interface SearchHit {
  id: string
  title: string
  score: number
}

const miniSearch = new MiniSearch<Doc>({
  fields: ['title', 'body'],
  storeFields: ['title'],
  processTerm: fold,
  searchOptions: { prefix: true, fuzzy: 0.1, processTerm: fold },
})

const toDoc = (n: Note): Doc => ({ id: n.id, title: n.title, body: n.body })

// Construir SEMPRE a partir de listNotes() (que exclui soft-deleted), nunca
// de db.notes.toArray() — senão notas apagadas reaparecem na busca a cada
// reinício do app.
export function buildIndex(notes: Note[]): void {
  miniSearch.removeAll()
  miniSearch.addAll(notes.map(toDoc))
}

export function upsertNote(note: Note): void {
  // add() lança "duplicate ID" em atualização e replace() exige que o doc
  // exista — por isso o upsert precisa do has().
  if (miniSearch.has(note.id)) miniSearch.replace(toDoc(note))
  else miniSearch.add(toDoc(note))
}

export function removeNote(id: string): void {
  if (miniSearch.has(id)) miniSearch.discard(id)
}

export function searchNotes(q: string): SearchHit[] {
  return miniSearch
    .search(q)
    .map((r) => ({ id: String(r.id), title: r.title as string, score: r.score }))
}
