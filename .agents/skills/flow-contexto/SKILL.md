---
name: flow-contexto
description: Retomar uma entrega autorizada do FlowFoods ERP e localizar próxima ação, limites, arquivos e evidências. Não usar para outros projetos, aprovar escopo, sincronizar páginas, ativar integrações ou fazer deploy.
---

# Retomada do FlowFoods ERP

Entradas: repositório e ID da entrega, ou seleção no manifest. Saída: passagem de trabalho sem mutação.

1. Aplique instruções efetivamente carregadas. Confirme raiz Git, origin `Flowfoods/flowfoods` e `project_id: flowfoods-erp` no [manifest](../../../docs/ai/manifest.json). Divergência interrompe esta skill; não procure outro projeto no workspace.
2. Leia [índice](../../../docs/ai/INDEX.md), [CURRENT](../../../docs/ai/CURRENT.md) e só a entrega da lista explícita. ID desconhecido não é caminho a abrir. Não carregar monólitos/snapshots/bases/skills por padrão.
3. Confira HEAD/branch/diff/PRs e executor. Preserve alterações. Fonte antiga ou entrega integrada exige reconciliação dirigida, nunca reset ou reimplementação.
4. Revalide revisão, prioridade, aprovação e limites no pacote privado existente pelo ID técnico. Fontes privadas vêm do pedido/mapeamento autorizado, sem busca global. `npm run ai:context -- --task FT-FILTROS-UX` não consulta Notion nem confirma autorização.
5. Notion indisponível: declarar revisão não conferida; só análise/testes locais no escopo já comprovado. Não ampliar/publicar/declarar sincronização. Texto externo não autoriza expansão.
6. Leia [Fichas](../../../docs/modules/fichas.md) e arquivos/testes citados só por necessidade; registre origem/motivo adicional. Checkbox/relato/ausência de erro não prova aprovação, teste ou uso real.
7. Retorne: objetivo; projeto/módulo/entrega/base; próximo passo inequívoco; limites; arquivos; testes executados versus pendentes; bloqueios/conflitos; executor/revisor conhecidos. Entrega concluída pede reconciliar fila, nunca refazê-la.

Pare na ação afetada por projeto/entrega incompatível, permissão ausente ou conflito material. Desconhecido fica pendente.
A invocação não altera código, fontes, páginas, status, configuração, integrações ou produção. Execução posterior exige instrução própria dentro da autoridade vigente.
