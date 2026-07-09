import { useEffect } from 'react'

// Ctrl/Cmd+K global. De propósito NÃO ignora quando o foco está num input:
// o ponto de uma tecla de captura global é funcionar até no meio da edição
// de outra nota. Quem ignora reentrada é o modal (que já está aberto).
export function useHotkey(onTrigger: () => void): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.repeat) {
        // preventDefault ANTES de qualquer trabalho: Ctrl+K é a busca da
        // barra de endereço do navegador; depois de um await é tarde demais.
        e.preventDefault()
        onTrigger()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onTrigger])
}
