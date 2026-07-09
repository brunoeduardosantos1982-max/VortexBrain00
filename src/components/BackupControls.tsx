import { useRef, useState } from 'react'
import { backupFilename, exportBackup, importBackup, ImportError } from '../backup/exportImport.ts'

function BackupControls() {
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    const blob = await exportBackup()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFilename()
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(file: File) {
    const confirmed = window.confirm(
      'Importar backup? Notas são mescladas por id — a versão mais recente vence. Nada é apagado em massa.',
    )
    if (!confirmed) return
    try {
      const r = await importBackup(file)
      setMessage(`Importado: ${r.added} novas, ${r.updated} atualizadas, ${r.skipped} mantidas.`)
    } catch (e) {
      setMessage(e instanceof ImportError ? e.message : 'Falha inesperada na importação.')
    }
  }

  return (
    <div className="backup-controls">
      <button onClick={() => void handleExport()}>Exportar backup</button>
      <button onClick={() => fileRef.current?.click()}>Importar backup</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImport(file)
          e.target.value = '' // permite importar o mesmo arquivo de novo
        }}
      />
      {message && <p className="backup-message">{message}</p>}
    </div>
  )
}

export default BackupControls
