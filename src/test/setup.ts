// fake-indexeddb precisa carregar antes de qualquer módulo que importe o
// Dexie (src/db/schema.ts instancia o banco no import). setupFiles roda
// antes dos imports de cada arquivo de teste, então aqui é o lugar certo.
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
