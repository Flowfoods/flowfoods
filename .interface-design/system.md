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

**Revisão de 21/10/2026 (kits lidos pelo MCP da Kairu):** a referência
principal passa a ser o **Kairu Editorial** (`library:design-estoque-editorial`
v1.2.0): título serifado, tons naturais, separadores delicados, sidebar creme,
número de tabela sem serifa, unidade ao lado do número, trabalho útil na
primeira dobra. **Corporativo** (`library:design-precisao-corporativo` v1.2.0)
segue nas tabelas densas. O **Dark** virou v2.0.0 (vidro, violeta, gradiente,
raio 24) e não é mais base: a geometria "pulso" já adotada fica, o resto não
entra. Acento continua o vermelho FlowFoods (o kit manda preservar a marca).

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
| `erro` / `ok` / `atencao` | #F5525A / #4ADE80 / #F59E0B | #C41522 / #166534 / #92400E | só em selo e texto, sempre com palavra |

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
- **Hub** grade 4 (≥ 1280) e 2 no tablet e no celular; card com ícone, nome
  15/600, subtítulo 13; no celular, compacto (nome 14, descrição em até 3
  linhas, sem os links das abas); futuro sem link, com "Em breve".
- **Caixa "Como funciona"** dentro do `PageHeader`, entre o título e a busca
  (`ContextoDaCaixa`): rótulo 13/600, sem repetir o nome da tela em serifa.
- **Toque** (`pointer: coarse`, tablet e celular): todo alvo volta a 44 px; link
  de texto em tabela e na trilha ganha área de toque de 44 px invisível.
- **Menu**: grupo com um item só vira o item direto (sem cabeçalho).
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
| Referência principal Kairu Editorial; Dark v2 fora | Dark v2 tem vidro e gradiente; Editorial é a identidade FlowFoods | 2026-10-21 |
| Caixa de ajuda abaixo do título | o título vem primeiro; a aula não empurra a tela | 2026-10-21 |
| 44 px por `pointer: coarse` | tablet deitado é dedo, não mouse | 2026-10-21 |
| Hub 2 colunas no celular | Ref.1 do plano vence o kit | 2026-10-21 |
| Erro escuro #F5525A | #F2323F dava 4,42:1 na linha destacada | 2026-10-21 |
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
- **Requisição (1.8)**: **quadro por estado** (kanban do contrato, seção 5):
  colunas Pedidas · Atendidas em parte · Atendidas · Canceladas (as duas
  últimas da semana), 4 / 2 / 1 por linha (≥ 1280 / ≥ 768 / celular); coluna
  sem caixa (só cabeçalho: título 13/600 na cor do estado — atenção, texto,
  ok, suave —, contador tabular e barra de 2 px na mesma cor); cartão =
  `painel` raio 10 com "#12 · Cozinha", até 3 itens (pedido, ou "600 g de
  1 kg" em atenção) e "Caio · 09:21"; **atrasada = filete vermelho de 3 px à
  esquerda + selo "2d de atraso" (erro)** — exceção registrada à regra "card
  sem borda colorida": é o sinal pedido pelo contrato, sempre com a palavra;
  vazia = "Nenhum item nesta etapa" em borda tracejada. **Pedido e entrega no
  celular**: campos de 48 px, número 18/600 à direita, kg|g segmentado de
  104–112 px, rodapé fixo com a contagem e o botão. Entregar mostra "no livro"
  e "no livro fica" (vermelho com "abaixo de zero"). **Divergências**: três
  métricas (sumiu sem requisição em `erro`, pequeno e repetido em `atencao`,
  requisitado a mais neutro), tabela Corporativo com o sumiço em
  quantidade (15/700) e "R$ X sem requisição" embaixo; selo atenção "pequeno
  e repetido · 2× dentro de R$ 5,00"; por setor; abaixo de zero.
- **Custo por canal (1.9)**: painel no detalhe do prato com a tabela
  Corporativo virada — canais nas COLUNAS (Loja · Delivery · iFood, números
  tabulares à direita) e camadas empilhadas nas linhas (Insumos da receita;
  Embalagens com o total e, recuadas 36 px em 13 px suave, cada embalagem com
  o valor e "1 un" embaixo; Taxa do iFood com a conta "23% de comissão + 3,2%
  de pagamento online = 26,2% do preço" sob o rótulo e "a cada R$ 10,00:
  R$ 2,62" sob o valor; rodapé `linha-forte` "Custo do canal" em 600). Camada
  que não se aplica = "—" suave. Taxa sem preço nunca vira R$: o total diz
  "R$ 9,98" e "+ 26,2% do preço" em 12 px embaixo. Incompleto = selo
  "Incompleto"/"Não configurada" (atenção) e a frase do porquê no pé do
  painel. No celular (< 640), um bloco por canal: nome 15/600 + total à
  direita e as camadas em `dl` de 13 px. **Embalagens por canal**: tela
  própria (max 768), um painel por canal com o total ao vivo no acessório do
  cabeçalho, linha = seletor em largura cheia + quantidade (96 px) + unidade +
  valor + lixeira; campos de largura fixa vão num invólucro (o `CAMPO` é
  `w-full`). **Canais de venda**: tabela "o que entra no custo" + painel da
  taxa (duas porcentagens de 112 px e a conta ao vivo num quadro de borda).
- **Preço e margem por canal (1.10)**: o mesmo painel do custo por canal,
  agora "Preço e margem por canal", com duas faixas na mesma tabela Corporativo:
  o que entra (até "Custo do canal" em `linha-forte`) e, depois de outro filete
  `linha-forte` e da linha "Margem-alvo" em `forte/50`, Preço sugerido (600 +
  a conta curta "R$ 11,10 ÷ 0,138" em 12 px, a inteira no `title`, e o botão de
  texto "usar R$ 28,90"), Preço de venda (campo de 112 px à direita, placeholder =
  o sugerido, "vazio = o sugerido"/"seu preço" em 12 px), Margem bruta e Margem
  líquida (15/600) com "% do preço" embaixo e o farol em selo com a palavra (no
  alvo · abaixo do alvo · prejuízo). Rótulos das linhas com a fórmula em 12 px
  ("bruta − taxa do canal"). "Salvar preços" é secundário (o primário da tela é
  "Editar ficha"). Celular: bloco por canal com o farol ao lado do nome e o
  campo de 128 px. **Dica**: explicação longa vai num `<details>` com
  `CircleHelp` 16 px + rótulo ("Como a conta é feita"), abre no fluxo. **Lista
  de fichas com margem**: grupo "Margem líquida" (cabeçalho de duas linhas,
  `colgroup`) com Loja · Delivery · iFood a partir de 1024 px; sem preço
  próprio = cinza sem farol; abaixo do alvo = palavra em atenção embaixo.
  **Margens-alvo**: linha = canal + ajuda, campo de 96 px + "%", e o exemplo ao
  vivo "Prato de R$ 10,00: sai a R$ 33,34" à direita (14rem).
- **Farol (2.4)**: 5 faixas fixas (azul · verde · amarelo · laranja · vermelho), cor SÓ no glifo e na palavra
  do indicador (nunca borda de card, fundo de linha, cabeçalho ou botão). Glifo = régua de 5 quadrados de 8 px
  com a casa da faixa cheia (a posição diz a faixa em cinza); palavra e desvio sempre juntos; sem dado que feche,
  régua vazia e o motivo escrito. Tokens `--ff-farol-*` (claro #2F5D8A #166534 #6F6300 #B04400 #C41522; escuro
  #8DB4DC #5DBB84 #E2C55A #F0913A #F5424D), contraste ≥ 4,5:1 sobre painel, fundo e linha de resultado.
  Painel no topo do DRE no kit Bento da Kairu: estrutura modular, sem a paleta tonal do kit.
- **Orçamento de compra (2.5)**: bloco com o número grande em Gelasio ("ainda cabe no período" em suave, "passou do
  orçamento" em `erro` com a palavra), a conta por extenso em 13 px tabular ("Meta do CMV 30,0 % × R$ 41.000,00 de receita
  prevista = R$ 12.300,00 de teto − R$ 10.000,00 já comprados = R$ 2.300,00") e o ritmo com o `Farol` da 2.4 abaixo de um
  separador. Quem não vê a receita: só o número, com "Pelo teto arredondado para baixo" uma vez no subtítulo. Abaixo do número da
  rede, em `erro`, quem já passou ("a sobra de outra loja não cobre"); número e "Por loja" lado a lado a partir de 1280 px. "Por loja" em tabela Corporativo a partir de
  1024 px, cartões abaixo. Na prévia da nota, um subtítulo "Orçamento de compra" no mesmo painel; no detalhe, `Aviso`
  (tom alerta só quando passou). Nunca bloqueia: o botão de lançar segue.
- **Lista do dia (3.2)**: o dia num segmentado de links (Ontem · Hoje · Amanhã, `aria-current`) + "Outro dia" (campo de data e
  "Abrir", GET). Dois painéis lado a lado a partir de 1280 px ("O que produzir" + "Pré-preparos que entram nas receitas" à esquerda,
  5 fr; "Matéria-prima" + "Para quem compra" à direita, 6 fr). **Matéria-prima em três colunas** (vai usar · tem · comprar), tabela
  Corporativo a partir de 768 px (números `whitespace-nowrap`, à direita), cartão por insumo abaixo (nome 15/600 + "falta X" à direita;
  `dl` de 2 colunas em 13 px). Comprar SEMPRE com a palavra: "falta 500 ml" (600, `erro`) ou "dá" (600, `ok`); saldo negativo
  "−550 ml" + "abaixo de zero" (12 px, `erro`) embaixo do número; sem saldo apurado = "—" (com texto para o leitor de tela) e a frase
  do motivo UMA vez no topo do painel, nunca "0". Embaixo do nome, em 12 px suave: "em <pré-preparos>", "≈ 2 embalagens de 900 ml"
  (só com conteúdo declarado) e, para quem vê custos, "≈ R$ X"; "sem preço" no lugar do valor. Resumo do painel em uma linha ("3
  insumos faltam · 3 dão · 1 abaixo de zero no livro"). **Pré-preparos que entram nas receitas**: nome 15/600, "vai usar · tem · na
  lista" em 13 px, "falta produzir X" (600, `atencao`) ou "dá", e "Pôr na lista" (secundário, 44 px). **O que produzir**: as linhas que
  viraram lote em lista de leitura (nome + quantidade, "no estoque agora", selo da etapa e "Lote AAMMDD-NN" sublinhado, o conjunto é o
  link de 44 px); as em aberto no formulário de celular (seletor em largura cheia; quantidade de 48 px, 18/600, `inputmode=decimal`,
  unidade em caixa de 72 px; "Tirar" fantasma), "Salvar a lista" e, numa caixa de borda, "Gerar os N lotes" (o primário quando não há
  mudança por salvar; com mudança, espera e diz por quê). **Formulário com server action**: o espaçamento (`space-y`) mora numa div
  interna, nunca no `<form>` (o React põe os campos ocultos da action no começo dele e o primeiro bloco ganhava margem).
  Rodada 1 dos fiscais: a partir de 640 px a linha em aberto é UMA fileira (seletor flexível; quantidade de 112 px; unidade de 56 px;
  "Tirar"). Quem lê a lista vê a quantidade na cor do texto e no mesmo 600 do nome ("Molho cheddar · 5 kg"). Com tudo já em lote, o
  formulário abre sem linha vazia (só "Mais um pré-preparo", "Salvar" secundário). "Pôr na lista" espera, com o motivo em 12 px
  `atencao`, enquanto "O que produzir" tem mudança por salvar (as duas ações gravam na lista; a segunda apagaria o que foi digitado).
  **Aviso do que acabou de acontecer** (salvo, gerado, posto): a tela volta do servidor na mesma rolagem, então o aviso vem para a vista
  e recebe o foco (`LevarParaVista`, `scroll-mt-24` para o topo fixo; sem animação com `prefers-reduced-motion`). **Atalho da conta**:
  logo abaixo do Gerar, até 1280 px, o resumo "4 insumos faltam · 1 abaixo de zero: ver a matéria-prima" é um link de 44 px para o
  painel (`#materia-prima`). Dia fora do prazo: a frase uma vez só (no aviso de cima), o vazio só com o título.
- **Tela da cozinha (3.3, Tarefas)**: celular e tablet primeiro (coluna de até 1024 px). **Botão da cozinha** de 56 px
  (`classeDeBotaoDaCozinha`: 16/600, padding 20, quebra a linha em vez de vazar), um por ação, em largura cheia até 768 px e numa
  coluna de 240 px à direita do cartão a partir dela. No alto, dentro do `PageHeader`, "Você está como **Caio**." e "Não é você?
  Trocar de pessoa" (fantasma sublinhado, 56 px): o tablet é compartilhado e cada um entra com o próprio acesso. Seções sem caixa
  (título 15/600 + contagem 13 tabular à direita + separador): **Com você** · **Para pegar** · **Com outras pessoas** · **Feitas
  hoje**; vazia = frase em borda tracejada. **Cartão da tarefa** = `painel` raio 14, o pré-preparo em 18/600 e o quanto em Gelasio
  26/700 tabular (o que a pessoa procura de longe), apoio em 13 suave ("Lote 261021-01 · da lista · pegou 09:12"), selos (atraso
  em `erro` com a palavra + o mesmo filete de 3 px do quadro de requisições, exceção já registrada; "Insumos: entregues" em `ok` ou
  "Insumos: a entregar" em `atencao`). **Exceção a "um primário por tela"**: cada cartão de "Com você" tem o seu Concluir primário (é
  a ação daquele lote; a tela não tem outra ação principal); enquanto os insumos não saem, Concluir secundário desabilitado com o
  motivo ligado por `aria-describedby` ("Falta o estoque entregar os insumos."). "Pegar" mostra só "Pegar" e diz o lote inteiro ao
  leitor de tela ("Pegar Molho cheddar, 6 kg"); com outra pessoa, o cartão diz "com Duda · pegou 09:12" e, para a gerência, "Passar
  para outra pessoa" e "Soltar o lote", ambos pedem o motivo antes de gravar. O aviso do que acabou de acontecer vem para a vista com
  o foco (`LevarParaVista`). **Histórico da produção e Indicadores**: período por segmentado (Hoje · 7 dias · 30 dias) + de/até e
  filtros de pessoa e pré-preparo num GET; histórico em tabela Corporativo a partir de 1280 px (Dia · Pré-preparo · Quanto ·
  Rendimento · Quem fez · Tempo · Custo, este só para quem vê custos), cartões com `dl` de 2/4 colunas abaixo; sem dado = frase
  ("sem hora de pegar", "ninguém pegou"), nunca 0. Indicadores: um painel por pessoa em ordem alfabética, sem cor por pessoa,
  sem nota e sem R$, a amostra sempre escrita ("1 lote: amostra pequena"). **Voltar para…** (`Voltar`) com 44 px em toque em
  qualquer largura (`[@media(pointer:coarse)]:min-h-11`).

## Lista paginada com ações na linha (L.1, lista de insumos)

Padrão para as próximas listas de cadastro (fichas, fornecedores...), tirado do Kairu Corporativo (toolbar + tabela + rodapé com paginação,
"preserve posição e filtros ao voltar do detalhe", "busca sem resultado preserva a busca e oferece limpar", alvos de 44 px) e do Kairu
Editorial (separadores delicados, número de tabela sem serifa):

- **Estado na URL**: busca, filtros, ordem, página e tamanho. Mudar filtro ou tamanho volta à página 1; ordem sempre com desempate por id.
- **Dois totais, dois rótulos**: "No cadastro: N" (tudo o que a pessoa pode ver) e "Nesta lista: N" / "Com os filtros: N". Nunca a quantidade da página
  como se fosse total. O subtítulo do cabeçalho é o do cadastro ("… no cadastro").
- **Filtros ativos**: faixa "Filtros ativos:" com um chip por filtro (o X tira só aquele; 36 px com mouse, 44 px em toque) e "Limpar filtros", que
  mantém o tamanho da página. Estado vazio útil: diz quantos há no cadastro e como sair.
- **Rodapé** (`PaginacaoNumerada`): "Mostrando 1–25 de 137 insumos · Página 1 de 6", Anterior, números compactos (1 … 4 [5] 6 … 12, o atual com
  `aria-current="page"`; no celular só "Página x de y"), Próxima (a ponta sem destino fica desabilitada sem sumir) e "Itens por página" como
  links (10 · 25 · 50 · 100). Alvos de 44 px em qualquer largura. Zero resultado: "Mostrando 0 de 0", "Página 1 de 1", pontas desabilitadas.
- **Ações na linha**: coluna "Ações" (tabela) ou linha própria no cartão (celular, nada de link dentro de link). Ícone com rótulo acessível que
  diz o nome do item ("Editar Farinha de trigo"), 44 x 44, só para quem pode; o servidor decide de novo. Item que muda por outro lugar mostra o
  motivo ("Pela ficha"). Remover nunca apaga direto: abre uma tela que mostra o que está ligado e só então oferece desativar (com vínculo) ou
  excluir de vez (sem vínculo, com caixa de confirmação obrigatória e botão com o nome do item).
- **Volta da edição**: a caneta volta à LISTA (mesma página, filtros e tamanho) com `AvisoDeSalvo` ("Insumo atualizado com sucesso: nome",
  "Continuar editando", "Ver o insumo"); o nome vem do banco, a URL só escolhe a frase. Colunas secundárias saem antes de a tabela passar da
  largura (abaixo de 1280 px saem "Outras embalagens" e "Custo inicial"): sem rolagem lateral em 820 px.
