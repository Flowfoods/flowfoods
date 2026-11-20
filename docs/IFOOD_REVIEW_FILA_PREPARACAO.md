# Review — fila editorial persistente, preparação interna

Esta fatia continua a política versionada e os modelos locais de INT-3.2–3.3. Cada sugestão tem origem **LOCAL_SIMULATION**, capacidade **INATIVA** e estado editorial **RASCUNHO** ou **APROVADA**. Os fatos são sintéticos/locais; não são dados coletados, contrato oficial, prova TEST ou homologação. Não há UI, action, rota HTTP, IA, worker, grant ou transporte. Não encerra INT-3.3 nem habilita a operação Review.

## Identidade, revisão e aprovação

- A identidade local é parceiro + loja + avaliação local. A mesma chave de avaliação ou versão de fatos em outra identidade não conflita. O portão verifica a loja e deriva o parceiro do contexto do servidor.
- Criar usa `revisaoEsperada: 0`. Editar exige a revisão corrente. Comentário vazio explícito é conhecido; ausência não vira comentário fabricado. Texto válido conserva espaços e quebras. Tetos de armazenamento não definem tamanho, prazo ou elegibilidade do canal.
- Fatos/versão, texto/visibilidade, editor e política ficam em uma revisão imutável. Reutilizar uma versão de fatos com comentário diferente na mesma sugestão é recusado, inclusive se a revisão anterior nunca foi aprovada. Nenhuma IA interpreta comentários.
- A política é resolvida pelo servidor na mesma transação repetível de criação/edição: exceção completa da loja prevalece sobre parceiro; ausência bloqueia. Referência e snapshot completo correspondem à versão visível nessa transação. Não se promete a política mais nova no instante do commit diante de uma alteração concorrente. Conflito serializável não tem retry automático.
- Aprovar fixa a revisão exata com identidade, fatos, texto, política e editor já registrados; o aprovador e o horário vêm do servidor. Aprovação não incrementa a revisão textual. O mesmo humano pode editar e aprovar: este escopo não exige dupla assinatura.
- O rascunho pode ultrapassar o `limiteEditorial` configurado, dentro do teto de armazenamento. Aprovar exige respeitar o limite do snapshot daquela revisão, contado por pontos de código Unicode (`Array.from`), como no simulador. Excesso é erro explícito sem efeitos, truncamento ou reescrita. Não é um limite confirmado do iFood, nem cria mínimo/prazo. Alterar a política não amplia silenciosamente o teto de uma revisão antiga; uma edição explícita pode obter o novo snapshot.
- Mudança posterior da política não troca o snapshot aprovado. Edição material — inclusive escolha da nova versão vigente ou mudança de editor — cria revisão, retorna a RASCUNHO e limpa a aprovação corrente. Aprovações anteriores continuam consultáveis. Repetição sem mudança material retorna o estado existente e não cria auditoria artificial.
- Aprovar a mesma revisão com o mesmo responsável/nome/motivo pode devolver o mesmo recibo sem nova gravação. Aprovar revisão antiga, ou trocar o responsável/motivo de uma aprovação existente, produz conflito. Isso não é idempotência externa de envio.

## Concorrência, persistência e auditoria

CAS e unicidade dão um vencedor por criação/avanço textual esperado. Na corrida editar × aprovar, ambos podem vencer se a ordem for aprovar R1 e depois editar R1→R2, terminando com R2 em RASCUNHO. Quando editar R2 vence primeiro, aprovação R1 é recusada. Nenhuma aprovação de R1 permanece corrente sobre R2.

Cabeçalho, revisão/aprovação e `HistoricoAlteracao` são escritos na mesma transação; falha de qualquer etapa desfaz todo o efeito. FKs compostas vinculam cada registro imutável ao evento correspondente do próprio parceiro. A migração impede alteração/remoção/truncate de revisões e aprovações, salto de revisão, cabeçalho incompleto, snapshot divergente e aprovação fora da revisão corrente. A auditoria referenciada não pode ser removida por DELETE; seu UPDATE já era recusado pelo ERP. Não foi alterada a regra global de limpeza de outras entidades. Retenção/eliminação desta fila não integra esta fatia: um futuro procedimento deverá definir o contrato explícito, sem apagar referências ou desligar gatilhos em operação.

Consulta reconstrói os snapshots do banco, sem depender de cache. DTOs são cópias congeladas, com datas ISO. Listagem recebe loja, limite explícito de 1–100, filtro editorial opcional e cursor por ID; o limite controla a consulta local, sem definir frequência ou quota do provedor.

## Autorização e isolamento

`review-fila-servidor.ts` é fachada interna Nível 1, sem consumidor externo. `exigirParceiro` fornece cliente e sessão; o payload estrito não aceita tenant, autoria, relógio, origem/capacidade ou política arbitrários. `integracao.ver` não concede esta escrita. O repositório interno recebe somente contexto confiável; não é endpoint de autenticação.

O portão revalida parceiro ATIVO na primeira escrita da transação e recusa cliente somente leitura. Não é necessário criar app, grant ou conexão para preparar dados locais. Com RLS instalada em Loja, as três tabelas usam FORCE RLS e o papel existente; sem RLS, preservam portão, FKs e gatilhos, sem alegar isolamento de SQL administrativo nesse perfil.

## Verificação e continuidade

`ifood-review-fila.test.ts` cobre contrato estrito, cópias e fachada. `ifood-review-fila.db.test.ts` aplica migrations sobre dado anterior em PostgreSQL 16 descartável e executa os três perfis obrigatórios: concorrência, snapshots, imutabilidade, rollback, isolamento e recuperação por novo cliente. URL local, psql e papéis são pré-condições; testes de banco pulados não constituem aceite. Também devem passar as regressões de política, simulação/cobertura e portão tenant, além do CI integral da composição final.

Um futuro transporte precisará confirmar contrato vigente, política atual, fatos, elegibilidade, prazo, limite de texto, visibilidade, grant e resposta existente; aprovação local não equivale a autorização de envio. Os estados de transporte e a reconciliação incerta do simulador permanecem separados desta persistência editorial. Não há envio, intenção operacional ou promessa de publicação nesta entrega.
