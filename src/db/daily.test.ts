// TZ=America/Sao_Paulo vem do vite.config.ts (test.env) para o teste de
// data local realmente distinguir local de UTC.
import { db } from './schema.ts'
import { localDateKey, getOrCreateDailyNote, appendToDaily } from './daily.ts'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

it('localDateKey usa data LOCAL — 21h30 em São Paulo ainda é hoje, não amanhã (UTC)', () => {
  const d = new Date('2026-07-10T00:30:00Z') // 09/07 21:30 em UTC-3
  expect(d.toISOString().slice(0, 10)).toBe('2026-07-10') // a armadilha UTC
  expect(localDateKey(d)).toBe('2026-07-09') // o comportamento correto
})

it('getOrCreateDailyNote é idempotente sob corrida (Promise.all)', async () => {
  const [a, b] = await Promise.all([getOrCreateDailyNote(), getOrCreateDailyNote()])
  expect(a.id).toBe(b.id)
  expect(await db.notes.count()).toBe(1)

  const again = await getOrCreateDailyNote()
  expect(again.id).toBe(a.id)
})

it('appendToDaily adiciona bullets com hora, em ordem, na MESMA nota', async () => {
  await appendToDaily('comprar café')
  const daily = await appendToDaily('ligar para o médico')

  const lines = daily.body.split('\n')
  expect(lines).toHaveLength(2)
  expect(lines[0]).toMatch(/^- \d{2}:\d{2} comprar café$/)
  expect(lines[1]).toMatch(/^- \d{2}:\d{2} ligar para o médico$/)
  expect(daily.title).toBe(`Diário ${localDateKey()}`)
  expect(daily.tags).toContain('diario')
  expect(await db.notes.count()).toBe(1)
})

it('texto gigante vira nota própria em vez de bullet', async () => {
  const huge = 'x'.repeat(3000)
  const note = await appendToDaily(huge)

  expect(note.dateKey).toBeUndefined()
  expect(note.title).toBe('x'.repeat(60))
  expect(note.body).toBe(huge)
})

it('normaliza \\r\\n de texto compartilhado', async () => {
  const daily = await appendToDaily('linha um\r\nlinha dois')
  expect(daily.body).not.toContain('\r')
})
