# PLAN-valuation — Valuation DCF (Tríade dos Dividendos) como nota

**Depende de:** notes-core, search-links (bloco vive dentro de uma nota).
**Bloqueia:** fase 2 (fetch de preço ao vivo com chave do usuário).

## Objetivo

Ao final existe, dentro do VortexBrain, uma forma de avaliar uma empresa
(brasileira ou americana) pelo método DCF da planilha "Imersão a Tríade dos
Dividendos": lucro líquido projetado + perpetuidade de Gordon, descontado a uma
taxa. Uma nota que contenha um bloco ` ```valuation ` com os inputs em JSON
passa a exibir, abaixo do editor, um painel com **preço justo por ação**,
**upside/downside**, **margem de segurança** e **3 cenários**
(pessimista/base/otimista). O cálculo é TS puro, offline, e a nota viaja no
backup como qualquer outra. Nada de rede nesta fase.

## Decisões fixadas (não desvie nem pergunte)

- **Um valuation É uma nota.** Nenhuma tabela Dexie nova, nenhuma `version(3)`.
  A fonte de verdade é o corpo markdown da nota. Racional: backup, merge, busca
  e wikilinks já funcionam para notas; uma segunda entidade obrigaria a
  reescrever essas quatro coisas (o CLAUDE.md marca merge/exclusão como área
  delicada).
- **Formato do input:** um único bloco cercado com a linguagem `valuation`
  contendo JSON. Só o **primeiro** bloco da nota é considerado. Exemplo:
  ```valuation
  {
    "ticker": "BBAS3",
    "moeda": "BRL",
    "precoAtual": 22.89,
    "acoes": 5730834000,
    "taxaDesconto": 0.125,
    "lucroBase": 29171564000,
    "crescimento": [-0.15, -0.05, 0.10, 0.15],
    "crescimentoPerpetuo": 0.03,
    "margemSegurancaMin": 0.30
  }
  ```
- **MVP = parse + cálculo + render.** O usuário edita o JSON no editor markdown
  que já existe; o painel recalcula ao salvar/hidratar. NÃO há formulário com
  round-trip de escrita no bloco nesta fase (isso é fase 2 e é a parte fiddly).
- **Matemática (corrige os furos da planilha original):**
  - Lucro projetado ano `t` (1-indexado): `lucro[t] = lucro[t-1]*(1+g[t])`,
    com `lucro[0] = lucroBase`. VP de cada ano: `lucro[t]/(1+i)^t`.
  - Valor terminal no último ano `N`: `lucro[N]*(1+gp)/(i-gp)`, descontado por
    `(1+i)^N`. (Gordon padrão — a planilha acerta essa fórmula.)
  - Market cap intrínseco = Σ VP dos anos + VP do terminal.
  - Preço justo = market cap intrínseco / ações.
  - **Upside = (preçoJusto − precoAtual) / precoAtual** (a planilha divide por
    preçoJusto — nonstandard; usamos /preçoAtual, o retorno potencial de fato).
  - **Margem de segurança:** `veredito = "COMPRA"` só se
    `precoAtual <= preçoJusto * (1 - margemSegurancaMin)`. Entre preço justo e
    esse piso → `"JUSTO"`. Acima do preço justo → `"CARO"`.
  - **3 cenários:** base = inputs do usuário; pessimista = crescimento −5pp em
    cada ano, `gp −1pp`, `i +2pp`; otimista = crescimento +5pp, `gp +1pp`,
    `i −1pp`. (Constantes nomeadas no código, com comentário do racional.)
- **Guard-rails honestos (o diferencial vs a planilha):**
  - Se `i <= gp` → não calcula perpetuidade; retorna erro
    `"taxa de desconto tem que ser maior que o crescimento perpétuo"`.
  - Se `pesoTerminal = VP(terminal)/marketCapIntrínseco > 0.75` → flag
    `avisoPerpetuidade: true` e o painel mostra em amarelo "⚠ X% do valor vem da
    perpetuidade — o valuation é mais chute sobre o futuro distante do que
    análise". Denuncia o viés que faz "tudo dar +50%".
  - Campos ausentes/NaN/negativos onde não faz sentido → erro descritivo, nunca
    NaN silencioso na tela.
- **Criar valuation:** botão "+ Valuation" na sidebar cria uma nota com título
  "Valuation <ticker>", tag `valuation`, e o bloco-template acima já preenchido
  com placeholders. Reusa `createNote`.
- **Sem dependência nova.** JSON.parse nativo; sem lib de gráfico nesta fase.

## Arquivos exatos

Criar:
- `src/valuation/dcf.ts` — tipos (`ValuationInput`, `ValuationResult`,
  `Cenario`) + `calcularValuation(input)` puro + constantes de cenário.
- `src/valuation/dcf.test.ts` — casos: BBAS3 da planilha (bate o preço justo
  ~R$48,7 dentro de tolerância), guard `i<=gp`, flag de perpetuidade, cenários
  ordenados (pess ≤ base ≤ otim), input inválido.
- `src/valuation/parseBlock.ts` — `extrairBlocoValuation(body): {json, ok} |
  null` tolerante (primeiro bloco ```valuation; JSON malformado → erro legível).
- `src/valuation/parseBlock.test.ts` — sem bloco, bloco válido, JSON quebrado,
  bloco não-primeiro ignorado, `\r\n`.
- `src/components/ValuationPanel.tsx` — recebe `note`, extrai+calcula+renderiza;
  estados: sem bloco (não renderiza nada), erro (mensagem), ok (tabela +
  cenários + veredito + aviso de perpetuidade).
- `src/components/ValuationPanel.test.tsx` — render de veredito COMPRA/CARO e do
  aviso.

Tocar:
- `src/App.tsx` — renderizar `<ValuationPanel note={selected} />` entre
  `NoteEditor` e `Backlinks`; botão "+ Valuation" (novo handler `handleNewValuation`).
- `src/db/notes.ts` — helper `createValuationNote(ticker?)` (ou parametrizar
  `createNote` com body/tags iniciais — checar assinatura atual antes).
- `src/index.css` — estilos do painel (tabela, cores de veredito, aviso amarelo).
- `CLAUDE.md` — nova decisão de arquitetura: "valuation é nota + bloco, não
  tabela; por quê".

## Ordem de implementação

1. `dcf.ts` + `dcf.test.ts` (pura, sem UI — PLAYBOOK: testar partes puras 1º).
   Verde antes de seguir.
2. `parseBlock.ts` + teste.
3. `ValuationPanel.tsx` + teste (usa 1 e 2).
4. Fiação em `App.tsx` + `notes.ts` + CSS.
5. `npm run lint && npm run typecheck && npm test && npm run build` verde.
6. Verificação E2E pela skill `verify` (Chromium headless no preview): criar
   valuation, ver painel, quebrar o JSON e ver erro, zerar crescimento e ver
   veredito mudar. Capturar evidência.
7. Atualizar CLAUDE.md.

## Edge cases (com o porquê)

- **`i <= gp`:** perpetuidade de Gordon diverge/fica negativa → número absurdo
  na tela. Guard explícito (a planilha não tem — é uma armadilha real).
- **`\r\n` no corpo:** regex do bloco tem que tolerar CRLF (PLAYBOOK item 5).
- **Nota diária / nota comum sem bloco:** painel não renderiza nada — não pode
  vazar erro em nota que não é valuation.
- **JSON malformado enquanto o usuário digita:** mostrar "JSON inválido: <msg>"
  em vez de sumir/quebrar. Autosave em debounce → o painel recalcula na
  hidratação por `updatedAt`, sem estado próprio de input.
- **Ações/lucro em notação diferente (US vs BR):** entrada é JSON numérico puro
  (ponto decimal), campo `moeda` só rotula a exibição. Documentar no template.
- **Números gigantes (market cap em bilhões):** formatar com
  `Intl.NumberFormat` pela `moeda`; não deixar `1.23e10` na tela.
- **Backup/restore:** nada a fazer — é nota. Mas incluir 1 probe no E2E:
  exportar, limpar, importar, o bloco continua calculando.

## Critérios de aceitação (verificáveis)

- `npm test` passa incluindo: preço justo de BBAS3 dentro de ±2% de R$48,71
  (mesmos inputs da planilha), guard `i<=gp`, flag de perpetuidade quando
  terminal > 75%, cenários ordenados.
- `npm run lint && npm run typecheck && npm run build` verde.
- No preview (E2E, evidência capturada):
  1. "+ Valuation" cria nota com bloco template e o painel aparece.
  2. Inputs da planilha → painel mostra preço justo ~R$48,7 e veredito COMPRA.
  3. Trocar crescimento para negativo forte → veredito vira CARO/JUSTO.
  4. Corromper o JSON → painel mostra erro legível, app não quebra.
  5. Definir `taxaDesconto` ≤ `crescimentoPerpetuo` → erro de guard, não NaN.
