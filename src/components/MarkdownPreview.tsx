import ReactMarkdown from 'react-markdown'

// react-markdown escapa HTML cru por padrão — essa É a estratégia de
// sanitização (fronteira XSS). Não adicione rehype-raw nem
// dangerouslySetInnerHTML: uma nota com <img onerror=...> deve virar texto.
function MarkdownPreview({ body }: { body: string }) {
  return (
    <div className="preview" aria-label="Pré-visualização">
      <ReactMarkdown>{body}</ReactMarkdown>
    </div>
  )
}

export default MarkdownPreview
