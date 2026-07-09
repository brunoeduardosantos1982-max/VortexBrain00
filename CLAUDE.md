# VortexBrain — contexto para o Claude Code

PWA local-first de segundo cérebro (React 19 + TS 6 strict + Vite 8). Notas
markdown no IndexedDB (Dexie), busca sem acentos (MiniSearch), [[wikilinks]]
com backlinks, offline via service worker, captura rápida Ctrl+K com nota
diária, backup JSON com merge.

**Método de trabalho:** siga o `PLAYBOOK.md` (plano antes de código,
verificação na superfície real, persistir aprendizado). A história do projeto
está nos `PLAN-*.md` — leia o plano correspondente antes de mexer numa área.

## Comandos

```bash
npm run dev        # dev server (SEM service worker — PWA só no build)
npm run lint && npm run typecheck && npm test && npm run build   # suíte completa
npm run preview    # serve dist/ em http://localhost:4173/VortexBrain00/
```

Verificação E2E: skill do projeto em `.claude/skills/verify/SKILL.md` — receita
completa de Chromium headless, incluindo as armadilhas de timing já descobertas.

## Decisões de arquitetura (NÃO "conserte" sem entender o porquê)

- **`base: '/VortexBrain00/'`** no Vite: GitHub Pages serve sob o caminho do
  repo. Manifest, share_target e a rota /share dependem disso
  (`import.meta.env.BASE_URL` no código)
- **Soft-delete com tombstone** (`deletedAt`), nunca hard delete: exclusões
  precisam viajar no backup, senão restaurar noutro aparelho ressuscita notas
- **`deletedAt: null` é filtrado em JS**, não por índice: IndexedDB não indexa
  null (`.where().equals(null)` lança DataError)
- **Dexie: NUNCA editar uma version() já publicada** — mudança de schema é
  version(N+1). O índice `*tags` existe desde a v1 de propósito
- **SW em modo `prompt`, não autoUpdate**: autoUpdate recarregaria com autosave
  em debounce pendente → perda de teclas
- **react-markdown SEM rehype-raw** = a fronteira XSS. HTML do usuário vira
  texto literal por design
- **Wikilinks resolvem por título em tempo de render** (não persistem ids);
  renomear quebra links de entrada por design — o link quebrado vira
  "criar nota", visível e auto-curável
- **Datas de diário/arquivo usam getters LOCAIS** — toISOString é UTC e vira
  "amanhã" às 21h no Brasil. Teste roda com TZ=America/Sao_Paulo (vite.config)
- **Busca dobra acentos nos DOIS lados** (processTerm no construtor E em
  searchOptions) — dobrar só um lado falha silenciosamente
- **Editor keyed por note.id** + flush no unmount + registry de flush
  (lib/flushRegistry.ts) + re-hidratação por updatedAt: é o conjunto que
  impede lost updates entre autosave e captura rápida

## Deploy

Push na `main` → workflow `deploy.yml` publica em
https://brunoeduardosantos1982-max.github.io/VortexBrain00/
(`404.html` = cópia do index: Pages não tem fallback de SPA).

## Git

Branch de trabalho → PR → merge na `main`. Após merge, reiniciar a branch:
`git fetch origin main && git checkout -B <branch> origin/main`.
