# PLAYBOOK — Método de trabalho destilado desta sessão

> **Como usar:** copie a seção "Instruções para o modelo" para o `CLAUDE.md` de
> qualquer projeto (ou para `~/.claude/CLAUDE.md` na sua máquina, valendo para
> todos os projetos). O Claude Code lê esses arquivos automaticamente no início
> de cada sessão — o método vira comportamento padrão, sem você precisar pedir.
> Os "prompts prontos" no final são para colar quando quiser invocar cada
> prática explicitamente.

---

## Instruções para o modelo (copie daqui para baixo)

### 1. Plano antes de código

Para qualquer tarefa que envolva mais de ~3 arquivos ou uma decisão de
arquitetura, NÃO comece a implementar. Primeiro escreva um `PLAN-<slug>.md` com
esta estrutura, e pare para revisão:

```
# PLAN-<slug> — <título>
**Depende de:** ... **Bloqueia:** ...
## Objetivo            (1 parágrafo: o que existe ao final que não existia antes)
## Decisões fixadas    ("não desvie nem pergunte": stack, nomes, formatos —
                        toda ambiguidade resolvida AQUI, não durante o código)
## Arquivos exatos     (lista completa: criar/tocar)
## Ordem de implementação  (passos numerados; testes das partes puras primeiro)
## Edge cases          (os não-óbvios: fusos horários, corridas, idempotência,
                        limites, encoding — com o PORQUÊ de cada um)
## Critérios de aceitação  (verificáveis por comando ou ação concreta no app,
                        nunca "deve funcionar corretamente")
```

Racional: corrigir um plano custa segundos; corrigir código errado custa horas.
O plano também serve de contrato — se algo não está nele, é mudança de escopo.

### 2. Verificação na superfície real, não em proxy

"Os testes passam" NÃO é verificação. Antes de commitar qualquer mudança com
superfície de runtime:

1. Rode o app de verdade (build de produção, não dev server, quando o
   comportamento difere — service workers, por exemplo, só existem no build)
2. Dirija o fluxo afetado pela interface real (navegador/CLI/API — o que o
   usuário usa), não por import direto de função
3. Inclua ao menos um PROBE fora do caminho feliz: entrada malformada, ação
   repetida, corrida entre duas operações, estado obsoleto
4. Capture evidência (saída, screenshot) — memória não é evidência
5. Reporte com veredito explícito: PASS / FAIL / BLOCKED — e liste o que NÃO
   foi verificado e por quê. "3 de 4 passaram" é FAIL até explicar o quarto.

### 3. Persistir aprendizado como configuração

Conhecimento que morre com a sessão é desperdício. Ao descobrir qualquer coisa
que uma sessão futura vai precisar:

- Receita de build/execução/teste que funcionou → `.claude/skills/<nome>/SKILL.md`
- Armadilha não-óbvia (o erro enganoso, a corrida, o caminho errado que parece
  certo) → registre na skill com o sintoma exato, não só a solução
- Decisão de arquitetura com racional → comentário no código no ponto da decisão
  ("por que assim e não do outro jeito"), para ninguém "consertar" o que está
  certo
- Convenções e comandos do projeto → `CLAUDE.md` na raiz

### 4. Diagnosticar antes de corrigir

Diante de um erro, NUNCA tente correções em sequência para "ver se passa".
Primeiro estabeleça a causa com evidência (logs completos, reprodução mínima,
bisecção do problema). Distinga três categorias antes de agir:
- bug real no código
- artefato do ambiente/teste (ex.: automação mais rápida que a UI)
- limitação externa (permissão, rede, serviço) que exige ação humana

Cada categoria tem correção diferente; confundi-las desperdiça horas.

### 5. Checklist de edge cases que separam código de produção de protótipo

Verifique proativamente em qualquer feature nova, sem esperar ser pedido:

- **Datas:** UTC vs local (no Brasil, UTC-3, chaves de data UTC "viram amanhã"
  às 21h); nomes de arquivo com data; testes com TZ explícito
- **Texto em português:** busca precisa dobrar acentos (cerebro ↔ cérebro),
  dos DOIS lados (índice e consulta); normalização `\r\n`
- **Concorrência:** get-or-create precisa de transação, não check-then-insert;
  duas abas/chamadas simultâneas; debounce com flush em unmount (senão perde
  as últimas teclas)
- **Idempotência:** rodar duas vezes não pode duplicar (imports, criações)
- **Fronteiras de segurança:** conteúdo do usuário nunca vira HTML executável;
  saber QUAL camada é a sanitização e não enfraquecê-la
- **Encoding:** parênteses quebram links markdown e encodeURIComponent NÃO os
  codifica; caracteres especiais em títulos/URLs
- **Estado destrutivo:** soft-delete com tombstone > hard delete; exclusões
  precisam sobreviver a backup/restauração/merge
- **Falha silenciosa:** operações que falham sem erro (ícone 404 = sem prompt
  de instalação; busca antes do índice pronto = "sem resultados")

### 6. Commits e comunicação

- Commits pequenos, cada um verificado, mensagem dizendo O QUE e POR QUÊ
  (decisões e armadilhas, não narração do diff)
- CI desde o primeiro commit — verde é o estado normal, não o objetivo
- Reporte liderando com o resultado ("o que aconteceu"), depois o suporte;
  falhas ditas com clareza, sem eufemismo; o que ficou de fora, declarado

---

## Prompts prontos (colar quando quiser invocar cada prática)

**Planejar:**
> Escreva um PLAN-<nome>.md seguindo o formato do PLAYBOOK.md: decisões
> fixadas (resolva TODA ambiguidade agora), arquivos exatos, ordem de
> implementação, edge cases não-óbvios com o porquê, e critérios de aceitação
> verificáveis por comando. Não implemente nada ainda.

**Executar:**
> Execute o PLAN-<nome>.md exatamente como escrito. Se encontrar algo que o
> plano não previu, pare e me mostre antes de desviar.

**Verificar:**
> Não me diga que funciona — prove. Rode o build de produção, dirija o fluxo
> pela interface real, inclua probes fora do caminho feliz, capture evidência
> e reporte PASS/FAIL com o que NÃO foi verificado.

**Encerrar sessão (alimenta a próxima):**
> Antes de terminar: (1) atualize/crie a skill do projeto com qualquer receita
> ou armadilha nova desta sessão; (2) resuma decisões tomadas, pendências e
> "não faça isso de novo" em um bloco que eu possa guardar.

**Melhorar continuamente (rodar na SUA máquina local, onde ficam os dados):**
> Leia ~/.claude/projects/ e history.jsonl dos últimos 30 dias. Liste: os 5
> pedidos que mais repito, onde gasto turnos corrigindo você, e quais fluxos
> manuais recorrentes deveriam virar skill ou hook. Crie a skill de maior
> impacto.

---

## Template de CLAUDE.md para qualquer projeto

Copie para a raiz de cada repositório seu e preencha. Regra de ouro: o arquivo
existe para a sessão NÃO precisar redescobrir nada — se você explicou algo duas
vezes ao modelo, esse algo pertence aqui. Mantenha curto: só o que é verdade
estável; detalhe volátil vira comentário no código ou skill.

```markdown
# <NomeDoProjeto> — contexto para o Claude Code

<1 parágrafo: o que o projeto é, para quem, e a stack em meia linha.>

**Método de trabalho:** siga o PLAYBOOK.md (plano antes de código, verificação
na superfície real, persistir aprendizado).

## Comandos

\`\`\`bash
<instalar>          # ex.: npm ci
<rodar em dev>      # e qualquer diferença dev × produção que engane (ex.: SW só no build)
<suíte completa>    # lint && typecheck && test && build — a definição de "verde"
<rodar de verdade>  # como servir/executar o build real para verificação E2E
\`\`\`

## Decisões de arquitetura (NÃO "consertar" sem entender o porquê)

<Liste cada decisão deliberada que PARECE errada ou melhorável à primeira
vista, com o racional. É a seção mais valiosa do arquivo: impede que uma
sessão futura desfaça uma escolha correta. Formato:>
- **<decisão>**: <porquê, incluindo o que quebra se mudar>

## Armadilhas conhecidas

<Erros enganosos já diagnosticados: o SINTOMA exato + a causa real + o que
fazer. Ex.: "erro X ao rodar Y = ambiente, não código; solução Z".>

## Convenções

<Só as que divergem do óbvio: estilo, nomes, estrutura de pastas, idioma de
comentários/commits, como escrever testes aqui.>

## Fluxo de git/deploy

<Branch de trabalho, como abrir PR, o que dispara deploy, URLs de produção.>
```

Sinais de que o CLAUDE.md está funcionando: as primeiras mensagens das suas
sessões encolhem; o modelo cita as decisões em vez de contradizê-las; você
para de repetir instruções. Sinal de que está inchado: o modelo ignora partes
— corte o volátil, mantenha o estável.
