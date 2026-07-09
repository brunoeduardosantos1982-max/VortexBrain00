// Registro de flushes pendentes de editores abertos. A captura rápida chama
// flushPendingSaves() antes de anexar ao diário: sem isso, um autosave em
// debounce do editor sobrescreveria o bullet recém-anexado (lost update).
const flushes = new Set<() => void>()

export function registerFlush(flush: () => void): () => void {
  flushes.add(flush)
  return () => flushes.delete(flush)
}

export function flushPendingSaves(): void {
  for (const flush of flushes) flush()
}
