// [[Título]] dentro de código NÃO é link. Um regex global sobre o corpo
// inteiro linkificaria exemplos de código — por isso o algoritmo percorre
// linha a linha controlando blocos cercados (``` / ~~~) e, fora deles,
// divide a linha pelos spans de crase antes de substituir.

const LINK_RE = /\[\[([^[\]\n]+)\]\]/g
const FENCE_RE = /^\s*(`{3,}|~{3,})/

/**
 * Reescreve cada [[Título]] fora de código usando `replacer`.
 * Blocos cercados e código inline passam intocados.
 */
export function rewriteWikilinks(body: string, replacer: (title: string) => string): string {
  let inFence = false
  let fenceChar = ''

  return body
    .split('\n')
    .map((line) => {
      const m = FENCE_RE.exec(line)
      if (m) {
        const ch = m[1][0]
        if (!inFence) {
          inFence = true
          fenceChar = ch
        } else if (ch === fenceChar) {
          // fecha só com o MESMO caractere de cerca (``` não fecha ~~~)
          inFence = false
        }
        return line
      }
      if (inFence) return line

      return line
        .split(/(`[^`\n]*`)/g)
        .map((seg) =>
          seg.startsWith('`')
            ? seg
            : seg.replace(LINK_RE, (_full, title: string) => replacer(title.trim())),
        )
        .join('')
    })
    .join('\n')
}

/** Títulos únicos referenciados por [[...]] fora de código. */
export function extractWikilinks(body: string): string[] {
  const seen = new Set<string>()
  rewriteWikilinks(body, (title) => {
    if (title) seen.add(title)
    return ''
  })
  return [...seen]
}
