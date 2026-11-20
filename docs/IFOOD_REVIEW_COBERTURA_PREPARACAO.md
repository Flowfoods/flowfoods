# Review — preparação de cobertura (INT-3.2)

Modelo puro para conferir um conjunto de páginas **abstratas e sintéticas**, com origem obrigatória `LOCAL_SIMULATION`. Não recebe payloads iFood, não representa seus cursores e não implementa coletor, caixa de avaliações, resumo de notas ou operação. A preparação da INT-3.3 é independente: este recorte não a importa nem lhe fornece autorização de envio.

## Contrato do cenário

- Cada consulta possui parceiro, loja, consulta, execução, snapshot esperado e intervalo `[início, fim)` em instantes inteiros. Inclui o início e exclui o fim; não interpreta datas locais ou fuso. O intervalo deve ter terminado antes do início da coleta para ser declarado coberto.
- Páginas identificadas apontam explicitamente para outra página, para `FIM` ou para continuação `DESCONHECIDA`. Só uma cadeia desde a primeira página, sem lacuna, ciclo ou página órfã, com término confirmado, pode produzir cobertura completa.
- Contexto, intervalo e execução precisam coincidir em todas as páginas. Snapshot desconhecido impede completude; snapshots divergentes invalidam o conjunto. O identificador é uma declaração da fixture, não prova de que a API oferece isolamento de snapshot.
- `OK`, `ERRO` e `SEM_ACESSO` são resultados do cenário, sem mapeamento HTTP. Observação anterior à coleta, futura ou com validade incoerente invalida o conjunto. Validade ausente ou vencida impede cobertura completa. Não há TTL, frequência, retenção ou janela operacional padrão.
- Registros têm ID estável, versão, instante, conteúdo inventado e elegibilidade explicitamente declarada. Nenhuma elegibilidade é inferida de nota, comentário ou status. Registros fora do intervalo e duplicatas conflitantes invalidam o conjunto; não existe escolha silenciosa da primeira ou última versão.

## Contagens e ausência de evidência

`paginasRecebidas` conta todas as entregas. Reentrega integralmente idêntica do mesmo ID incrementa `paginasRepetidas`, mas não as contagens de registros. O mesmo ID de página com qualquer diferença é um conflito; não se presume que uma nova observação corresponda ao mesmo conteúdo.

Nas páginas distintas, `observado.recebidos` conta as ocorrências de registros. Repetições idênticas de registros, dentro da página ou entre páginas, incrementam `repetidos` sem inflar `unicos`. Assim, `recebidos = repetidos + unicos` nos conjuntos coerentes. As categorias confirmadas mais `pendentesDeClassificacao` somam os únicos. Pendência significa classificação desconhecida, não resposta aprovada ou aptidão a enviar.

Contagens observadas podem existir em consulta parcial, inclusive zero registros recebidos numa página vazia. Elas **não são os totais do intervalo**. `totais`, `intervaloCoberto` e `vaziaConfirmada` ficam nulos quando falta cobertura completa e atual. Sem nenhuma página OK, ou diante de inconsistência, as contagens observadas e os registros também ficam nulos; a ausência de dado não vira zero. Erro, falta de acesso, atraso e os demais problemas são preservados separadamente na lista `problemas`.

Com cobertura completa, `totais.avaliacoes` pode ser zero. Mesmo nesse estado, `totais.elegiveis` e `inelegiveis` ficam nulos se algum registro não foi classificado; os confirmados continuam separados dos pendentes. Não são calculadas média de notas, contagem de respostas pendentes, cumprimento de SLA ou outras métricas sem contrato e dados suficientes.

## Limites e verificação

O resultado é uma nova estrutura congelada, sem reutilizar estado `COMPLETA` de consulta anterior. Não há relógio global, rede, banco, leitura de ambiente, IA ou escrita em arquivo. Há limites técnicos de entrada de 1.000 páginas e 1.000 registros por página para este ensaio; não são limites oficiais da API nem autorização para usá-los numa coleta.

```sh
npx --no-install tsx scripts/integracao-review-cobertura-simular.ts
npx --no-install vitest run tests/ifood-review-cobertura-simulada.test.ts --no-file-parallelism
```

As fixtures demonstram consulta completa com duplicatas, falta de página e atraso. Os testes incluem consulta completa vazia, repetição/conflito de páginas e registros, encadeamento, escopo, intervalo, snapshots, relógios e preservação de desconhecidos.

Esta preparação **não conclui a INT-3.2**, não prova acesso, cobertura oficial, consistência real entre páginas, persistência ou concorrência. Um adaptador futuro depende do contrato vigente e de evidência suficiente de completude/frescor; não deve inventar snapshot, traduzir um booleano em prova ou promover automaticamente o resultado para o preflight de envio. Antes disso permanecem revisão independente, portão do repositório e as liberações próprias de TEST/operação. A [documentação oficial Review](https://developer.ifood.com.br/en-US/docs/food/guides/modules/review/homologation) é referência para futura reconferência, não um payload reproduzido aqui.
