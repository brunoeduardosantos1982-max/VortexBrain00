import {
  calcularValuation,
  calcularCenarios,
  MARGEM_SEGURANCA_PADRAO,
  type ValuationInput,
} from './dcf.ts'

// Inputs idênticos aos da planilha original (aba BBAS3): serve de âncora —
// se a matemática mudar sem querer, este teste quebra.
const BBAS3: ValuationInput = {
  ticker: 'BBAS3',
  moeda: 'BRL',
  precoAtual: 22.89,
  acoes: 5730834000,
  taxaDesconto: 0.125,
  lucroBase: 29171564000,
  crescimento: [-0.15, -0.05, 0.1, 0.15],
  crescimentoPerpetuo: 0.03,
}

function ok(r: ReturnType<typeof calcularValuation>) {
  if (!r.ok) throw new Error(`esperava sucesso, veio erro: ${r.erro}`)
  return r
}

it('reproduz o preço justo da planilha (BBAS3 ~R$48,71)', () => {
  const r = ok(calcularValuation(BBAS3))
  expect(r.precoJusto).toBeCloseTo(48.71, 0) // dentro de ~R$0,5
  // upside sobre o preço ATUAL (não sobre o justo, como a planilha fazia)
  expect(r.upside).toBeCloseTo((r.precoJusto - 22.89) / 22.89, 5)
  expect(r.veredito).toBe('COMPRA') // preço bem abaixo do justo com margem 30%
  expect(r.margemSegurancaMin).toBe(MARGEM_SEGURANCA_PADRAO)
})

it('trava quando taxa de desconto <= crescimento perpétuo', () => {
  const r = calcularValuation({ ...BBAS3, taxaDesconto: 0.03, crescimentoPerpetuo: 0.03 })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.erro).toMatch(/maior que o crescimento perpétuo/)
})

it('sinaliza quando o valor vem majoritariamente da perpetuidade', () => {
  // Crescimento alto + perpétuo alto empurram o peso do terminal para cima.
  const r = ok(
    calcularValuation({ ...BBAS3, crescimento: [0.2, 0.2, 0.2, 0.2], crescimentoPerpetuo: 0.06 }),
  )
  expect(r.pesoTerminal).toBeGreaterThan(0.75)
  expect(r.avisoPerpetuidade).toBe(true)
})

it('veredito vira CARO quando o preço passa do justo', () => {
  // Lucro despencando -> preço justo baixo -> preço atual fica caro.
  const r = ok(
    calcularValuation({ ...BBAS3, crescimento: [-0.5, -0.5, -0.5, -0.5], crescimentoPerpetuo: 0 }),
  )
  expect(r.precoJusto).toBeLessThan(r.precoAtual)
  expect(r.veredito).toBe('CARO')
})

it('rejeita entrada inválida sem devolver NaN', () => {
  expect(calcularValuation({ ...BBAS3, crescimento: [] }).ok).toBe(false)
  expect(calcularValuation({ ...BBAS3, acoes: 0 }).ok).toBe(false)
  expect(calcularValuation({ ...BBAS3, precoAtual: -1 }).ok).toBe(false)
  expect(calcularValuation({ ...BBAS3, lucroBase: NaN }).ok).toBe(false)
})

it('cenários ficam ordenados: pessimista <= base <= otimista', () => {
  const c = calcularCenarios(BBAS3)
  const p = ok(c.pessimista)
  const b = ok(c.base)
  const o = ok(c.otimista)
  expect(p.precoJusto).toBeLessThanOrEqual(b.precoJusto)
  expect(b.precoJusto).toBeLessThanOrEqual(o.precoJusto)
})
