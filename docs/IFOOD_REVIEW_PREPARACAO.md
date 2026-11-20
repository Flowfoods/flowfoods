# Review — preparação local da aprovação (INT-3.3)

Este recorte prepara contrato, modelo puro e simulador com dados inventados. Não conclui a INT-3.3, não abre a operação da Onda 3 e não implementa coletor, fila persistente ou envio. Todo estado pertence à origem `LOCAL_SIMULATION`, inclusive `CONFIRMADA` e o papel `HUMANO_SIMULADO`.

## Contrato do ensaio

- Identidade: parceiro, loja e avaliação, conferidos em cada transição e no preflight. Fatos da fonte, rascunho, política versionada, editor e responsável pela aprovação são campos separados. Comentários são texto não confiável, sem execução ou geração por IA.
- Aprovação: snapshot imutável de identidade, fatos/versão, texto, visibilidade, política/versão, revisão, responsável e instante. Texto só em branco é recusado; espaços e quebras de um texto válido são preservados, sem normalização silenciosa. Edição material volta a rascunho; o histórico aprovado permanece intacto. Conteúdo diferente não pode reutilizar uma versão de política/fonte já aprovada. Alterar política nunca reescreve uma resposta aprovada silenciosamente.
- Antes da intenção: exige observação completa e posterior à aprovação, identidade correta, frescor/prazo explícitos e ainda vigentes, elegibilidade confirmada, `NOT_REPLIED` e nenhuma resposta `from=MERCHANT`. Respostas ausentes, autoria desconhecida, cobertura parcial, visibilidade desconhecida, versão divergente ou limite não confirmado bloqueiam a tentativa.
- Parâmetros: não há prazo, frequência, retenção ou limite operacional padrão. O cenário fornece instantes, validade da observação, prazo de resposta e limites textuais. Valores 10–300 são fixtures; a contagem deste modelo usa pontos de código Unicode e precisa ser confrontada com o contrato do canal antes de qualquer adaptador real.
- Intenção: identificador e correlação únicos no histórico local, snapshot aprovado e preflight são registrados antes do resultado. `APROVADA`, `EM_ENVIO`, `CONFIRMADA`, `FALHOU` e `INCERTA` são estados distintos. A intenção e o histórico de resultados sobrevivem ao timeout.
- Reconciliação: uma leitura `NOT_REPLIED` sem respostas, mesmo completa e fresca, não comprova ausência de uma escrita que ainda pode aparecer. Resultado incerto continua bloqueado. Confirmação exige recibo sintético com a mesma correlação e ID de resposta observado. Texto igual não prova autoria.
- Resposta existente: sem recibo correlacionado, encerra a pendência como `ENCERRADA_EXTERNAMENTE`, com motivo `RESPOSTA_EXISTENTE_SEM_ATRIBUICAO`, ID da resposta, instante e observação imutável. O preflight que encontra resposta MERCHANT encerra antes de criar intenção. A transição explícita de encerramento também atende rascunho/aprovação/falha conclusiva, preservando histórico e validando identidade, cobertura e frescor; não contorna envio ou resultado incerto, que exigem reconciliação. Esse estado não afirma quem publicou; impede sobrescrita, reaprovação ou repetição. Uma prova negativa conclusiva, consistente com a observação, permite nova aprovação e nova intenção, preservando a anterior.

## Limites da evidência

Os marcadores de confirmação e prova são entradas explícitas de fixtures, não atestados de autenticidade, autorização humana real ou recibos verificados do iFood. O modelo não recebe HTTP nem mapeia 400/409/422 para sucesso, falha definitiva ou elegibilidade. Adaptadores futuros precisam validar a evidência externa; um booleano ou texto autodeclarado não basta.

As funções retornam cópias congeladas, sem rede, relógio global, leitura de variáveis, banco ou escrita em disco. Duas chamadas sobre a mesma cópia antiga ainda podem produzir duas intenções independentes: este ensaio **não prova concorrência, persistência, idempotência distribuída ou integração real**. Antes de operação, são necessários armazenamento atômico, controle de versão, exclusão mútua, permissões reais, quota, reconciliação com o provedor e seus testes próprios.

Não há cadastro, segredo, grant, pedido TEST, resposta real, IA externa, notificação, worker ou alteração de interface neste recorte. Não utilizar fixtures como dados de uma loja nem interpretar saída do simulador como TEST oficial, homologação ou produção.

## Executar e conferir

```sh
npx --no-install tsx scripts/integracao-review-simular.ts
npx --no-install vitest run tests/ifood-review-aprovacao-simulada.test.ts --no-file-parallelism
```

O simulador percorre rascunho → aprovação → intenção → timeout → leitura vazia ainda incerta → resposta existente sem atribuição. Imprime somente estados e limites do ensaio. Os testes cobrem também falha conclusiva, nova aprovação/tentativa, correlação incorreta, versões, identidade, frescor, prazo, visibilidade e entradas desconhecidas.

## Referência e continuação

[Critérios oficiais de homologação Review](https://developer.ifood.com.br/en-US/docs/food/guides/modules/review/homologation). A revisão documental disponível encontrou conteúdo oficial indexado, mas abertura direta com HTTP 403; não equivale a contrato autenticado do app/loja. Reconferir contrato vigente, visibilidade, versões, tamanho/prazo/edição, respostas existentes e erros antes de preparar qualquer transporte. Não transportar notas históricas sobre cinco dias, dez minutos ou nota menor que cinco para regras operacionais.

Próxima etapa desta preparação: revisão independente e portão completo do repositório. Operação, massa TEST, homologação e autorização por loja continuam dependentes de suas liberações próprias.
