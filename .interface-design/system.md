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
- **A conta** (assinatura do ERP de custo): custo por unidade em Gelasio +
  a conta por extenso em 12 px tabular ("R$ 89,90 + R$ 5,00 frete ÷ 5 kg =
  R$ 18,98/kg"), igual na prévia, na lista, no detalhe e no histórico. Sem
  preço = selo "Sem preço" (tom atenção), nunca R$ 0,00.
- **Barra de lista** busca + Filtrar na mesma linha, selects e marcadores na
  grade abaixo (2 colunas no celular, uma linha ≥ 1024); estado na URL;
  "Limpar" só com filtro ativo.
- **Formulário de cadastro** em tela própria (max 768), painéis por assunto
  ("O que é", "Como você compra"), resumo de erros quando há mais de um,
  Cancelar (fantasma) + ação principal à direita; bloqueado = fieldset
  desabilitado com o motivo.
- **Foto de cadastro** (ficha técnica, 1.2): miniatura 44 px raio 7 com borda
  `linha` na lista; 4:3 raio 10 no detalhe e no formulário; sem foto = quadro
  `forte` do mesmo tamanho (a linha não pula). Foto e descrição no topo do
  detalhe: quem opera bate o olho e sabe o que é.
- **Custo incompleto**: selo "Custo incompleto" (tom atenção) no lugar do
  número na lista; no detalhe, o parcial com "sem contar X (sem preço)".
- **Foco** anel 3 px `acento`, folga 4 px (campo: 1 px). **Movimento** 160 ms
  hover, 220 ms entrada (8 px); `prefers-reduced-motion` zera.

## Decisões

| Decisão | Razão | Data |
|---|---|---|
| Só bordas + uma superfície | ferramenta densa; sombra não carrega informação | 2026-10-16 |
| #C41522 no botão, #EA1D2C no acento | #EA1D2C com branco dá 4,47:1, abaixo de AA em 14 px | 2026-10-16 |
| Sem vidro, gradiente, glow, Inter do kit | identidade FlowFoods e avoid-ai-design (K3, C1) | 2026-10-16 |
| Formulários em tela própria, não painel lateral | sem JS, tela cheia no celular, voltar funciona | 2026-10-16 |
| Máscara na borda do trilho de filtros no celular | indício de rolagem (funcional, não decorativa) | 2026-10-16 |
- **A cascata (1.3)**: item de pré-preparo = nome com link + selo neutro
  "Pré-preparo"; embaixo, "De onde vem: R$ X por kg (R$ total ÷ rende)" em
  `<details>` que abre a receita dele (filete esquerdo `linha-forte`, 12 px,
  custo de cada item). Fator de correção: quantidade LIMPA no campo, "Peso
  bruto 354 g para 300 g limpos (fator 1,18)" em 12 px suave. Incompleto em
  cascata = selo "Incompleto" (atenção) e a frase com o insumo que falta.
- **Validade por conservação (1.4)**: bloco "Onde fica e quanto dura", o
  MESMO na ficha e no insumo — 4 linhas (marcar + ícone funcional da
  conservação + nome; número inteiro; dias/horas; "Principal" em rádio, só
  entre as marcadas na ficha), cabeçalho de coluna a partir de 640 px. No
  detalhe, lista com ícone, nome, "principal" em 12 px suave e a validade em
  600 tabular à direita; nas listas, a frase "Refrigerado: 3 dias · Congelado:
  30 dias". Não informada = texto (atenção no pré-preparo), nunca um prazo
  inventado. Ícones: Seco `Package`, Pista fria `ThermometerSnowflake`,
  Refrigerado `Refrigerator`, Congelado `Snowflake`, sempre com a palavra.
- **Compras (1.5)**: nota em tela própria (max 896) com três painéis ("A
  nota", "Itens", "Frete e total"); item = insumo, embalagem (padrão, outra
  ou "A granel (por kg)"), quantidade e o VALOR TOTAL DO ITEM; embaixo de cada
  item, em 12 px tabular, "4,54 kg · R$ 65,54/kg com frete · hoje R$ 57,27/kg".
  Total digitado com a conta ao vivo ("… = R$ 471,50 · confere com a nota" em
  `ok`, ou "diferença de R$ X" em `atencao`). Dois envios: "Conferir o
  impacto" (secundário, só prévia) e "Lançar nota" (primário). A prévia é um
  painel com subtítulo "Nada foi gravado" e antes → depois por insumo e por
  ficha, com a palavra "sobe"/"desce" (cor só reforça). Detalhe: total em
  Gelasio, tabela Corporativo (quantidade, valor, frete, custo por unidade)
  e o selo "vale no custo" (ou "vale a de DD/MM"); cancelar pede o motivo na
  própria tela. No insumo: "Custo de referência" com subtítulo "Último preço
  pago" ou "Preço cadastrado…" e o painel "Preço pago" (compras, canceladas
  riscadas, último preço por fornecedor com "mais barato").
- **Estoque (1.6)**: estado da loja em selo com palavra ("Não aberto"
  neutro, "Em contagem" atenção, "Aberto" ok); andamento com a barra fina e
  "1 de 13 contados · faltam 12". **Contagem no celular**: lista agrupada por
  conservação (ícone funcional + nome + "3 de 8"), busca e abas
  Faltam/Contados/Todos fixas sob o topo; item = nome 15/600 + "Não tem" (ou
  Salvando…/Salvo/Falhou · tentar de novo) à direita; campos de 48 px, número
  18/600 alinhado à direita, rótulo visível ("Fechadas · de 2,27 kg" /
  "Solto") e a unidade em segmentado kg|g; embaixo, a conta em 12 px tabular
  ("= 4,89 kg · Teresa, 06:43"). Conflito = quadro neutro com o número e o
  nome de quem contou e dois botões. Rodapé fixo: "Faltam N de T" + barra +
  "Conferir e concluir" (só quem ajusta saldo). **Saldo**: três métricas
  (valor de hoje em Gelasio, insumos com saldo, valor fotografado na
  abertura), tabela Corporativo (insumo, onde fica, quantidade, custo de
  referência, valor; sem preço = selo + "pendente") e o **livro do estoque**
  (quando, insumo, selo do tipo — "Estorno · compra" em atenção —, quantidade
  com sinal, saldo "antes › depois", origem com link da nota).
- **Contagem do dia a dia (1.7)**: estado da contagem em selo com palavra
  ("Em contagem"/"Fechou sem aplicar" atenção, "Pronta para conferir"
  neutro, "Aplicada"/"Fechou sozinha" ok). **Planejar**: filtros em trilho
  (lugar · quais), lista por lugar com a linha inteira clicável (caixa 20 px,
  48 px de altura), apoio "Curva A · contado em 06/10 · venceu 13/10" (atenção
  quando vencido), quem está noutra contagem desabilitado com o nome dela;
  rodapé fixo com "Começar a contagem (N)". **Cobertura × piso**: barra de
  8 px com a marca do piso (filete de 2 px em `texto`), número tabular à
  direita ("47,8 % · piso 80 %") e "atinge"/"abaixo do piso" escrito.
  **Conferir**: três métricas (contados, diferença em R$ com o sinal
  tipográfico, para conferir), tabela Corporativo (livro ao contar, contado,
  diferença com "R$ X a menos · confira" em atenção, depois de contar com
  link da nota, fica em) que rola dentro do painel; "Bateram" recolhido em
  `<details>`; painel lateral ≥ 1280 px. "Para o piso" em 12 px atenção ao
  lado do nome na contagem e selo atenção na lista do período.
