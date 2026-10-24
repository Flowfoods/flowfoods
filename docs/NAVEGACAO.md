# Mapa de navegação e responsabilidades — ERP do parceiro (24/10/2026)

Entrega 1 da "Revisão aprofundada iFood — reorganização visual e estrutural prioritária" (Notion, FlowFoods Barney — ERP).
Mapa do que existe, proposta e inventário do que reaproveitar. **A proposta é hipótese a validar com operador e gestor do
Valentin's antes de mexer no menu.** Nenhuma URL muda; regra de estoque, custo, preço e permissão não muda.

## 1. Estado atual (lido de `src/lib/erp/modulos.ts`)

| Área (seletor do menu e card do hub) | Abas | Ações (cabeçalho e ⌘K) | Operador vê |
|---|---|---|---|
| Cadastros e Cardápio | Insumos · Fichas técnicas · Precificação | Novo insumo, Nova ficha, Importar planilha | Insumos, Fichas técnicas |
| Compras e Fornecedores | Compras · Notas recebidas · Orçamento · Fornecedores · Histórico do insumo · Compras do período · Comparar fornecedores · Comparar períodos | Lançar nota, Importar XML, Novo fornecedor | — |
| Estoque e Movimentações | Visão geral · Contagens · Requisições · Divergências · Consumo e conciliação | — | sem Divergências |
| Produção | Lista do dia · Tarefas · Lotes · Histórico · Indicadores | Nova produção | sem Indicadores |
| Etiquetas | Imprimir · Abrir embalagem · Histórico · Impressora | — | tudo |
| Faturamento e DRE | Faturamento · Despesas · DRE · CMV por categoria · Períodos · Plano e metas · Metas por categoria | Lançar o dia, Importar faturamento, Lançar despesa | — |
| Rede e Equipe | Lojas e marcas · Equipe · Histórico · Seu acesso (nível 1: Cadastro do parceiro, Custo médio por loja) | — | Lojas e marcas, Seu acesso |

**Camadas de navegação hoje:** hub (um card por área) → seletor de área no menu → itens do menu (= abas) → abas no alto da
tela → ações no cabeçalho. Menu, abas e hub saem da mesma estrutura (não divergem), mas a mesma lista aparece em dois lugares
na mesma tela (menu lateral e abas). Redundância a validar, não defeito comprovado.

## 2. Achados que orientam a proposta

| Achado (Notion QA / código) | Situação após esta rodada |
|---|---|
| Nomes diferentes para o mesmo conceito ("Fichas e produtos" × "Fichas técnicas"; "Áreas da Rede" × "Áreas do parceiro") | **Corrigido**: um nome só (aba, título, ajuda, nível 1) |
| Compras e Fornecedores com 8 abas, 4 delas relatórios | Pendente: proposta abaixo |
| Precificação mistura parâmetro geral (taxa, meta por canal) com a decisão de cada prato | Pendente: proposta abaixo |
| Insumo sem "onde é usado" antes de mudar | **Feito**: painel no detalhe + aviso no editar |
| Precificação espremida no tablet (1024) | **Corrigido**: coluna lateral só a partir de 1280 px |
| Texto fixo de ajuda embaixo do título em toda tela | **Corrigido**: linha "Como funciona esta tela" + card flutuante |

## 3. Proposta (hipótese para validar)

Entradas por tarefa, agrupando o que já existe (hipótese do Notion): **Insumos · Fichas técnicas · Compras · Estoque ·
Produção · Etiquetas · Resultados · Configurações.**

| Hoje | Proposta | Por quê |
|---|---|---|
| Cadastros e Cardápio › Insumos | **Insumos** (lista → detalhe com estoque, compras e onde é usado) | o insumo é o registro central; categorias já estão no painel lateral |
| Cadastros e Cardápio › Fichas técnicas | **Fichas técnicas** (lista → ficha com composição, preparo, custo e preço por canal) | a decisão de preço é do prato |
| Cadastros e Cardápio › Precificação | taxa do iFood e meta de CMV por canal → **Configurações › Canais**; "CMV de cada prato" fica na lista de fichas (filtro do farol) | parâmetro geral ≠ decisão do produto |
| Compras e Fornecedores (8 abas) | **Compras**: Notas · Notas recebidas (XML) · Fornecedores · Orçamento. Relatórios abrem do insumo/fornecedor já filtrados e ficam também em **Resultados › Compras** | consulta contextual + visão transversal, sem duplicar consulta |
| Estoque e Movimentações | **Estoque**: Posição · Contagens · Requisições · Divergências; Consumo e conciliação → **Resultados** | operar ≠ analisar |
| Faturamento e DRE | **Resultados**: DRE · CMV por categoria · Compras · Consumo; lançamentos (faturamento, despesas) ficam como ações; Plano, metas e períodos → **Configurações** | indicador → composição → registros → origem |
| Rede e Equipe | **Configurações**: Lojas e marcas · Equipe · Canais · Plano e metas · Períodos · Histórico | administração num lugar só |

Regras da mudança, quando aprovada: URLs antigas continuam valendo (só muda rótulo e agrupamento, como na UX.9); cada aba
mantém a permissão de hoje; o hub continua com um card por área; nenhuma área nova nasce vazia para o operador.

## 4. Quatro modelos de tela (o que reaproveitar)

| Modelo | Uso | Peças que já existem | Telas que já seguem |
|---|---|---|---|
| **Lista operacional** | encontrar e agir | `PageHeader` (ação principal, linha de ajuda), `filtros.tsx`, `paginacao-numerada.tsx`, cards no celular/tabela no computador, retorno com `?de=` | Insumos, Fichas técnicas, Compras |
| **Detalhe com contexto** | consultar um registro e suas ligações | `Painel` principal + coluna lateral (`lg:grid-cols-[1fr_340px]`), `TrilhaDaPagina`, "Voltar para a lista" com filtros | Insumo (agora com Onde é usado), Ficha, Nota |
| **Editor complexo** | montar algo com várias partes | formulário por blocos, `PontoDeAjuda` por campo, rascunho por pessoa, `BotaoEnviar` com estado em voo, aviso de alcance | Ficha (nova/editar), Insumo (novo/editar), Nota |
| **Análise** | indicador → composição → registros | `relatorio-grande.tsx`, seletor de visão (rede/loja), período, CSV/impressão | DRE, relatórios de compras, Consumo |

Critério da largura: a coluna lateral de 340 px só entra quando a coluna principal fica com folga (Precificação passou a
`xl`). Revisar as outras 8 telas com `lg:grid-cols-[minmax(0,1fr)_340px]` com captura a 1024 × 768 antes de trocar.

## 5. Próximos passos

1. Validar a proposta da seção 3 com uma pessoa operadora e uma gestora do Valentin's (computador e celular): localizar
   cadastrar, operar e analisar sem procurar.
2. Só depois, mudar `modulos.ts` (rótulos e agrupamento) mantendo rotas e permissões — os testes de navegação travam isso.
3. Estender a jornada visual para compras → estoque → produção → resultados, uma por vez.
