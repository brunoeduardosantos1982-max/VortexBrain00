import { db, type Valuation } from './schema.ts'
import { MARGEM_SEGURANCA_PADRAO } from '../valuation/dcf.ts'

// Campos que o usuário edita — o resto (id, timestamps) é gerido aqui.
export type ValuationDraft = Omit<
  Valuation,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

export function draftPadrao(): ValuationDraft {
  return {
    ticker: '',
    moeda: 'BRL',
    precoAtual: 0,
    acoes: 0,
    taxaDesconto: 0.125,
    lucroBase: 0,
    crescimento: [0, 0, 0, 0],
    crescimentoPerpetuo: 0.03,
    margemSegurancaMin: MARGEM_SEGURANCA_PADRAO,
  }
}

export async function createValuation(draft: ValuationDraft): Promise<Valuation> {
  const now = Date.now()
  const v: Valuation = { ...draft, id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null }
  await db.valuations.add(v)
  return v
}

export async function updateValuation(id: string, patch: Partial<ValuationDraft>): Promise<void> {
  await db.valuations.update(id, { ...patch, updatedAt: Date.now() })
}

export async function softDeleteValuation(id: string): Promise<void> {
  // updatedAt também sobe para a exclusão vencer versões antigas no merge de
  // backup — mesma regra das notas.
  await db.valuations.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
}

export function listValuations(): Promise<Valuation[]> {
  // Filtro de excluídas em JS: IndexedDB não indexa null.
  return db.valuations
    .orderBy('updatedAt')
    .reverse()
    .filter((v) => v.deletedAt === null)
    .toArray()
}
