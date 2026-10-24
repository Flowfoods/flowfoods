# Inventário de UX (F5) — 24/10/2026

Varredura automática (Playwright, app local, banco de teste, nível 1 no parceiro "Teste · Casa Alfa"): 220 telas abertas a partir do início do parceiro, seguindo os links, em **390** (celular em pé), **820** (tablet em pé), **1180** (tablet deitado) e **1440** px (computador).

| Critério | Resultado |
|---|---|
| Tela com erro (4xx/5xx) | 0 |
| Rolagem lateral da página inteira | 0 em 220 × 4 tamanhos |
| Botão que grava sem estado em voo | 0 (decisão 447; filtros GET e ações otimistas da ajuda são exceção de propósito) |
| Sinal de carregamento na navegação | filete no topo após 150 ms |

**Limites (não declarar cobertura total):** a varredura parou no teto de 220 telas; mede rolagem lateral, não legibilidade nem teclado virtual; zoom, toque real, celular deitado e teste com operador e gestor do Valentin’s **não foram feitos**. Impressão/PDF tem regra própria e ficou fora.

## Telas vistas, por área

- **(início)** (1): /
- **cadastro** (1): /cadastro
- **compras** (11): /compras, /compras/recebidas, /compras/orcamento, /compras/fornecedores, /compras/relatorios/insumo, /compras/relatorios/periodo, /compras/relatorios/comparar-fornecedores, /compras/relatorios/comparar-periodos, /compras/nova, /compras/fornecedores/novo, /compras/recebidas/importar
- **custo-medio** (1): /custo-medio
- **dre** (14): /dre/despesas, /dre, /dre/cmv-categorias, /dre/periodos, /dre/plano, /dre/metas-categorias, /dre/despesas/nova, /dre/periodos/2026-09-01, /dre/periodos/2026-08-01, /dre/periodos/2026-07-01, /dre/periodos/2026-06-01, /dre/periodos/2026-05-01, /dre/periodos/2026-04-01, /dre/periodos/2026-03-01
- **equipe** (1): /equipe
- **estoque** (11): /estoque, /estoque/contagens, /estoque/requisicoes, /estoque/divergencias, /estoque/relatorios/consumo, /estoque/[id], /estoque/[id]/requisicoes, /estoque/[id]/divergencias
- **etiquetas** (10): /etiquetas, /etiquetas/abrir, /etiquetas/historico, /etiquetas/impressora, /etiquetas/[id], /etiquetas/[id]/abrir, /etiquetas/historico/[id]
- **faturamento** (94): /faturamento, /faturamento/importar, /faturamento/lancar, /faturamento/[id]/2026-10-23, /faturamento/[id]/2026-10-24, /faturamento/[id]/2026-10-22, /faturamento/[id]/2026-10-21, /faturamento/[id]/2026-10-20, /faturamento/[id]/2026-10-19, /faturamento/[id]/2026-10-18, /faturamento/[id]/2026-10-17, /faturamento/[id]/2026-10-16, /faturamento/[id]/2026-10-15, /faturamento/[id]/2026-10-14, /faturamento/[id]/2026-10-13, /faturamento/[id]/2026-10-12, /faturamento/[id]/2026-10-11, /faturamento/[id]/2026-10-10, /faturamento/[id]/2026-10-09, /faturamento/[id]/2026-10-08, /faturamento/[id]/2026-10-07, /faturamento/[id]/2026-10-06, /faturamento/[id]/2026-10-05, /faturamento/[id]/2026-10-04, /faturamento/[id]/2026-10-03, /faturamento/[id]/2026-10-02, /faturamento/[id]/2026-10-01, /faturamento/[id]/2026-09-30, /faturamento/[id]/2026-09-29, /faturamento/[id]/2026-09-28
- **fichas** (9): /fichas, /fichas/canais, /fichas/importar, /fichas/nova, /fichas/[id], /fichas/[id]/editar, /fichas/[id]/remover, /fichas/[id]/fotos, /fichas/[id]/canais
- **historico** (1): /historico
- **insumos** (50): /insumos, /insumos/novo, /insumos/[id], /insumos/[id]/editar, /insumos/[id]/remover, /insumos/[id]/embalagens/nova, /insumos/[id]/embalagens/[id]
- **lojas** (1): /lojas
- **producao** (15): /producao/lista, /producao/tarefas, /producao, /producao/historico, /producao/indicadores, /producao/lista/[id], /producao/tarefas/[id], /producao/[id], /producao/historico/[id], /producao/indicadores/[id]
