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

## 🔴 Achado #2 — O `@` do Instagram na abordagem não bate com o do site

**É o achado de maior impacto operacional desta rodada.**

| Fonte | Perfil |
|---|---|
| `ledsflowfoods/references/mensagens.md` (fonte da verdade dos textos) | **`@rrodolfoac`** |
| Master Prompt (bloco "Fatos") | **`@rrodolfoac`** |
| `src/lib/constants.ts` do site em produção | **`flowfoods.rj`** |

Toda mensagem de abordagem carrega *"Se quiser me conhecer antes de responder:
@rrodolfoac no Instagram e consultoriaflowfoods.com.br"*. Se o perfil comercial
correto for `@flowfoods.rj`, **30 mensagens por dia mandam o dono do restaurante
para o lugar errado** — e a prova social, penúltimo bloco da mensagem, vira um
beco sem saída.

**O que foi feito:** mantive `@rrodolfoac`, porque é o que as duas fontes
normativas dizem. **Não** alterei `constants.ts` — mexer no site institucional
por dedução seria pior que a inconsistência.

**Ação do Rodolfo:** confirmar qual perfil vai na abordagem. Se for
`@flowfoods.rj`, a correção começa em `mensagens.md` (a fonte) e desce para
`render.ts`. Item 3 de `PENDENCIAS_RODOLFO.md`.

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

## Estado das fases

| Fase | Estado | Observação |
|---|---|---|
| F0 — descoberta | ✅ | Inventário Dokploy/Evolution **bloqueado** (achado #3) |
| F1 — leads | ✅ | Importação, lista, filtros, `POST /api/leads/import` |
| F2 — templates e cadência | ✅ | Completa |
| F3 — worker e disparo | ✅ | Envio **real** pendente de credencial; dry-run funciona |
| F4 — webhooks e inbox | ✅ | Rota, pipeline, classificação e rascunho |
| F5 — métricas e config | 🟡 | Config completo; métricas são as do painel, sem cortes nem CSV |
| F6 — produção | ⛔ | **Bloqueado** — sem credencial não há deploy nem instância |

---

## Verificação

```
173 testes · 8 arquivos · todos verdes
tsc --noEmit        · limpo
next build          · compila, 12 rotas, zero erro de import
migration inicial   · 441 linhas, ZERO DROPs (só aditiva)
```
