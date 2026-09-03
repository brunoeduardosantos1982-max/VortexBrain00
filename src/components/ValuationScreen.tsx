import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createValuation,
  draftPadrao,
  listValuations,
  softDeleteValuation,
  updateValuation,
  type ValuationDraft,
} from '../db/valuations.ts'
import type { Valuation } from '../db/schema.ts'
import { calcularCenarios, calcularValuation, type ValuationResult } from '../valuation/dcf.ts'
import { buscarDadosEUA, getApiKey, setApiKey } from '../valuation/alphaVantage.ts'

// Percentuais são guardados como decimais (0.125) mas editados como % (12,5),
// que é como a pessoa pensa. Conversões isoladas para não espalhar *100/÷100.
const pct = (dec: number) => Number((dec * 100).toFixed(4))
const dec = (p: number) => p / 100

function fmtMoeda(v: number, moeda: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(v)
  } catch {
    return v.toFixed(2) // moeda inválida não pode quebrar a tela
  }
}
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

const VEREDITO_COR: Record<ValuationResult['veredito'], string> = {
  COMPRA: '#4ade80',
  JUSTO: '#facc15',
  CARO: '#f87171',
}

function draftDe(v: Valuation): ValuationDraft {
  return {
    ticker: v.ticker,
    moeda: v.moeda,
    precoAtual: v.precoAtual,
    acoes: v.acoes,
    taxaDesconto: v.taxaDesconto,
    lucroBase: v.lucroBase,
    crescimento: [...v.crescimento],
    crescimentoPerpetuo: v.crescimentoPerpetuo,
    margemSegurancaMin: v.margemSegurancaMin,
  }
}

export default function ValuationScreen() {
  const valuations = useLiveQuery(listValuations)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [apiKey, setApiKeyState] = useState(getApiKey())

  const selected = valuations?.find((v) => v.id === selectedId) ?? null

  function salvarChave(k: string) {
    setApiKeyState(k)
    setApiKey(k)
  }

  async function novo() {
    const v = await createValuation(draftPadrao())
    setSelectedId(v.id)
  }

  return (
    <div className="val-screen">
      <aside className="val-list">
        <button onClick={() => void novo()}>+ Novo valuation</button>
        <ul>
          {(valuations ?? []).map((v) => (
            <li key={v.id}>
              <button
                className={v.id === selectedId ? 'selected' : ''}
                onClick={() => setSelectedId(v.id)}
              >
                {v.ticker || '(sem ticker)'}
              </button>
            </li>
          ))}
        </ul>
        <div className="val-apikey">
          <label htmlFor="av-key">Chave Alpha Vantage (fica só neste navegador)</label>
          <input
            id="av-key"
            type="password"
            value={apiKey}
            placeholder="para auto-preencher tickers dos EUA"
            onChange={(e) => salvarChave(e.target.value)}
          />
        </div>
      </aside>

      <section className="val-main">
        {selected ? (
          // Keyed por id: trocar de valuation remonta o editor com estado
          // limpo (mesmo padrão do NoteEditor). O flush no unmount evita perder
          // as últimas teclas do autosave em debounce.
          <ValuationEditor
            key={selected.id}
            valuation={selected}
            apiKey={apiKey}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <p className="hint">Selecione um valuation ou crie um novo.</p>
        )}
      </section>
    </div>
  )
}

function ValuationEditor({
  valuation,
  apiKey,
  onDeleted,
}: {
  valuation: Valuation
  apiKey: string
  onDeleted: () => void
}) {
  const id = valuation.id
  const [draft, setDraft] = useState<ValuationDraft>(() => draftDe(valuation))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Autosave com debounce; o ref guarda o último draft para o flush no unmount
  // (troca de seleção ou saída da tela) não perder teclas.
  const pendente = useRef<ValuationDraft | null>(null)
  const timer = useRef<number | null>(null)
  const flush = useRef(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (pendente.current) {
      void updateValuation(id, pendente.current)
      pendente.current = null
    }
  })
  useEffect(() => {
    const f = flush.current
    return () => f() // flush no unmount
  }, [])

  function editar(patch: Partial<ValuationDraft>) {
    const novo = { ...draft, ...patch }
    setDraft(novo)
    pendente.current = novo
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = window.setTimeout(flush.current, 400)
  }

  async function excluir() {
    // Cancela autosave pendente antes de excluir para não "ressuscitar".
    if (timer.current !== null) clearTimeout(timer.current)
    pendente.current = null
    await softDeleteValuation(id)
    onDeleted()
  }

  async function buscar() {
    setBusy(true)
    setMsg(null)
    try {
      const d = await buscarDadosEUA(draft.ticker, apiKey)
      editar({ precoAtual: d.precoAtual, acoes: d.acoes, lucroBase: d.lucroBase, moeda: 'USD' })
      setMsg(
        `Dados de ${draft.ticker.toUpperCase()} carregados. Lucro recente: ` +
          d.historicoLucro
            .slice(0, 4)
            .map((h) => `${h.ano}: ${(h.lucro / 1e9).toFixed(1)}B`)
            .join('  '),
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Falha ao buscar dados.')
    } finally {
      setBusy(false)
    }
  }

  const resultado = useMemo(() => calcularValuation(draft), [draft])
  const cenarios = useMemo(() => calcularCenarios(draft), [draft])

  return (
    <>
      <div className="val-form">
        <div className="val-field">
          <label>Ticker</label>
          <input value={draft.ticker} onChange={(e) => editar({ ticker: e.target.value })} />
        </div>
        <div className="val-field">
          <label>Moeda</label>
          <select value={draft.moeda} onChange={(e) => editar({ moeda: e.target.value })}>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </select>
        </div>
        {draft.moeda === 'USD' && (
          <div className="val-field val-fetch">
            <button onClick={() => void buscar()} disabled={busy}>
              {busy ? 'Buscando…' : 'Buscar dados (EUA)'}
            </button>
          </div>
        )}
        <NumField label="Preço atual" value={draft.precoAtual} onChange={(n) => editar({ precoAtual: n })} />
        <NumField label="Nº de ações" value={draft.acoes} onChange={(n) => editar({ acoes: n })} />
        <NumField label="Lucro líquido base" value={draft.lucroBase} onChange={(n) => editar({ lucroBase: n })} />
        <NumField label="Taxa de desconto %" value={pct(draft.taxaDesconto)} onChange={(n) => editar({ taxaDesconto: dec(n) })} />
        <NumField label="Cresc. perpétuo %" value={pct(draft.crescimentoPerpetuo)} onChange={(n) => editar({ crescimentoPerpetuo: dec(n) })} />
        <NumField label="Margem segurança %" value={pct(draft.margemSegurancaMin)} onChange={(n) => editar({ margemSegurancaMin: dec(n) })} />
        <div className="val-field val-growth">
          <label>Crescimento projetado do lucro (% por ano)</label>
          <div className="val-growth-inputs">
            {draft.crescimento.map((g, i) => (
              <input
                key={i}
                type="number"
                aria-label={`crescimento ano ${i + 1}`}
                value={pct(g)}
                onChange={(e) => {
                  const arr = [...draft.crescimento]
                  arr[i] = dec(Number(e.target.value))
                  editar({ crescimento: arr })
                }}
              />
            ))}
          </div>
        </div>
        <div className="val-actions">
          <button onClick={() => void excluir()} className="val-delete">
            Excluir
          </button>
        </div>
      </div>

      {msg && <p className="val-msg">{msg}</p>}

      <ResultPanel resultado={resultado} cenarios={cenarios} />
    </>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="val-field">
      <label>{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </div>
  )
}

function ResultPanel({
  resultado,
  cenarios,
}: {
  resultado: ReturnType<typeof calcularValuation>
  cenarios: ReturnType<typeof calcularCenarios>
}) {
  if (!resultado.ok) return <p className="val-error">⚠ {resultado.erro}</p>

  const r = resultado
  return (
    <div className="val-result">
      <div className="val-headline">
        <div>
          <span className="val-label">Preço justo</span>
          <strong>{fmtMoeda(r.precoJusto, r.moeda)}</strong>
        </div>
        <div>
          <span className="val-label">Preço atual</span>
          <strong>{fmtMoeda(r.precoAtual, r.moeda)}</strong>
        </div>
        <div>
          <span className="val-label">Upside</span>
          <strong style={{ color: r.upside >= 0 ? VEREDITO_COR.COMPRA : VEREDITO_COR.CARO }}>
            {fmtPct(r.upside)}
          </strong>
        </div>
        <div>
          <span className="val-label">Veredito</span>
          <strong style={{ color: VEREDITO_COR[r.veredito] }}>{r.veredito}</strong>
        </div>
      </div>

      {r.avisoPerpetuidade ? (
        <p className="val-warn">
          ⚠ {fmtPct(r.pesoTerminal)} do valor vem da perpetuidade — o valuation é mais chute sobre o
          futuro distante do que análise. Trate com ceticismo.
        </p>
      ) : (
        <p className="val-note">Perpetuidade = {fmtPct(r.pesoTerminal)} do valor.</p>
      )}

      <table className="val-table">
        <thead>
          <tr>
            <th>Ano</th>
            <th>Lucro projetado</th>
            <th>Valor presente</th>
          </tr>
        </thead>
        <tbody>
          {r.anos.map((a) => (
            <tr key={a.ano}>
              <td>{a.ano}</td>
              <td>{fmtMoeda(a.lucro, r.moeda)}</td>
              <td>{fmtMoeda(a.valorPresente, r.moeda)}</td>
            </tr>
          ))}
          <tr>
            <td>Perpetuidade</td>
            <td>{fmtMoeda(r.valorTerminal, r.moeda)}</td>
            <td>{fmtMoeda(r.vpTerminal, r.moeda)}</td>
          </tr>
        </tbody>
      </table>

      <div className="val-cenarios">
        <Cenario nome="Pessimista" res={cenarios.pessimista} />
        <Cenario nome="Base" res={cenarios.base} />
        <Cenario nome="Otimista" res={cenarios.otimista} />
      </div>
    </div>
  )
}

function Cenario({ nome, res }: { nome: string; res: ReturnType<typeof calcularValuation> }) {
  return (
    <div className="val-cenario">
      <span className="val-label">{nome}</span>
      {res.ok ? (
        <>
          <strong>{fmtMoeda(res.precoJusto, res.moeda)}</strong>
          <span style={{ color: VEREDITO_COR[res.veredito] }}>{res.veredito}</span>
        </>
      ) : (
        <span className="val-error-sm">—</span>
      )}
    </div>
  )
}
