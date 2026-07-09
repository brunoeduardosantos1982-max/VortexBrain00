import { extractWikilinks, rewriteWikilinks } from './wikilinks.ts'

it('extrai títulos únicos, com trim', () => {
  expect(extractWikilinks('veja [[Cérebro Digital]] e [[ Ideias ]] e de novo [[Cérebro Digital]]')).toEqual([
    'Cérebro Digital',
    'Ideias',
  ])
})

it('ignora [[links]] dentro de bloco de código cercado', () => {
  const body = 'prosa com [[RealLink]]\n```\ncódigo com [[NotALink]]\n```\nfim'
  expect(extractWikilinks(body)).toEqual(['RealLink'])
})

it('ignora [[links]] dentro de código inline', () => {
  expect(extractWikilinks('use `[[NotALink]]` mas veja [[RealLink]]')).toEqual(['RealLink'])
})

it('cerca de ~~~ não é fechada por ```', () => {
  const body = '~~~\n[[Dentro]]\n```\n[[AindaDentro]]\n~~~\n[[Fora]]'
  expect(extractWikilinks(body)).toEqual(['Fora'])
})

it('link vazio ou só espaços é descartado', () => {
  expect(extractWikilinks('[[  ]] e [[Válido]]')).toEqual(['Válido'])
})

it('rewriteWikilinks preserva código intocado', () => {
  const body = '[[A]]\n```\n[[B]]\n```\n`[[C]]` [[D]]'
  const out = rewriteWikilinks(body, (t) => `LINK(${t})`)
  expect(out).toBe('LINK(A)\n```\n[[B]]\n```\n`[[C]]` LINK(D)')
})
