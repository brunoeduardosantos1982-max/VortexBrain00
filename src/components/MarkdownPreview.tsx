import ReactMarkdown from 'react-markdown'
import { rewriteWikilinks } from '../links/wikilinks.ts'

interface Props {
  body: string
  /** Devolve o href para um [[Título]] (nota existente ou criação). */
  resolveWikilink?: (title: string) => string
}

// react-markdown escapa HTML cru por padrão — essa É a estratégia de
// sanitização (fronteira XSS). Não adicione rehype-raw nem
// dangerouslySetInnerHTML: uma nota com <img onerror=...> deve virar texto.
function MarkdownPreview({ body, resolveWikilink }: Props) {
  // Os títulos não contêm [ ] (o regex de wikilink exclui), então o rótulo
  // é seguro; o href é responsabilidade do resolver (parênteses codificados).
  const processed = resolveWikilink
    ? rewriteWikilinks(body, (title) => `[${title}](${resolveWikilink(title)})`)
    : body

  return (
    <div className="preview" aria-label="Pré-visualização">
      <ReactMarkdown>{processed}</ReactMarkdown>
    </div>
  )
}

export default MarkdownPreview
