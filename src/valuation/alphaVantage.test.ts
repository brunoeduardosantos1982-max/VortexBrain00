import { buscarDadosEUA, AlphaVantageError } from './alphaVantage.ts'

function fakeFetch(porUrl: Record<string, unknown>) {
  return (url: string) => {
    // Escolhe a resposta pela function= na URL.
    const fn = new URL(url).searchParams.get('function') ?? ''
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(porUrl[fn]) })
  }
}

const OK = {
  GLOBAL_QUOTE: { 'Global Quote': { '05. price': '150.00' } },
  OVERVIEW: { SharesOutstanding: '1000000000' },
  INCOME_STATEMENT: {
    annualReports: [
      { fiscalDateEnding: '2024-12-31', netIncome: '90000000000' },
      { fiscalDateEnding: '2023-12-31', netIncome: '80000000000' },
    ],
  },
}

it('monta DadosEmpresa a partir das três chamadas', async () => {
  const d = await buscarDadosEUA('AAPL', 'CHAVE', fakeFetch(OK))
  expect(d.precoAtual).toBe(150)
  expect(d.acoes).toBe(1_000_000_000)
  expect(d.lucroBase).toBe(90_000_000_000) // ano mais recente
  expect(d.historicoLucro).toHaveLength(2)
  expect(d.historicoLucro[0].ano).toBe('2024')
})

it('trata rate-limit (campo Note) como erro claro', async () => {
  const limitado = fakeFetch({
    GLOBAL_QUOTE: { Note: 'Our standard API rate limit is 25 requests per day.' },
  })
  await expect(buscarDadosEUA('AAPL', 'CHAVE', limitado)).rejects.toBeInstanceOf(AlphaVantageError)
})

it('exige chave e ticker', async () => {
  await expect(buscarDadosEUA('', 'CHAVE', fakeFetch(OK))).rejects.toBeInstanceOf(AlphaVantageError)
  await expect(buscarDadosEUA('AAPL', '', fakeFetch(OK))).rejects.toBeInstanceOf(AlphaVantageError)
})

it('sem cotação (ex.: ticker BR) → erro explícito, não NaN', async () => {
  const semPreco = fakeFetch({ ...OK, GLOBAL_QUOTE: { 'Global Quote': {} } })
  await expect(buscarDadosEUA('BBAS3', 'CHAVE', semPreco)).rejects.toThrow(/cotação/)
})
