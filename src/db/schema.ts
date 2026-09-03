import Dexie, { type Table } from 'dexie'

export interface Note {
  id: string // crypto.randomUUID()
  title: string
  body: string // markdown cru
  tags: string[]
  createdAt: number // Date.now() — definido no código; IndexedDB não tem defaults
  updatedAt: number
  deletedAt: number | null
  dateKey?: string // YYYY-MM-DD LOCAL — presente só em notas diárias
}

// Valuation DCF de uma empresa. O RESULTADO (preço justo etc.) não é
// persistido — recalcula no render a partir destes inputs, como os wikilinks
// resolvem por título em tempo de render. Soft-delete com tombstone pela mesma
// razão das notas: exclusões precisam viajar no backup.
export interface Valuation {
  id: string
  ticker: string
  moeda: string // 'BRL' | 'USD' — rótulo de exibição
  precoAtual: number
  acoes: number
  taxaDesconto: number
  lucroBase: number
  crescimento: number[]
  crescimentoPerpetuo: number
  margemSegurancaMin: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export class VortexDB extends Dexie {
  notes!: Table<Note, string>
  valuations!: Table<Valuation, string>

  constructor() {
    super('vortexbrain')
    // NUNCA edite version(1) depois que ela chegou a qualquer usuário.
    // Mudanças de schema entram como version(2) com upgrade() — editar uma
    // versão já publicada corrompe bancos existentes silenciosamente.
    // O índice multiEntry *tags já entra agora para os planos futuros
    // não precisarem de migração.
    this.version(1).stores({
      notes: 'id, title, updatedAt, deletedAt, *tags',
    })
    // v2: índice dateKey para a nota diária (campo novo é opcional,
    // não precisa de upgrade() — registros v1 simplesmente não o têm).
    this.version(2).stores({
      notes: 'id, title, updatedAt, deletedAt, *tags, dateKey',
    })
    // v3: tabela nova valuations. Tabela nova não exige upgrade() — bancos v2
    // simplesmente passam a ter a tabela vazia. deletedAt fica fora do índice
    // (IndexedDB não indexa null; filtro de vivos é em JS, igual às notas).
    this.version(3).stores({
      notes: 'id, title, updatedAt, deletedAt, *tags, dateKey',
      valuations: 'id, ticker, updatedAt',
    })
  }
}

export const db = new VortexDB()
