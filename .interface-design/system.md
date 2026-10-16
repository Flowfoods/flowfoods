# Design System — ERP FlowFoods Barney (shell /erp e /rodolfo)

## Direção

**Personalidade:** precisão e densidade (central de operação de restaurante),
com a identidade editorial FlowFoods.

**Base:** quente (creme e preto, nunca cinza azulado). **Profundidade:** só
bordas finas + UMA camada de superfície (`painel` sobre `fundo`); sombra só no
que flutua (diálogo, gaveta, popover).

Fontes: geometria e comportamento do kit Kairu Dark "pulso"
(`library:design-central-escura`, `src/design-kit.css` + `src/DesignKit.tsx`);
tabelas do Kairu Corporativo; cor e tipo FlowFoods (CLAUDE.md).

## Tokens (`src/components/erp/tokens.css`, escopo `.ff-app`)

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `fundo` | #0E0D0C | #F5F0EB | página |
| `lateral` | #0A0A0A | #EDE6DF | menu lateral |
| `painel` | #161513 | #FCFAF8 | card, tabela, diálogo |
| `forte` | #1F1D1B | #EDE6DF | cabeçalho de tabela, opção marcada |
| `campo` | #090908 | #FFFFFF | campo (inset) |
| `texto` | #F5F0EB | #0A0A0A | texto |
| `suave` | #A39C95 | #625D58 | texto secundário (≥ 5,2:1) |
| `linha` / `linha-forte` | creme 9 % / 18 % | preto 10 % / 20 % | bordas |
| `acao` / `acao-hover` | #C41522 / #D61A27 | #C41522 / #A8111C | botão principal (branco ≈ 6:1) |
| `acento` | #EA1D2C | #EA1D2C | indicador ativo, filete do topo, foco |
| `assinatura` | #F2323F | #C41522 | o "Foods" da marca |
| `erro` / `ok` / `atencao` | #F2323F / #4ADE80 / #F59E0B | #C41522 / #166534 / #92400E | só em selo e texto, sempre com palavra |

Tema: cookie `ff_tema` (claro | escuro | sistema) lido no servidor → `data-tema`.
Cor de módulo (paleta em `src/lib/erp/modulos.ts`) SÓ no quadrado do ícone:
fundo a 14 % (claro) / 22 % (escuro), ícone na cor (escuro: misturado ao creme).

## Tipo

Libre Franklin em tudo; Gelasio só no h1 da página, no número grande e no
título de estado vazio (sempre `lining-nums tabular-nums`). Escala
12 · 13 · 14 · 15 · 18 · 26–30. Mínimo 12 px. Caixa alta só no rótulo de seção
do hub e nos grupos do menu.

## Espaço e raio

Base 4 px: 4 · 8 · 12 · 16 · 24 · 32. Raios: 5 (item do menu), 7 (botão,
campo, selo), 10 (quadrado do ícone 40, segmentado), 14 (card, diálogo).

## Padrões

- **Menu lateral** 232 px (68 recolhido), altura total, borda direita; item
  40 px, ativo = `--ff-ativo` + `inset 2px 0 0 acento`; seletor de módulo no
  topo; grupos com botão `aria-expanded`; fase no rodapé. < 900 px: gaveta.
- **Barra superior** 64 px, borda inferior, sem blur.
- **Botão** 40 px (44 no celular), padding 16, raio 7, 14 px/600. Um
  primário por tela. Variantes: primario, secundario, perigo, fantasma
  (`classeDeBotao`).
- **Campo** 42 px (44 no celular, fonte 16 px), borda `linha-forte`, fundo
  `campo`, rótulo persistente 13 px/500, erro embaixo ligado por
  `aria-describedby`.
- **Card** borda `linha`, raio 14, cabeçalho 48 px com título 13 px/600,
  corpo 16/20.
- **Tabela** linha 44 px, cabeçalho em `forte` 12 px/600, números tabulares à
  direita, sem card em volta de número; no celular, colunas viram linha de
  apoio.
- **Cabeçalho de página** quadrado do ícone 40 + h1 Gelasio 26/30 +
  subtítulo com contexto e contagem + ação à direita + busca/filtros abaixo.
- **Hub** grade 4/3/2; card com ícone, nome 15/600, subtítulo 13; futuro sem
  link, com "Chega na fase X".
- **Foco** anel 3 px `acento`, folga 4 px (campo: 1 px). **Movimento** 160 ms
  hover, 220 ms entrada (8 px); `prefers-reduced-motion` zera.

## Decisões

| Decisão | Razão | Data |
|---|---|---|
| Só bordas + uma superfície | ferramenta densa; sombra não carrega informação | 2026-10-16 |
| #C41522 no botão, #EA1D2C no acento | #EA1D2C com branco dá 4,47:1, abaixo de AA em 14 px | 2026-10-16 |
| Sem vidro, gradiente, glow, Inter do kit | identidade FlowFoods e avoid-ai-design (K3, C1) | 2026-10-16 |
