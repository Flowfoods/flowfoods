---
id: FT-FILTROS-UX
schema_version: 1
project_id: flowfoods-erp
module: fichas
execution_state: in_progress
source_revision: notion_ft
baseline_commit: a8d294a1ca34a81ed69bb5b9e4f18b058569e88c
authorization_ref: AGENTS.md
assignee: /root
reviewer: /root/retomada_limpa_revisao
branch: codex/eng-ia-fichas-20261110
implementation_status: passed
local_tests_status: pending
independent_review_status: pending
user_validation_status: pending
merge_status: pending
deploy_status: pending
operational_status: pending
---

# FT-FILTROS-UX — clareza dos filtros

## Resultado

Mesma entrega do pacote vigente, não nova tarefa. Primeiro mínimo ENG-0/ENG-1; depois filtros sem alterar regras/resultados.
Notion governa escopo/aprovação/prioridade; Git comprova implementação/testes. Migração do acompanhamento técnico pendente de aceite; manter fluxo atual.
`execution_state: completed` encerra o ciclo técnico, com implementação, testes, revisão e integração/publicação comprovadas (ou publicação explicitamente não aplicável). Validação do usuário e adoção operacional têm campos próprios e podem continuar pendentes; não usar `not_applicable` para esconder ausência de prova.

## Evidência existente / não refazer

Base confirmada por fetch em 10/11/2026: `a8d294a1ca34a81ed69bb5b9e4f18b058569e88c`.
3A/3B/3C e PR34–37 integrados. Portão histórico reporta 5.427 testes/329 arquivos; não é teste desta entrega nem QA operacional atual.
Checkout anterior/worktrees preservados. Piloto inexistente na base; única PR aberta observada era rascunho futuro fora de escopo.

## Escopo

- ENG-0/1: regras preservadas, contexto curto, manifest, skill única, espelho/CURRENT gerados, verificações mínimas e retomada independente desta conversa.
- UX: busca/classificação principais, avançados organizados, resumo aplicado, contagem, pendências locais claras, Aplicar/Limpar e criação descobrível.

## Fora de escopo

Refazer 3A/3B/3C; Matriz Vendas × CMV; canais/preço/meta/custo/fórmula/schema; operação real; iFood; banco vetorial/orquestrador; sync bidirecional; novos serviços/custos/permissões; outros projetos/dados de clientes.

## Arquivos e contratos

[Contrato](../modules/fichas.md), [índice](../ai/INDEX.md), [preservação](../ai/preservation.md), [filtros](../../src/components/erp/telas/fichas/filtros.tsx), [lista](../../src/components/erp/telas/fichas/lista.tsx), [parser/URL](../../src/lib/erp/ficha-campos.ts).
Abrir dependências somente com motivo/origem registrados; não reler monólitos.

## Testes

- Piloto: `npm run ai:check`, `npm run ai:test`, sessão limpa Codex e cenários vencido/concluído/sujo/offline/outro projeto/teste não executado.
- ERP: lint/gate/typecheck oficiais, testes focados antes do portão completo com banco descartável, build/fontes.
- QA: antes/depois nas mesmas larguras/temas/URL/perfil. Componente em fixture, lista autenticada e produção são provas distintas.
- Claude Code: versão/sessão reais indisponíveis na verificação inicial; pendente, sem portabilidade comprovada.

## Critérios de aceite

| ID | Prova |
| --- | --- |
| ENG-0 | Regras preservadas, repo público, fontes permitidas, sem exportação privada. |
| ENG-1 | Sessão limpa acha projeto/entrega/arquivos/testes/próxima ação; negativos não inventam autorização/aceite. |
| FT-1 | Mesmos resultados/contagem, OR/AND/canais, fórmulas/preços/permissões. |
| FT-2 | Resumo aplicado completo, rascunho distinto, aplicar/remover/limpar, seção/subseção coerentes. |
| FT-3 | URL/paginação/Voltar/contexto; 320–1920, temas, 200%, teclado/foco, 44px, textos longos. |
| FT-4 | Nenhum/muitos filtros, zero resultados, classificação vazia/arquivada, sem preços/dados incompletos. |
| FT-5 | Revisão independente real, portão aprovado, integração/publicação comprovadas separadamente. |

## Risco e recuperação

Preparação reversível por commit, sem banco. UX pode alterar rascunho/URL/foco: preservar contratos e testar.
Não reverter/limpar trabalho alheio. Notion indisponível conserva acompanhamento e bloqueia expansão/publicação sem autorização comprovada.

## Evidências

Coordenação/docs: `/root`; compatibilidade: `/root/compatibilidade_skills`; verificadores: `/root/eng_validadores`; diagnóstico UI: `/root/fichas_diagnostico`; revisão independente: `/root/retomada_limpa_revisao`.

Piloto local em 10/11/2026, base acima + diff da branch, Windows/Node 24.15.0:

| Evidência | Resultado e limite |
| --- | --- |
| `ai:generate`, `ai:check`, `ai:context` | Aprovados; geração/identidade/links/hashes locais, sem consulta Notion implícita. |
| `ai:test` | Inicial 21/21, zero skips, também executados pelo revisor. Após separar conclusão técnica de adoção: 22/22, zero skips. Tentativas no sandbox falharam em git init da fixture antes das asserções; rodadas autorizadas fora desse bloqueio passaram, sem enfraquecer controles. |
| Revisão do piloto | Corrigidas aprovação com reviewer pendente e próxima ação antiga em CURRENT concluído; regressões específicas aprovadas. Não substitui revisão UX final. |
| Codex CLI efêmero | 0.167.0-alpha.3.2, read-only, sem esta conversa: encontrou/leu skill e instruções; identificou entrega, arquivos, limites e próximo passo. Notion offline e Git sujo/concorrência foram explicitados, sem mutação. |
| Cenários de retomada | Revisor sem histórico respondeu corretamente a fonte alterada, entrega integrada, Git sujo, Notion offline, referência de outro projeto e teste skipped/não executado. |
| Contrato de deploy | `node --test tests/deploy-confirmacao.node.mjs`: 43/43, zero skips; mesmos portões e condições de deploy. |
| Lint/tipos/conteúdo | Lint sem erros e 64 avisos preexistentes; typecheck aprovado; gate: 892 arquivos, seis arquivos de teste excluídos conforme regra existente. |
| Portão inicial do piloto `5e71ac2` | [CI 42869997883](https://github.com/Flowfoods/flowfoods/actions/runs/42869997883): 5.427 testes/329 arquivos, build e fontes aprovados. Não cobre o diff UX posterior; deploy não executado por ser PR. |
| UX implementada | Busca/classificação sempre visíveis, avançados recolhíveis, resumo derivado somente da URL aplicada, rascunho/descartar explícitos e remoção pelo serializador canônico. Sem alterar serviços, parser, schema, preços ou permissões. |
| Regressão UX local | Autor: 79/79 em cinco arquivos antes dos ajustes finais. Revisor independente: 55/55 em cinco suítes no patch com Limpar local, quebra de texto e foco corrigidos; zero skips. Primeira tentativa do revisor não importou testes por EPERM no cache TEMP; repetição com TEMP isolado passou. |
| Revisão UX | Corrigidos Limpar na URL inicial, quebra efetiva de nomes longos e foco após Descartar. Sem achados estáticos abertos; parecer completo depende da QA autenticada final. |

A primeira tentativa CLI não iniciou por restrição ao estado local; nova execução efêmera autorizada passou mantendo sandbox interno read-only. Claude permanece não testado.
Medição inicial: AGENTS 51 linhas, CURRENT 34, módulo 40; registro antes destas evidências 86. Os oito Markdown de entrada somavam 22.792 bytes/2.710 palavras; sem ler monólitos de 1.295.200 bytes. Não é medição de economia.
CLI reportou tokens agregados de entrada 591.808 (547.456 em cache), saída 5.152; incluem contexto do runtime e chamadas, não somente estes arquivos. Não há comparação equivalente antes/depois nem economia comprovada.
Baseline autenticada e rodadas de QA usam exclusivamente dados sintéticos em PostgreSQL 16/porta 55438 e Next/porta 3110. A rodada final verifica 320/360/390/768/900/1024/1280/1366/1536/1920 nos dois temas, perfis e navegação. Reflow de 640 CSS px em DPR 2 representa a largura de 1280 a 200%; não é prova de zoom nativo do navegador. Artefatos privados ficam fora do repositório público. Merge/publicação e encerramento da QA funcional continuam pendentes neste commit.

## Bloqueio e alternativa autorizada

Sem bloqueio inicial para piloto local. Claude não verificado: registrar limite e validar Codex.
QA autenticada/portão final ainda precisam do encerramento. Homologação/lojas iFood não bloqueiam este recorte.

## Próximo passo

Concluir a QA autenticada do patch corrigido e o portão completo do PR48; fechar parecer independente antes de integrar/publicar. Não reimplementar os filtros nem repetir 3A/3B/3C. Registrar publicação e limites da validação do usuário separadamente.
