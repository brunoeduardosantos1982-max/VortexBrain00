// Cliente Alpha Vantage — auto-preenche inputs de valuation para tickers dos
// EUA (cotação, ações em circulação, histórico de lucro líquido).
//
// DECISÕES DELIBERADAS:
// - A chave fica SÓ no navegador (localStorage), digitada pelo usuário. NUNCA
//   vai no repositório/bundle: este app é hospedado estático em página pública,
//   então qualquer chave embutida no código seria lida e queimada por qualquer
//   um. localStorage é do aparelho do próprio usuário.
// - `fetchFn` é injetável para testar sem rede.
// - Rate-limit e erros da API viram mensagem clara. A Alpha Vantage responde
//   HTTP 200 com um campo "Note"/"Information" quando estoura o limite (25/dia
//   no grátis) — se não tratar, o auto-preenche falharia silenciosamente.
// - Só EUA: a cobertura de fundamentos de ações brasileiras na Alpha Vantage é
//   falha, então BR continua entrada manual (ver PLAN-valuation.md).

const CHAVE_STORAGE = 'vortexbrain.alphavantage.key'
const BASE = 'https://www.alphavantage.co/query'

export function getApiKey(): string {
  try {
    return localStorage.getItem(CHAVE_STORAGE) ?? ''
  } catch {
    return '' // localStorage pode lançar (aba privada, storage bloqueado)
  }
}

export function setApiKey(chave: string): void {
  try {
    if (chave) localStorage.setItem(CHAVE_STORAGE, chave)
    else localStorage.removeItem(CHAVE_STORAGE)
  } catch {
    /* sem persistência neste contexto — ignorar */
  }
}

export interface DadosEmpresa {
  precoAtual: number
  acoes: number
  lucroBase: number // lucro líquido do último ano anual reportado
  historicoLucro: { ano: string; lucro: number }[] // recente → antigo, p/ o usuário estimar crescimento
}

export class AlphaVantageError extends Error {}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

// A Alpha Vantage sinaliza rate-limit/erro com estes campos em vez de HTTP != 200.
function checarLimite(obj: Record<string, unknown>): void {
  const aviso = obj['Note'] ?? obj['Information'] ?? obj['Error Message']
  if (typeof aviso === 'string') {
    // O texto costuma citar o limite de 25 req/dia — repassar como está ajuda.
    throw new AlphaVantageError(aviso)
  }
}

async function pegarJson(fetchFn: FetchLike, url: string): Promise<Record<string, unknown>> {
  let resp
  try {
    resp = await fetchFn(url)
  } catch {
    throw new AlphaVantageError('Falha de rede ao consultar a Alpha Vantage (está online?).')
  }
  if (!resp.ok) throw new AlphaVantageError(`Alpha Vantage respondeu HTTP ${resp.status}.`)
  const obj = (await resp.json()) as Record<string, unknown>
  checarLimite(obj)
  return obj
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return n
}

export async function buscarDadosEUA(
  ticker: string,
  apiKey: string,
  fetchFn: FetchLike = (url) => fetch(url),
): Promise<DadosEmpresa> {
  const t = ticker.trim().toUpperCase()
  if (!t) throw new AlphaVantageError('Informe o ticker.')
  if (!apiKey) throw new AlphaVantageError('Configure sua chave da Alpha Vantage primeiro.')
  const k = encodeURIComponent(apiKey)
  const s = encodeURIComponent(t)

  // 3 chamadas = 3 dos seus 25 pedidos diários. Sequencial ajuda a respeitar
  // o limite de 5/min e a dar erro cedo se a chave estiver inválida.
  const quote = await pegarJson(fetchFn, `${BASE}?function=GLOBAL_QUOTE&symbol=${s}&apikey=${k}`)
  const overview = await pegarJson(fetchFn, `${BASE}?function=OVERVIEW&symbol=${s}&apikey=${k}`)
  const income = await pegarJson(fetchFn, `${BASE}?function=INCOME_STATEMENT&symbol=${s}&apikey=${k}`)

  const precoAtual = num((quote['Global Quote'] as Record<string, unknown> | undefined)?.['05. price'])
  const acoes = num(overview['SharesOutstanding'])
  const relatorios = (income['annualReports'] as Record<string, unknown>[] | undefined) ?? []
  const historicoLucro = relatorios
    .map((r) => ({ ano: String(r['fiscalDateEnding'] ?? '').slice(0, 4), lucro: num(r['netIncome']) }))
    .filter((r) => Number.isFinite(r.lucro))

  if (!Number.isFinite(precoAtual) || precoAtual <= 0) {
    throw new AlphaVantageError(`Sem cotação para "${t}". Ticker dos EUA? (BR não é suportado.)`)
  }
  if (!Number.isFinite(acoes) || acoes <= 0 || historicoLucro.length === 0) {
    throw new AlphaVantageError(`Sem fundamentos para "${t}" na Alpha Vantage — preencha manualmente.`)
  }

  return { precoAtual, acoes, lucroBase: historicoLucro[0].lucro, historicoLucro }
}
