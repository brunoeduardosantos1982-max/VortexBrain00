import { useRegisterSW } from 'virtual:pwa-register/react'

// Toast de atualização: com registerType 'prompt', a versão nova do service
// worker só ativa quando o usuário aceita — nunca no meio de uma digitação.
function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="update-toast" role="status">
      <span>Nova versão disponível</span>
      <button onClick={() => void updateServiceWorker(true)}>Atualizar</button>
    </div>
  )
}

export default UpdatePrompt
