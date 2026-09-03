// Motor de valuation DCF ("Imersão a Tríade dos Dividendos").
//
// Reproduz o cálculo da planilha original (lucro líquido projetado + valor
// terminal de Gordon, tudo descontado), mas conserta dois furos dela:
//   1. Exige taxaDesconto > crescimentoPerpetuo. A perpetuidade de Gordon
//      FC*(1+g)/(i-g) diverge (ou fica negativa) quando i <= g — a planilha
//      não trava isso e cospe um número absurdo como se fosse "preço justo".
//   2. Expõe o peso da perpetuidade no valor total. Quando quase todo o valor
//      vem do terminal, o "valuation" é mais chute sobre o futuro distante do
//      que análise — é isso que faz a planilha dizer "compra" para tudo.
//
// PURO e agnóstico de moeda/mercado: BR e EUA usam a mesma matemática; o campo
// `moeda` só rotula a exibição. Sem I/O, sem rede — testável isolado.

export interface ValuationInput {
  ticker: string
  moeda?: string // 'BRL' | 'USD' — só para formatar a exibição
  precoAtual: number
  acoes: number // número total de papéis
  taxaDesconto: number // i, decimal: 0.125 = 12,5%
  lucroBase: number // lucro líquido do último ano realizado (o mais recente)
  crescimento: number[] // crescimento projetado por ano, decimais (0.10 = +10%)
  crescimentoPerpetuo: number // g na perpetuidade, decimal
  margemSegurancaMin?: number // padrão 0.30 — desconto exigido para marcar COMPRA
}

export interface AnoProjetado {
  ano: number // 1..N
  lucro: number
  valorPresente: number
}

export type Veredito = 'COMPRA' | 'JUSTO' | 'CARO'

export interface ValuationResult {
  ok: true
  ticker: string
  moeda: string
  anos: AnoProjetado[]
  valorTerminal: number // valor terminal no ano N (não descontado)
  vpTerminal: number // valor presente do terminal
  pesoTerminal: number // vpTerminal / marketCapIntrinseco (0..1)
  avisoPerpetuidade: boolean // pesoTerminal > LIMITE_AVISO_PERPETUIDADE
  marketCapIntrinseco: number
  precoJusto: number
  precoAtual: number
  upside: number // (precoJusto - precoAtual) / precoAtual
  margemSegurancaMin: number
  veredito: Veredito
}

export interface ValuationErro {
  ok: false
  erro: string
}

export const MARGEM_SEGURANCA_PADRAO = 0.3

// Acima disto, o valor vem majoritariamente da perpetuidade e o painel avisa.
// 0.75 flagra os casos gritantes sem virar ruído — um valuation "normal" já
// costuma ter metade do valor no terminal.
export const LIMITE_AVISO_PERPETUIDADE = 0.75

// Deltas dos cenários (em pontos percentuais absolutos sobre os decimais).
// Pessimista aperta tudo (menos crescimento, menos perpétuo, mais desconto);
// otimista afrouxa. Nomeados aqui para o "porquê" não se perder no código.
const CENARIO = {
  pessimista: { crescimento: -0.05, perpetuo: -0.01, desconto: +0.02 },
  otimista: { crescimento: +0.05, perpetuo: +0.01, desconto: -0.01 },
} as const

function finito(...xs: number[]): boolean {
  return xs.every((x) => typeof x === 'number' && Number.isFinite(x))
}

export function calcularValuation(input: ValuationInput): ValuationResult | ValuationErro {
  const {
    ticker,
    moeda = 'BRL',
    precoAtual,
    acoes,
    taxaDesconto: i,
    lucroBase,
    crescimento,
    crescimentoPerpetuo: g,
    margemSegurancaMin = MARGEM_SEGURANCA_PADRAO,
  } = input

  if (!Array.isArray(crescimento) || crescimento.length === 0) {
    return { ok: false, erro: 'informe ao menos um ano de crescimento projetado' }
  }
  if (!finito(precoAtual, acoes, i, lucroBase, g, margemSegurancaMin, ...crescimento)) {
    return { ok: false, erro: 'todos os campos numéricos precisam ser números válidos' }
  }
  if (precoAtual <= 0 || acoes <= 0) {
    return { ok: false, erro: 'preço atual e número de ações precisam ser positivos' }
  }
  // Guard central: sem isto a perpetuidade de Gordon diverge/fica negativa.
  if (i <= g) {
    return {
      ok: false,
      erro: 'a taxa de desconto tem que ser maior que o crescimento perpétuo',
    }
  }

  const anos: AnoProjetado[] = []
  let lucro = lucroBase
  crescimento.forEach((gAno, idx) => {
    const ano = idx + 1
    lucro = lucro * (1 + gAno)
    const valorPresente = lucro / (1 + i) ** ano
    anos.push({ ano, lucro, valorPresente })
  })

  const N = anos.length
  const lucroN = anos[N - 1].lucro
  // Gordon: FC do 1º ano perpétuo = lucroN*(1+g); valor no ano N = /(i-g).
  const valorTerminal = (lucroN * (1 + g)) / (i - g)
  const vpTerminal = valorTerminal / (1 + i) ** N

  const vpAnos = anos.reduce((soma, a) => soma + a.valorPresente, 0)
  const marketCapIntrinseco = vpAnos + vpTerminal
  const precoJusto = marketCapIntrinseco / acoes
  const upside = (precoJusto - precoAtual) / precoAtual
  const pesoTerminal = vpTerminal / marketCapIntrinseco

  let veredito: Veredito
  if (precoAtual <= precoJusto * (1 - margemSegurancaMin)) veredito = 'COMPRA'
  else if (precoAtual <= precoJusto) veredito = 'JUSTO'
  else veredito = 'CARO'

  return {
    ok: true,
    ticker,
    moeda,
    anos,
    valorTerminal,
    vpTerminal,
    pesoTerminal,
    avisoPerpetuidade: pesoTerminal > LIMITE_AVISO_PERPETUIDADE,
    marketCapIntrinseco,
    precoJusto,
    precoAtual,
    upside,
    margemSegurancaMin,
    veredito,
  }
}

export interface Cenarios {
  pessimista: ValuationResult | ValuationErro
  base: ValuationResult | ValuationErro
  otimista: ValuationResult | ValuationErro
}

// Aplica um delta a cada ano de crescimento, ao perpétuo e ao desconto.
function comDelta(input: ValuationInput, d: { crescimento: number; perpetuo: number; desconto: number }): ValuationInput {
  return {
    ...input,
    crescimento: input.crescimento.map((g) => g + d.crescimento),
    crescimentoPerpetuo: input.crescimentoPerpetuo + d.perpetuo,
    taxaDesconto: input.taxaDesconto + d.desconto,
  }
}

export function calcularCenarios(input: ValuationInput): Cenarios {
  return {
    pessimista: calcularValuation(comDelta(input, CENARIO.pessimista)),
    base: calcularValuation(input),
    otimista: calcularValuation(comDelta(input, CENARIO.otimista)),
  }
}
