# VortexBrain — Segundo Cérebro

Um segundo cérebro pessoal: PWA local-first para capturar, conectar e reencontrar notas em markdown. Os dados vivem no seu navegador (IndexedDB), funcionam offline e nunca dependem de um servidor.

## Desenvolvimento

```bash
npm install       # instalar dependências
npm run dev       # servidor de desenvolvimento
npm test          # testes unitários (Vitest)
npm run lint      # ESLint
npm run typecheck # TypeScript
npm run build     # build de produção em dist/
npm run preview   # servir o build localmente
```

## Roteiro

A implementação segue os planos ranqueados no repositório:

1. `PLAN-foundation.md` — scaffold, tooling e CI ✅
2. `PLAN-notes-core.md` — modelo de dados, CRUD e markdown ✅
3. `PLAN-search-links.md` — busca sem acentos, [[wikilinks]] e backlinks ✅
4. `PLAN-pwa-offline.md` — PWA instalável, offline e backup ✅
5. `PLAN-quick-capture.md` — captura rápida (Ctrl+K), notas diárias e share target ✅

## Atalhos

- **Ctrl/Cmd+K** — captura rápida (anexa ao diário do dia, ou "nova nota")
- **[[Título]]** no corpo de uma nota — link para outra nota (cria ao clicar se não existir)
