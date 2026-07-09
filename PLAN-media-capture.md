# PLAN-media-capture — Botão de captura móvel + imagens compartilhadas nas notas

**Rank: 6 (pós-v0).**
**Depende de: todos os 5 planos anteriores (mesclados). Blocks: nada.**

## Objetivo

Duas dores reais de quem usa Android:

1. **Capturar uma ideia própria no celular exige 3 toques** (abrir app → diário →
   digitar), porque o modal de captura só abre por Ctrl+K — que não existe em
   tela de toque. Entra um **botão flutuante ➕ (FAB)** que abre o mesmo modal.
2. **Compartilhar do Instagram só traz o link, nunca a imagem.** Entra o suporte
   a **compartilhar imagens** (carrossel, screenshot, foto) direto para o app:
   elas ficam guardadas offline no IndexedDB e aparecem renderizadas dentro da
   nota. Também entra anexar imagem da galeria pelo modal de captura.

## Decisões fixadas (não desvie nem pergunte)

- **Armazenamento**: nova tabela Dexie `media` em **version(3)** —
  `media: 'id, noteId, createdAt, deletedAt'` — com o Blob no registro (Blobs
  são armazenáveis em IndexedDB; NUNCA converta para base64 no banco, só no
  backup). version(1) e version(2) ficam intocadas.
- **Referência no markdown**: `![](media://<id>)` — sintaxe padrão de imagem
  com esquema próprio. O preview resolve `media://` para object URL; qualquer
  outro renderizador (Obsidian, GitHub) degrada para imagem quebrada visível,
  nunca corrompe o texto.
- **Share target vira POST**: `method: 'POST'`, `enctype: 'multipart/form-data'`,
  `params` como hoje + `files: [{ name: 'media', accept: ['image/*'] }]`.
- **vite-plugin-pwa muda de `generateSW` para `strategies: 'injectManifest'`**
  com `src/sw.ts` próprio: o POST de compartilhamento chega NO service worker,
  e generateSW não permite handler customizado. O sw.ts mantém o precache do
  workbox (`precacheAndRoute(self.__WB_MANIFEST)`) + navegação com fallback +
  o handler do POST /share.
- **Fluxo do POST no SW**: salvar os arquivos numa tabela temporária
  (`sharedInbox`) via IDB cru (não importar o schema do app no SW — bundle
  separado), responder `303 See Other → BASE/share?shared=1`; o app, ao ver
  `shared=1`, move os itens de `sharedInbox` para `media`, anexa os
  `![](media://id)` ao diário e mostra confirmação.
- **Limites**: recusar arquivo > 10 MB e mais de 10 arquivos por
  compartilhamento, com mensagem clara. Aceitar apenas `image/*` (vídeo fica
  para um plano futuro — tamanho explode backup e IndexedDB).
- **Backup**: o JSON passa a `version: 2` — inclui `media` com o blob em
  base64. Import aceita version 1 (sem mídia) E version 2. Merge de mídia por
  id (mídia é imutável: existe ou não existe; sem updatedAt). Avisar no UI que
  backups com imagens ficam grandes.
- **Apagar nota** → soft-delete também nas mídias com `noteId` dela (tombstone
  igual às notas, viaja no backup).
- **FAB**: botão fixo ➕ no canto inferior direito, visível SEMPRE (não só
  mobile — não fazer detecção de touch, que é frágil); abre o QuickCapture. No
  modal, novo botão "📷 anexar imagem" (`<input type="file" accept="image/*"
  multiple>`), útil também no desktop e no iPhone (onde share target não existe).

## Arquivos exatos

```
src/db/schema.ts                 (tocar: interface Media, version(3), tabela media)
src/db/media.ts                  (novo: addMedia, getMedia, softDeleteMediaByNote,
                                  drainSharedInbox)
src/sw.ts                        (novo: precache + navegação + handler POST /share)
vite.config.ts                   (tocar: injectManifest, share_target POST+files)
src/components/CaptureFab.tsx    (novo: botão ➕ flutuante)
src/components/QuickCapture.tsx  (tocar: anexo de imagem; salvar mídia + refs)
src/components/MarkdownPreview.tsx (tocar: componente <img> que resolve media://)
src/App.tsx                      (tocar: montar FAB; rota /share trata shared=1)
src/backup/exportImport.ts       (tocar: backup v2 com mídia base64; import v1+v2)
src/db/media.test.ts             (novo)
src/backup/exportImport.test.ts  (tocar: round-trip v2, import de v1 antigo)
src/index.css                    (tocar: .fab, .capture-attach, .preview img)
tsconfig.app.json                (tocar: types do SW — "WebWorker" no lib do sw.ts
                                  via tsconfig separado ou /// <reference>)
```

## Ordem de implementação

1. Schema: `Media { id, noteId: string | null, blob: Blob, type: string,
   createdAt, deletedAt }` + version(3). Teste de criação/soft-delete primeiro.
2. `media.ts` com as funções puras + testes (fake-indexeddb suporta Blob).
3. FAB + anexo no QuickCapture (parte SEM service worker — testável já):
   anexar imagem → cria registros em `media` → anexa `![](media://id)` no
   texto capturado. Verificar no navegador antes de seguir.
4. MarkdownPreview: componente customizado de `img` — se `src` começa com
   `media://`, buscar blob, `URL.createObjectURL`, e **revogar no cleanup**
   (senão vaza memória a cada render). Imagem inexistente → placeholder
   "mídia não encontrada", nunca quebra o preview.
5. Backup v2 + import retrocompatível + testes.
6. A parte grande: migrar para `injectManifest`, escrever `src/sw.ts`,
   share_target POST, rota `shared=1`. Verificar E2E com a receita da skill.
7. Suíte completa + verificação E2E completa (skill do projeto).

## Edge cases que um modelo mais fraco erraria

- **generateSW não aceita handler de POST** — quem tentar "só adicionar o
  share_target POST" sem migrar para injectManifest vai ver o POST cair no
  fallback de navegação e virar tela branca. A migração do SW vem ANTES.
- **A migração de SW muda o arquivo do service worker**: usuários com o SW
  antigo precisam do fluxo de update (toast) — testar update do SW antigo para
  o novo no E2E (receita já existe na skill).
- **Object URLs vazam**: cada `createObjectURL` sem `revokeObjectURL` fica na
  memória até fechar a aba. Com carrosséis de 10 imagens re-renderizando a
  cada tecla (preview ao vivo!), memoize por id e revogue no unmount.
- **O preview re-renderiza a cada tecla** — buscar blobs do IndexedDB a cada
  render trava a digitação. Cache de object URLs por id (Map módulo-level com
  contagem ou LRU simples) em vez de estado por componente.
- **SW e app são bundles separados**: o sw.ts NÃO pode importar `db/schema.ts`
  (traria Dexie e o app inteiro para o SW). IDB cru no SW, tabela própria.
- **303, não 200**: responder o POST com 200 deixa o usuário preso numa página
  de POST — recarregar reenvia o formulário. `Response.redirect(url, 303)`.
- **`shared=1` precisa ser idempotente**: recarregar a página com o parâmetro
  não pode duplicar as imagens no diário — drenar `sharedInbox` é destrutivo
  (ler e apagar na mesma transação) e o parâmetro é limpo com replaceState.
- **Backup v1 antigo importado num app v2** não pode falhar — teste explícito.
  E backup v2 num app... não existe "app v1" publicado com import estrito?
  Existe: o validador atual rejeita `version !== 1`. Por isso o EXPORT novo
  mantém `notes` no mesmo formato e versiona para 2 — quem tiver o app antigo
  numa aba velha e importar um backup v2 verá a mensagem de erro clara já
  existente, não corrupção.
- **iOS**: share target POST não existe (iOS não suporta share target nenhum);
  o caminho do iPhone é o anexo de galeria no modal — por isso ele não é
  opcional.
- **Instagram compartilha imagens?** Nem sempre — posts muitas vezes só
  oferecem o link. O caminho garantido no Android é: screenshot (ou salvar a
  imagem) → compartilhar A IMAGEM → VortexBrain. Documentar isso no README
  para o usuário não achar que "não funcionou".

## Critérios de aceitação

1. `npm run lint && npm run typecheck && npm test && npm run build` verdes.
2. **FAB**: num viewport de celular (E2E com viewport 390×844), tocar no ➕
   abre o modal de captura; capturar funciona igual ao Ctrl+K.
3. **Anexo**: no modal, anexar 2 imagens da "galeria" (setInputFiles no E2E) →
   diário ganha bullet com 2 `![](media://...)` → preview mostra as 2 imagens.
4. **Share POST** (E2E via fetch multipart contra o preview build): POST com
   1 imagem + texto em `/VortexBrain00/share` → 303 → app aberto mostra a
   imagem no diário. Repetir o GET de texto puro do plano anterior — continua
   funcionando.
5. **Recarregar após shared=1** não duplica imagens (idempotência).
6. **Offline**: com SW novo ativo, reload offline mostra a nota COM a imagem
   (blob local, não rede).
7. **Backup**: exportar → apagar banco → importar → imagens de volta e
   renderizando; importar um backup v1 (sem campo media) → sucesso, zero mídia.
8. **Update de SW**: build antigo (generateSW) → build novo (injectManifest)
   dispara o toast e ativa sem erro no console.
9. Arquivo de 15 MB recusado com mensagem clara; 11 arquivos recusados idem.
10. Apagar uma nota soft-deleta suas mídias; elas não aparecem em outras notas
    nem ressuscitam via backup.
