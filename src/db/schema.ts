import Dexie, { type Table } from 'dexie'

export interface Note {
  id: string // crypto.randomUUID()
  title: string
  body: string // markdown cru
  tags: string[]
  createdAt: number // Date.now() — definido no código; IndexedDB não tem defaults
  updatedAt: number
  deletedAt: number | null
}

export class VortexDB extends Dexie {
  notes!: Table<Note, string>

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
  }
}

export const db = new VortexDB()
