import { fold } from './normalize.ts'

it('remove acentos e baixa a caixa', () => {
  expect(fold('Cérebro')).toBe('cerebro')
  expect(fold('ação')).toBe('acao')
  expect(fold('MEMÓRIA')).toBe('memoria')
  expect(fold('São João')).toBe('sao joao')
})

it('não altera texto sem acentos', () => {
  expect(fold('notas')).toBe('notas')
})
