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

## 6. Rotas afetadas por destino (E1, 24/10/2026)

Lido do código: as 98 páginas de `src/app/erp` e a permissão que cada uma exige na entrada (`exigirPermissaoNaPagina`). O nível 1 tem
as mesmas telas em `/rodolfo/erp/<slug>/...`. **Nenhuma rota muda com a proposta:** só o rótulo e o agrupamento no menu; link
antigo, favorito, `?volta=`, busca (⌘K) e atalhos continuam chegando. Onde a proposta muda a área, a página ganha a nova casa
no menu e mantém a URL.

| Destino proposto | Hoje | Tarefa | Rotas (páginas) | Permissão de entrada |
|---|---|---|---|---|
| Configurações › Seu acesso | Rede e Equipe › Seu acesso | aparelhos e senha da própria pessoa | `/acesso` (1) | sessão |
| Compras › Notas | Compras e Fornecedores › Compras | lançar e consultar nota | `/compras/[id]/editar`, `/compras/[id]/lotes`, `/compras/[id]`, `/compras/nova`, `/compras` (5) | compras.lancar compras.ver |
| Compras › Fornecedores | Compras e Fornecedores › Fornecedores | cadastrar e consultar fornecedor | `/compras/fornecedores/[id]/editar`, `/compras/fornecedores/[id]`, `/compras/fornecedores/novo`, `/compras/fornecedores` (4) | compras.ver fornecedores.editar |
| Compras › Orçamento | Compras e Fornecedores › Orçamento | acompanhar o teto de compra | `/compras/orcamento` (1) | compras.ver |
| Compras › Notas recebidas (XML) | Compras e Fornecedores › Notas recebidas | conferir o que chegou | `/compras/recebidas/[id]`, `/compras/recebidas/importar`, `/compras/recebidas` (3) | compras.lancar compras.ver |
| Resultados › Compras (e atalho no insumo/fornecedor) | Compras e Fornecedores › relatórios (4 abas) | analisar compras | `/compras/relatorios/comparar-fornecedores`, `/compras/relatorios/comparar-periodos`, `/compras/relatorios/insumo`, `/compras/relatorios/periodo` (4) | compras.ver |
| Resultados › DRE · CMV por categoria | Faturamento e DRE › DRE e CMV por categoria | indicador → composição → origem | `/dre/cmv-categorias`, `/dre` (2) | dre.ver |
| Resultados (lançar despesa como ação) | Faturamento e DRE › Despesas | lançar e consultar despesa | `/dre/despesas/[id]/editar`, `/dre/despesas/[id]`, `/dre/despesas/nova`, `/dre/despesas` (4) | despesas.lancar |
| Configurações › Plano e metas · Períodos | Faturamento e DRE › Plano, metas, períodos | parâmetros do resultado | `/dre/metas-categorias`, `/dre/periodos/[inicio]`, `/dre/periodos`, `/dre/plano` (4) | dre.ver metas.editar |
| Configurações › Equipe | Rede e Equipe › Equipe | acessos da equipe | `/equipe` (1) | acessos.gerir |
| Estoque (Posição · Contagens · Requisições · Divergências) | Estoque e Movimentações | operar o estoque da loja | `/estoque/[lojaId]/abertura/conferir`, `/estoque/[lojaId]/abertura`, `/estoque/[lojaId]/contagens/[contagemId]/conferir`, `/estoque/[lojaId]/contagens/[contagemId]`, `/estoque/[lojaId]/contagens/nova`, `/estoque/[lojaId]/divergencias`, `/estoque/[lojaId]`, `/estoque/[lojaId]/periodo`, `/estoque/[lojaId]/requisicoes/[requisicaoId]/atender`, `/estoque/[lojaId]/requisicoes/[requisicaoId]`, `/estoque/[lojaId]/requisicoes/nova`, `/estoque/[lojaId]/requisicoes`, `/estoque/contagens`, `/estoque/divergencias`, `/estoque`, `/estoque/requisicoes` (16) | estoque.ajustar estoque.contar estoque.ver requisicao.atender requisicao.pedir |
| Resultados › Consumo | Estoque › Consumo e conciliação | analisar consumo | `/estoque/relatorios/consumo/movimentos`, `/estoque/relatorios/consumo` (2) | estoque.ver |
| Etiquetas | Etiquetas | imprimir e abrir embalagem | `/etiquetas/[lojaId]/[etiquetaId]`, `/etiquetas/[lojaId]/[etiquetaId]/papel`, `/etiquetas/[lojaId]/aberta/[aberturaId]`, `/etiquetas/[lojaId]/abrir`, `/etiquetas/[lojaId]/lote/[ordemId]`, `/etiquetas/[lojaId]`, `/etiquetas/abrir`, `/etiquetas/historico/[lojaId]`, `/etiquetas/historico`, `/etiquetas/impressora`, `/etiquetas` (11) | etiquetas.imprimir |
| Resultados (lançar o dia como ação) | Faturamento e DRE › Faturamento | lançar e consultar venda | `/faturamento/[lojaId]/[data]`, `/faturamento/importar`, `/faturamento/lancar`, `/faturamento` (4) | faturamento.lancar faturamento.ver |
| Fichas técnicas | Cadastros e Cardápio › Fichas técnicas | montar receita, preparo, custo e preço por canal | `/fichas/[id]/canais`, `/fichas/[id]/editar`, `/fichas/[id]/fotos`, `/fichas/[id]/imprimir`, `/fichas/[id]`, `/fichas/[id]/remover`, `/fichas/importar`, `/fichas/nova`, `/fichas` (9) | fichas.editar fichas.ver precos.ver |
| Configurações › Canais (taxa e meta) + filtro do farol na lista de fichas | Cadastros e Cardápio › Precificação | parâmetro geral de canal | `/fichas/canais` (1) | precos.ver |
| Configurações › Histórico | Rede e Equipe › Histórico | quem mudou o quê | `/historico` (1) | historico.ver |
| Insumos | Cadastros e Cardápio › Insumos | cadastrar, classificar, consultar onde é usado | `/insumos/[id]/editar`, `/insumos/[id]/embalagens/[varianteId]`, `/insumos/[id]`, `/insumos/[id]/remover`, `/insumos/categorias`, `/insumos/classificar`, `/insumos/novo`, `/insumos` (8) | insumos.editar insumos.ver |
| Configurações › Lojas e marcas | Rede e Equipe › Lojas e marcas | estrutura da rede | `/lojas` (1) | lojas.ver |
| Início de trabalho | Início | ver pendências e indicadores autorizados | `/` (1) | sessão |
| Produção | Produção | planejar, executar e consultar lotes | `/producao/[lojaId]/[ordemId]/concluir`, `/producao/[lojaId]/[ordemId]`, `/producao/[lojaId]/nova`, `/producao/[lojaId]`, `/producao/historico/[lojaId]`, `/producao/historico`, `/producao/lista/[lojaId]`, `/producao/lista`, `/producao/nova`, `/producao`, `/producao/tarefas/[lojaId]/[ordemId]/concluir`, `/producao/tarefas/[lojaId]`, `/producao/tarefas` (13) | producao.registrar producao.ver |
| Produção › Indicadores (gerência) | Produção › Indicadores | retrato do período | `/producao/indicadores/[lojaId]`, `/producao/indicadores` (2) | producao.planejar |

**O que a tabela mostra para a mudança do menu:**

- Cada destino tem permissão de entrada própria; juntar áreas no menu não amplia acesso, porque cada página continua conferindo a dela.
- "Resultados" reúne páginas com permissões diferentes (`dre.ver`, `faturamento.ver`, `compras.ver`, `estoque.ver`): o item do menu aparece se a pessoa tiver **alguma** delas, e cada aba só com a sua (regra que `modulos.ts` já aplica hoje).
- "Configurações" reúne `lojas.ver`, `acessos.gerir`, `historico.ver`, `metas.editar`: o operador hoje vê Lojas e marcas e Seu acesso; isso continua igual.
- Precificação (`/fichas/canais`) é a única página cuja tarefa se divide em dois destinos. A rota fica; o menu passa a apontar para ela em Configurações, e a lista de fichas mantém o filtro do farol.
- Pendente: validar com operador e gestor (seção 5, passo 1) antes de mudar `modulos.ts`.
