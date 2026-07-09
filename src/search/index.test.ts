import type { Note } from '../db/schema.ts'
import { buildIndex, upsertNote, removeNote, searchNotes } from './index.ts'

const note = (id: string, title: string, body = ''): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
})

// O índice é um singleton de módulo — resetar entre testes.
beforeEach(() => buildIndex([]))

it('busca ignora acentos nos dois sentidos', () => {
  buildIndex([note('1', 'Cérebro Digital', 'memória de longo prazo')])

  expect(searchNotes('cerebro').map((h) => h.id)).toEqual(['1'])
  expect(searchNotes('memoria').map((h) => h.id)).toEqual(['1'])
  expect(searchNotes('CÉREBRO').map((h) => h.id)).toEqual(['1'])
  expect(searchNotes('mémoria').map((h) => h.id)).toEqual(['1']) // acento "errado" também acha
})

it('upsert de nota nova e depois atualização não lança e busca acha a versão nova', () => {
  const v1 = note('1', 'Rascunho', 'primeiro texto')
  upsertNote(v1)
  upsertNote({ ...v1, body: 'texto definitivo sobre jardinagem' }) // update: não pode lançar duplicate ID

  expect(searchNotes('jardinagem').map((h) => h.id)).toEqual(['1'])
  expect(searchNotes('primeiro')).toEqual([])
})

it('removeNote tira a nota da busca e é idempotente', () => {
  upsertNote(note('1', 'Apagável', 'conteúdo'))
  removeNote('1')
  removeNote('1') // segunda chamada não lança

  expect(searchNotes('apagavel')).toEqual([])
})

it('busca por prefixo funciona', () => {
  buildIndex([note('1', 'Jardinagem urbana')])
  expect(searchNotes('jard').map((h) => h.id)).toEqual(['1'])
})
