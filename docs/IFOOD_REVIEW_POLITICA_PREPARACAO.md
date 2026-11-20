# Review — política editorial persistente, preparação interna

Esta fatia prepara a política de resposta de INT-3.2–3.3. Sua capacidade permanece **INATIVA**: gravar uma política não aprova texto, não habilita módulo, não autoriza loja e não envia resposta. Não há UI, rota HTTP, worker, IA nem acesso ao provedor. Não encerra INT-3.3 nem comprova homologação/uso real.

## Contrato e versão

- Todo conteúdo informa tom, assinatura, exemplos, restrições e limite editorial. Assinatura `''` e listas `[]` significam ausência explícita; campos omitidos são inválidos. Texto é preservado, sem trim/reescrita silenciosa.
- Política do parceiro usa `lojaId: null`. Exceção informa a loja do mesmo parceiro e **todo o conteúdo**; não mescla campos da política do parceiro.
- `versaoEsperada: 0` cria uma origem ainda inexistente; demais valores exigem exatamente a versão corrente daquela origem. Concorrentes da mesma base têm um vencedor, os demais recebem `ConflitoReviewPolitica`. Releitura e nova intenção editorial são necessárias; não há retry automático.
- A resolução verifica a loja e retorna a exceção, se existir, ou a política do parceiro. Sem ambas, retorna `null`; loja desconhecida/cruzada é erro. Retorna origem, parceiro/loja, IDs, número e cópia profundamente congelada do conteúdo, em snapshot transacional repetível.
- Alterar o parceiro muda resoluções futuras das lojas que herdam, preservando snapshots já obtidos. Exceções completas permanecem intactas. A remoção de exceção/retorno à herança não integra esta fatia.
- `ReviewPoliticaVersao` nunca é atualizada/apagada; `ReviewPolitica` só avança um número. Índices, FKs compostas e gatilhos recusam escopo cruzado, avanço sem versão e lacunas. Versão, ponteiro e `HistoricoAlteracao` são gravados numa única transação; falha de auditoria desfaz tudo.

## Autorização e isolamento

`review-politica-servidor.ts` é a fachada interna, sem `use server` e sem consumidor externo. Chama `exigirParceiro(slug)`/`exigirNivel1`: parceiro, autor e cliente vêm do servidor. O payload estrito não aceita autor, parceiro ou permissão. `integracao.ver` não autoriza escrita; nenhum papel ou permissão funcional foi criado. O repositório `review-politica.ts` recebe exclusivamente esse cliente/contexto confiável; não é uma fronteira de autenticação nem deve receber identidade do formulário.

O portão `doParceiro` revalida parceiro ATIVO na primeira escrita da transação com `FOR SHARE`, inclusive quando o contexto foi obtido antes de uma suspensão. Cliente somente leitura recusa escrita. A política local não requer app, grant, merchant ou Review ativo. Autoria estável da sessão acompanha a versão e o evento de auditoria do próprio parceiro; `AuditLog` global permanece inacessível ao tenant.

A migration acompanha o perfil existente: com RLS em `Loja`, instala FORCE RLS nas duas tabelas e concede apenas SELECT/INSERT e avanço do ponteiro ao papel já existente. Não cria papel. Sem RLS no ambiente, mantém o contrato existente de portão + FKs + gatilhos; não alega isolamento de SQL cru de um proprietário administrativo nesse perfil.

## Limites e uso futuro

Os tetos locais (tom/assinatura/motivo 2.000 caracteres, até 20 exemplos/restrições de 5.000, limite editorial 1–10.000) controlam armazenamento e intenção editorial. **Não constituem limite confirmado de resposta do canal**, prazo de publicação ou autorização de envio. Nenhum padrão é escolhido automaticamente. Uma integração futura terá de confirmar separadamente o contrato do canal e o estado atual da avaliação.

Nenhuma versão persistida é injetada automaticamente no simulador de aprovação. Futuro consumidor deverá preservar a identificação e o snapshot usados em cada sugestão/aprovação; mudança de política não reescreve texto aprovado. Os modelos puros de aprovação/cobertura continuam independentes.

## Verificação

- `tests/ifood-review-politica.test.ts`: conteúdo estrito, imutabilidade e fachada Nível 1.
- `tests/ifood-review-politica.db.test.ts`: migrations com dado anterior em PG16 descartável, três perfis obrigatórios, herança/exceção/ausência, CAS de criação/edição, imutabilidade SQL, RLS/FKs, suspensão e rollback de auditoria.
- `tests/erp-tenant-portao.test.ts`: registro completo no portão e FKs de tenant.

Execução focada: `npx vitest run tests/ifood-review-politica.test.ts tests/ifood-review-politica.db.test.ts tests/erp-tenant-portao.test.ts --no-file-parallelism`. Os testes de banco exigem `ERP_DB_TESTE` local e os três perfis do portão; sem URL são pulados, o que não constitui aceite. O portão integral do repositório continua obrigatório antes de publicação.
