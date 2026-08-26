# AUDITORIA — Caminho 3 (Espaço do Rodolfo + Barney)

Última revisão: 2026-08-25 · Repositório: `Flowfoods/flowfoods` (`flowfoods-portal`)
Branch: `claude/rodolfo-barney-cadence-bc7dcy`

---

## ✅ Achado #1 — RESOLVIDO: o portal já existia

A primeira rodada não achou o repo `portal-flowfoods` que o Master Prompt nomeia
e entregou o núcleo num subtree isolado dentro do `portal-bibi`. O Rodolfo
corrigiu: o portal da FlowFoods **já existe** e é
`Flowfoods/flowfoods` → https://consultoriaflowfoods.com.br

O Caminho 3 foi movido para cá. É um Next.js 14 App Router + React 18 +
Tailwind, site institucional estático, sem banco e sem back-end até então.
O `/rodolfo` acrescenta a primeira camada de dados do projeto.

**Nada do `portal-bibi` foi tocado** — aquele subtree continua lá, agora
redundante; pode sair num commit à parte quando o Rodolfo confirmar.

---

## ✅ Achado #2 — RESOLVIDO: o `@` do Instagram

`mensagens.md` e o Master Prompt diziam `@rrodolfoac`; o site em produção dizia
`flowfoods.rj`. Toda mensagem de abordagem carrega essa linha, então o handle
errado mandaria o dono do restaurante para o lugar errado bem no ponto em que
ele foi conferir quem é o Rodolfo.

**Confirmado por ele em 25/08: é `@rrodolfoac`.** Corrigido em `constants.ts`
(rodapé e CTA) e em `seo-schema.ts` (o `sameAs` do JSON-LD, que é o que o Google
usa para casar a entidade com o perfil).

Ao abrir o `seo-schema` apareceram mais três valores divergentes na mesma
estrutura: o LinkedIn apontava para `rodolfo-flowfoods` (o rodapé e o Master
Prompt dizem `rodolfo-cavalcante`) e o domínio era `flowfoods.com.br` em `@id` e
`url`, sendo que o site roda em `consultoriaflowfoods.com.br`. Mesma classe de
defeito: contato duplicado em dois arquivos, divergindo com o tempo. O schema
passa a ler de `CONTACT_INFO` — uma fonte só.

---

## 🔴 Achado #3 — Nenhuma credencial de infraestrutura

Ausentes: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_SETUP_TOKEN`, `EVOLUTION_*`,
`RODOLFO_WHATSAPP`, `ANTHROPIC_API_KEY`, `DOKPLOY_*`, `HOSTINGER_*`.

Consequência prática, benigna por desenho: **sem `EVOLUTION_API_URL` /
`EVOLUTION_API_KEY` o portal entra em dry-run sozinho** (`criarWhatsAppService`)
— percorre dedup, validação, tetos e outbox, e faz zero chamadas de rede. Dá
para montar o lote, ler cada texto renderizado e treinar o fluxo inteiro sem
número conectado.

Continua bloqueado: migration aplicada, envio real, classificação por IA, deploy
e criação da instância.

---

## 🟡 Achado #4 — A marca do site diverge do Master Prompt

| Master Prompt | `tailwind.config.ts` / `layout.tsx` em produção |
|---|---|
| Syne 800 (display) | **Playfair Display** |
| DM Sans 300 | DM Sans ✅ |
| Vermelho `#EA1D2C` (único neon) | `primary #b91c1c` · `bright #dc2626` |
| Preto `#0A0A0A` · Creme `#F5F0EB` | `footer #0A0A0A` ✅ · superfícies `#FAFAF9` / `#F5F5F4` |
| Tagline obrigatória | ausente do `metadata` |

O `/rodolfo` usa os tokens **do repositório**, não os do prompt: uma área interna
com fonte e vermelho diferentes do site seria uma segunda marca dentro da mesma
casa. A assinatura das mensagens (`— Rodolfo, FlowFoods. Gastronomia que flui.
Negócio que cresce.`) segue exata, porque essa é regra de copy e tem teste.

Não mexi no site institucional. Item 8 das pendências.

---

## 🟡 Achado #5 — Cases com números específicos, sem fonte no repo

O Master Prompt é explícito: *"Nunca inventar números, depoimentos, cases, logos
de clientes ou resultados. Sem prova = `TODO_RODOLFO`."*

`src/lib/constants.ts` publica hoje, no ar: *"+45% receita em 6 meses"* (Bibi
Sucos), *"Ticket médio +R$ 80"* e *"Taxa de repetição: 40%"* (Balada Mix),
*"Tempo de resposta: 5 min (era 45 min)"*.

Não são meus e **não os toquei** — mas são exatamente a categoria que a regra
cobre, numa página pública. Vale conferir se cada um se sustenta. Item 8.

---

## 🟢 Achado #6 — Bug pego pelo build: `useActionState` não existe no React 18

Os formulários saíram com `useActionState` (React 19 / Next 15). Este repo é
**Next 14.2 + React 18.3**. O `next build` compila assim mesmo — o erro é
`Attempted import error`, não falha de build — e o formulário quebraria só na
hora em que o Rodolfo clicasse em salvar.

Corrigido para `useFormState` + `useFormStatus` do `react-dom`, com um
`BotaoSubmit` separado (o `useFormStatus` só enxerga o `<form>` acima dele).
Fica registrado porque é o tipo de defeito que passa por typecheck e por build e
só aparece na mão do usuário.

---

## 🟢 Achado #7 — `tsconfig.json` sem `target`

O `tsc` caía no default (ES5) e reprovava `\p{...}` em regex e iteração de
`Set`/`Map`. O Next compila com SWC e nunca reclamou; só o `tsc --noEmit`
quebrava. Adicionado `"target": "ES2022"`, coerente com o `lib: esnext` que já
estava lá. É a única alteração em arquivo pré-existente do repo, fora do
`package.json`.

---

## 🟢 Achado #8 — Duas correções contra o `montar_pacote.py` (mantidas)

- **`limpa()` deixa traço órfão.** `"Katsuo - Campo Grande"` → `"Katsuo -"`,
  porque `" Campo Grande"` é cortado antes e o `" - "` já não casa. Vai para o
  gancho, que é a primeira linha que o dono lê.
- **Falta o ângulo do Centro.** `mensagens.md` manda trocar por giro de almoço e
  ticket executivo; `dor()` decide só por categoria.

Corrigidos aqui, com patch pendente para o script (item 7).

---

## 🟢 Achado #9 — Duas regras do anti-ban que o Master Prompt não cobria

`whatsapp-ban-prevention.md` é a única fonte que fala em **teto de 3 emojis** e
**proibição de encurtador**. O prompt manda a fonte mais restritiva vencer, então
viraram `R7_EMOJIS` e `R8_LINK_ENCURTADO`. Nos outros cinco pontos o Barney já é
mais apertado — em intervalo, ~40× (120 s contra 2–3 s), o que é correto: o
anti-ban foi escrito para mensagem transacional a quem tem o número salvo; aqui é
abordagem fria para desconhecido.

---

## 🔴 Achado #10 — O dry-run inutilizava o lote do dia

**O pior bug encontrado, e o fluxo do próprio RUNBOOK o acionava.**

O dry-run persiste a mensagem no outbox para o Rodolfo poder ler o texto como
sairia. Só que usava o **mesmo `dedupKey`** do envio real. Resultado: conferir o
lote antes de aprovar ocupava a chave do dia, e o envio de verdade era recusado
por dedup — silenciosamente, com a fila reportando "nada elegível".

E o RUNBOOK manda rodar dry-run antes de aprovar, todo dia.

Corrigido com `dedupKeyEnvioDryRun` (prefixo `dry:`), com teste de regressão que
simula e depois envia de verdade o mesmo lead/toque/dia.

---

## 🔴 Achado #11 — O dry-run avançava a cadência de verdade

Da mesma família. Depois de simular, `registrarEnvioNoLead` rodava: o lead virava
`EM_CADENCIA`, o enrollment marcava `toqueAtual: D0` e agendava o D+4 — **sem
nada ter sido enviado**. O D0 real nunca mais seria proposto.

Agora o dry-run só grava um `LeadEvent` do tipo `dry_run`. Simular não toca no
estado da cadência.

---

## 🟡 Achado #12 — Um lead ruim travava o lote inteiro

`dispararProximo` fazia `return` em qualquer falha. Um lead com `avaliacoes: 0`
reprova no `R5_GANCHO_COM_DADO_REAL` — e a fila do dia parava ali, sem tentar os
29 seguintes.

O `ResultadoEnvio` ganhou `escopo: 'ITEM' | 'GLOBAL'`. Falha do item (validador,
dedup) → pula para o próximo. Falha do número ou do dia (teto, janela,
stop-loss, Evolution fora) → para, porque insistir só somaria falha. Seis testes
cobrem a classificação.

---

## 🟡 Achado #13 — O webhook inflava a taxa de entrega

`tratarUpdate` buscava por `evolutionMessageId` sem filtrar direção. Mensagens
**recebidas** também gravam esse id, então um `MESSAGES_UPDATE` de uma resposta
marcaria a mensagem de entrada como ENTREGUE e somaria em `DailyCounter.entregues`.

Consequência: a taxa de entrega passa de 100% e o stop-loss — que existe
justamente para perceber bloqueio silencioso — fica cego. Corrigido com
`direction: 'OUT'` na busca.

---

## 🟡 Achado #14 — O fallback do próximo toque reenviava a abertura

`c.toqueAtual === 'D0' ? 'D4' : c.toqueAtual === 'D4' ? 'D10' : 'D0'` — um
enrollment com `toqueAtual: 'D10'` caía no `else` e recebia **D0 de novo**. Hoje
o `status: CONCLUIDA` impede isso na prática, mas é uma trava dependendo de outra.

Trocado por uma tabela `PROXIMO_TOQUE` onde a ausência de próximo é explícita.

---

## 🟢 Achado #15 — Token de import compartilhado com o do admin

`/api/leads/import` usava o `ADMIN_SETUP_TOKEN`. Esse segredo viaja num script
de terminal (o `--push`) e acaba em histórico de shell; o token que define a
senha do admin não deve compartilhar essa exposição.

Agora existe `LEADS_IMPORT_TOKEN`, com fallback para o antigo para não quebrar
quem ainda não separou.

---

## Estado das fases

| Fase | Estado | Observação |
|---|---|---|
| F0 — descoberta | ✅ | Inventário Dokploy/Evolution **bloqueado** (achado #3) |
| F1 — leads | ✅ | Importação, lista, filtros, `POST /api/leads/import` |
| F2 — templates e cadência | ✅ | Completa |
| F3 — worker e disparo | ✅ | Envio **real** pendente de credencial; dry-run funciona |
| F4 — webhooks e inbox | ✅ | Rota, pipeline, classificação e rascunho |
| F5 — métricas e config | ✅ | Funil, cortes, saúde do número, custo de IA e CSV |
| F6 — produção | ⛔ | **Bloqueado por rede** — o proxy recusa o túnel até a VPS (curl e Chromium) |

---

## Verificação

```
184 testes · 9 arquivos · todos verdes
tsc --noEmit        · limpo
next build          · compila, 15 rotas, zero erro de import
migration inicial   · 442 linhas, ZERO DROPs (só aditiva)
```
