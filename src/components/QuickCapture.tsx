import { useState } from 'react'
import { createPortal } from 'react-dom'
import { appendToDaily } from '../db/daily.ts'
import { createNote } from '../db/notes.ts'

interface Props {
  open: boolean
  onClose: () => void
  onSaved?: (noteId: string) => void
}

function QuickCapture({ open, onClose, onSaved }: Props) {
  const [text, setText] = useState('')
  const [standalone, setStandalone] = useState(false)
  const [saved, setSaved] = useState(false)

  if (!open) return null

  async function save() {
    const clean = text.trim()
    if (!clean) {
      onClose()
      return
    }
    const note = standalone
      ? await createNote({ title: clean.split('\n')[0].slice(0, 60), body: clean })
      : await appendToDaily(clean)
    setText('')
    setSaved(true)
    onSaved?.(note.id)
    window.setTimeout(() => {
      setSaved(false)
      onClose()
    }, 1500)
  }

  return createPortal(
    <div className="capture-overlay" onClick={onClose}>
      <div
        className="capture-modal"
        role="dialog"
        aria-label="Captura rápida"
        onClick={(e) => e.stopPropagation()}
      >
        {saved ? (
          <p className="capture-saved">Capturado ✓</p>
        ) : (
          <>
            <textarea
              aria-label="Captura"
              placeholder="O que você quer capturar? (Enter salva, Esc fecha)"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose()
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void save()
                }
              }}
            />
            <label className="capture-toggle">
              <input
                type="checkbox"
                checked={standalone}
                onChange={(e) => setStandalone(e.target.checked)}
              />
              nova nota (em vez de anexar ao diário)
            </label>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default QuickCapture
