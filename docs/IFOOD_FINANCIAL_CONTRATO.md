# Financial — contrato local de simulação, versão 1

Recorte das INT-2.2/2.3: domínio, normalização monetária e comparação pura de eventos com impacto no repasse versus liquidação. Não encerra as INT-2.2–2.4, nem a integração Financial.

O comparador aceita entradas com `origem: SIMULACAO`. Os leitores v3 recebem o JSON do contrato de cada operação. O comando local exercita ambos os formatos de envelope com respostas sintéticas e identifica a saída como simulação.

O comparador opera em memória. As consultas v3 usam o transporte injetado pelo chamador, e a demonstração fornece respostas em memória. O acesso por loja, a homologação e a conciliação operacional dependem de etapas próprias.

## Autoridade e fontes

O plano vigente autoriza esta construção independente e estabelece tolerância de **0,01%**. A independência técnica não libera chamadas reais, homologação ou produção.

- [Financial Events — guia oficial](https://developer.ifood.com.br/es-CO/docs/guides/modules/financial/api-financial-events): o conteúdo oficial indexado descreve `amount.value` textual, sinal de crédito/débito, `hasTransferImpact` e paginação própria `page/size/hasNextPage`.
- [Homologação Financial — guia oficial](https://developer.ifood.com.br/en-US/docs/food/guides/modules/financial/homologation): cada API tem seus dados e critérios; integração parcial não representa homologação completa.
- [Reconciliation — guia oficial](https://developer.ifood.com.br/es-CO/docs/guides/modules/financial/api-reconciliation/): distingue lançamentos com impacto e apresenta um exemplo com tolerância fixa de R$ 0,01. Esse exemplo não substitui a tolerância percentual do plano FlowFoods.

Na primeira consulta de 10/11/2026, os guias diretos retornaram 403. O PR49 usou o conteúdo oficial indexado para o domínio de simulação. Na consulta seguinte, a referência de API do portal abriu no navegador. Foram inspecionados os parâmetros, o exemplo e o modelo expandido da resposta 200 das operações Financial Events e Settlements na versão 3.0. O recorte implementado está em [Leitura do Financial v3](#leitura-do-financial-v3).

## Entradas normalizadas da simulação

Ambas as fontes exigem `origem: SIMULACAO`, `versao: 1`, identidade e cobertura. Objetos são estritos: campos desconhecidos e metadados obrigatórios ausentes são recusados.

| Campo | Contrato local |
| --- | --- |
| Identidade | `parceiro`, `loja`, `merchant`, `produto`, `competencia` (YYYY-MM) e `moeda: BRL`. Identificadores sintéticos com letras, números, `_` ou `-`, até 120 caracteres. |
| Cobertura | `estado: COMPLETA / INCOMPLETA / AUSENTE`, `apuracao: ENCERRADA / PENDENTE`. Declarações do cenário; não são deduzidas da quantidade de linhas ou igualdade dos totais. |
| Eventos | `natureza: EVENTOS_FINANCEIROS`, array `eventos`; cada ocorrência exige `nome`, `gatilho`, `impactoNoRepasse` booleano ou null, e `valorReais` textual ou null. |
| Liquidação | `natureza: LIQUIDACAO`, `valorReais` textual ou null. Venda, recebível, repasse previsto e crédito bancário não são tipos intercambiáveis. |

`AUSENTE` exige array vazio nos eventos ou valor null na liquidação. Array vazio com cobertura explicitamente completa e apuração encerrada tem soma zero; array vazio por ausência nunca tem esse significado. A cobertura futura precisará demonstrar identidade, período, todas as páginas e maturidade da apuração; paginação completa isoladamente não prova período financeiro encerrado.

Não há ID único de evento comprovado neste recorte. Nome, gatilho e valor iguais não autorizam deduplicação; cada ocorrência fornecida continua distinta. Repetição de captura/página deverá ser tratada pelo futuro contrato de aquisição, sem inventar chave de evento.

## Dinheiro e comparação

`decimalFinancialEmCentavos` aceita decimal textual assinado com ponto, sem espaços, expoente, vírgula, sinal `+` ou zeros inteiros à esquerda. Converte diretamente para `bigint`. Frações além de duas casas só são aceitas quando todas as casas extras são zero (`1.2300` → 123 centavos); `1.005` é recusado sem arredondar. Null/ausência não entram nessa função: os normalizadores conservam null.

Limites defensivos locais: 80 caracteres por valor decimal e 10.000 eventos por cenário. Não são limites da API, teto comercial ou declaração de retenção. Não se usa o parser monetário numérico de Analytics. O comparador não calcula taxas. O leitor de antecipações preserva o percentual informado pelo provedor.

Somente eventos com impacto explicitamente `true` são somados. `false` exclui o evento do repasse e preserva seu valor ausente, se houver. Impacto null ou valor null em evento com impacto tornam o total inelegível. Nomes futuros não são classificados por inferência.

Para uma comparação elegível, ambas as identidades devem coincidir, as coberturas devem estar completas e as apurações encerradas. Cada fonte incompleta/pendente retorna total elegível null; nunca apresenta soma parcial como total conciliável. Diferença só é emitida quando não houver pendência.

```text
diferença = eventosComImpactoCentavos − liquidacaoCentavos
compatível se abs(diferença) × 10000 ≤ abs(liquidacaoCentavos)
```

**A referência `abs(liquidação)` é hipótese técnica explícita desta simulação, a confirmar antes de adaptar dados reais. Não é política oficial iFood nem decisão financeira nova.** O resultado expõe `baseConfirmadaParaDadosReais: false`. Não há piso de um centavo. Liquidação zero exige diferença zero; valor negativo usa a magnitude da liquidação. A comparação inteira evita arredondar a tolerância.

Exemplo: liquidação de R$ 10.000,00 aceita diferença de R$ 1,00 e rejeita R$ 1,01. Para liquidação de R$ 1,00, diferença de R$ 0,01 é rejeitada.

## Saída e limites

`conciliarFinancialSimulado` retorna origem/versão, as duas identidades, política, contagem de ocorrências, totais elegíveis em `bigint` ou null e estado `COMPATIVEL`, `DIVERGENTE` ou `PENDENTE`. A diferença mantém o sinal eventos menos liquidação. Motivos distinguem identidade, cobertura, apuração, impacto e valor ausente. Erros estruturais são exceções com código e mensagem fixa, sem conteúdo da entrada.

Saída em `bigint` não é JSON serializável diretamente. Um consumidor futuro precisa de contrato explícito de serialização, sem converter valores grandes para Number.

O plano de implementação fornecido registra uma diferença a confirmar nos futuros adaptadores: Sales por criação da venda e liquidações por apuração. Isso não foi revalidado integralmente nos contratos atuais nesta entrega. Não comparar períodos recentes só porque compartilham datas aparentes. Este contrato exige competência explícita e deixa apuração pendente sem concluir. Não altera preço, custo, taxa configurada, estimativa, receita, recebível, repasse, crédito bancário ou período do ERP.

Para avançar à conciliação com dados reais, comprovar moeda, escopo do merchant, produto, cobertura temporal e encerramento da apuração para as duas fontes. Confirmar também a base percentual. A aquisição do arquivo de Reconciliation tem contrato próprio. TEST oficial, homologação e autorização por loja seguem etapas específicas do plano.

## Leitura do Financial v3

As consultas recebem o transporte do chamador. O comando `npm run integracao:financial-simular` percorre duas páginas de eventos, uma liquidação, uma antecipação e duas páginas de vendas. Os cenários usam respostas sintéticas em memória. A saída JSON serializa centavos como strings de inteiros. Os parâmetros e campos foram conferidos na [referência oficial Financial v3.0](https://developer.ifood.com.br/es-CO/docs/references#financial).

| Operação GET em `/financial/v3.0/merchants/{merchantId}` | Consulta e resposta observadas |
| --- | --- |
| `/financial-events` | O adaptador informa `beginDate`, `endDate`, `page` a partir de 1 e `size=100`. O intervalo inclui até 33 datas civis. A referência também documenta o filtro opcional `idSaldo`. O modelo `FinancialEventsResponse` exige `page`, `size`, `hasNextPage` e `financialEvents`. O leitor confere os metadados da página solicitada e conserva as ocorrências. |
| `/settlements` | A consulta informa o par de datas de pagamento (`beginPaymentDate/endPaymentDate`) ou de apuração (`beginCalculationDate/endCalculationDate`). O modelo `ListTransferResponse` exige `beginDate`, `endDate`, `merchantId`, `balance` e `settlements`. O leitor verifica o merchant e as datas retornadas. |
| `/anticipations` | Por apuração, usa `beginCalculationDate/endCalculationDate`. Por pagamento antecipado, usa `beginAnticipatedPaymentDate/endAnticipatedPaymentDate`. O modelo `ListAnticipationsResponse` exige `beginDate`, `endDate`, `merchantId`, `balance` e `settlements`. O leitor confere o merchant e o intervalo devolvidos. |
| `/sales` | Informa `beginSalesDate`, `endSalesDate` e `page`, a partir de 1. O modelo `ListSalesResponse` exige as duas datas, `page`, `size`, `sales`, `total` e `pageCount`. O tamanho da página é informado pelo provedor na resposta. |

Nas quatro operações, o schema expandido apresenta um objeto. O exemplo 200 da mesma referência envolve esse objeto em uma lista. Os leitores identificam as duas representações e aceitam uma lista com exatamente um envelope. Uma lista vazia ou com vários envelopes produz erro de contrato. Cabe confirmar a forma retornada no ambiente TEST para cada consulta.

Nos eventos, `amount.value` é texto decimal assinado e `hasTransferImpact` indica impacto no repasse. Competência e período conservam o significado recebido. O identificador de referência pode pertencer ao pedido. Ocorrências iguais permanecem distintas. A página final encerra a navegação da consulta. Identidade de negócio, moeda e encerramento do mês exigem evidência adicional.

Em Settlements, `balance` e `amount` são números JSON. O leitor usa o literal numérico original antes de calcular centavos em `bigint`. Aceita decimais e notação exponencial quando representam exatamente centavos. Subcentavos significativos e valores além dos limites locais produzem erro. Campos opcionais sem valor permanecem nulos. O exemplo apresenta títulos diretos e grupos por datas de apuração com títulos em `closingItems`. A saída preserva saldo, grupos e títulos separadamente. O resumo de `consolidatedMerchants` indica se o envelope inclui outras lojas. A projeção descarta detalhes bancários, documentos e identificadores de transação.

Para Events, Settlements e Anticipations, HTTP diferente de 200 encerra a consulta com erro. O tratamento específico do 204 em Sales está abaixo. Falha de transporte, escopo divergente e paginação incompatível impedem usar o resultado. O cliente só devolve a lista de eventos depois da última página. Há limites locais de 2 MiB por resposta, 32 níveis JSON e 100 páginas de 100 eventos por execução. O leitor conserva a precisão numérica com o contexto de origem de `JSON.parse`, disponível no Node 22 utilizado pelo projeto.

O registro de um título `SUCCEED` descreve o estado enviado pelo provedor. A comparação com crédito bancário depende da evidência desse crédito. Para levar as leituras ao comparador do PR49, é preciso demonstrar a correspondência entre eventos, produto, competência, consolidação e saldo. Nesta entrega o comando exibe os valores recebidos na simulação e mantém essas verificações pendentes.

### Antecipações

Em `settlements[].closingItems[]`, cada título conserva seu tipo, estado, datas original e antecipada e os valores informados. `originalPaymentAmount`, `anticipatedPaymentAmount` e `feeAmount` são valores monetários e seguem a conversão exata para centavos. `feePercentage` é um percentual. A saída `taxaPercentual` preserva sua representação numérica original em texto, inclusive casas decimais e notação exponencial. Na simulação, a taxa de R$ 0,10 resulta em `taxaCentavos: "10"` e o percentual de 0,125% em `taxaPercentual: "0.125"`.

A ausência de um valor fica explícita. Um grupo com lista vazia é distinguível de um grupo que omitiu os títulos. Saldo, grupos e valores dos títulos permanecem separados. O merchant do envelope identifica a consulta. A atribuição contábil do saldo a uma loja e a um produto depende de evidência adicional de consolidação e moeda. O cálculo de uma taxa efetiva depende da confirmação de sua base. Cada título conserva as datas do provedor, mesmo quando o período da consulta se refere a outra dimensão.

A consulta lê uma resposta e informa `cobertura: "NAO_COMPROVADA"`. A referência v3 apresenta filtros de datas. O guia de homologação exige paginação e suporte a D+1 e D+7. O comportamento de paginação, a cobertura do período e os dois regimes aguardam verificação em TEST. [Critérios oficiais de homologação](https://developer.ifood.com.br/en-US/docs/food/guides/modules/financial/homologation)

### Vendas

A listagem começa na página 1 e segue até `pageCount`. O cliente confere a página recebida, o período, os totais informados e a identidade da loja em cada venda. O tamanho pode variar entre páginas. Antes de devolver a lista, o cliente verifica se a quantidade de IDs distintos coincide com o total da consulta. Exige localmente `id` e `merchant.id` em cada venda para conferir a loja e detectar repetições. Uma página incompatível interrompe a leitura inteira. O campo `createdAt` conserva o instante original de criação. A referência descreve o intervalo como datas de venda. A correspondência exata do filtro com o dia de criação e o fuso da loja aguarda validação em TEST.

O leitor mantém separados os componentes de `saleGrossValue`, o saldo de `billingSummary.saleBalance`, os lançamentos de `billingEntries` e os métodos de pagamento com valor, moeda e responsável. O schema descreve os valores monetários como textos decimais e o exemplo também traz números JSON. O leitor converte as duas formas em centavos exatos e conserva os opcionais ausentes. O saldo da venda e a responsabilidade pelo pagamento exigem evidência própria para conciliá-los com um crédito bancário.

Uma leitura 200 coerente devolve a lista e o total informado. Um 204 vazio, mesmo em página intermediária, devolve `INCONCLUSIVO_204` e o número da página, sem lista nem total. O contrato da operação consultado documenta 200 e 400. O significado do 204 observado anteriormente aguarda confirmação em TEST. A simulação limita cada consulta a 90 datas civis inclusivas, 100 páginas e 10.000 ocorrências somadas entre vendas, lançamentos e formas de pagamento. Esses limites são locais. O fim da paginação comprova apenas que foram lidas as páginas declaradas pelo provedor.

## Verificação

Para conferir os quatro leitores, a precisão do JSON e as consultas por transporte simulado, execute `npm test -- tests/ifood-financial-v3-consultas.test.ts tests/ifood-financial-v3-eventos.test.ts tests/ifood-financial-v3-liquidacoes.test.ts tests/ifood-financial-v3-antecipacoes.test.ts tests/ifood-financial-v3-vendas.test.ts`. O comando cobre fronteiras de data e dinheiro, percentuais, falha em página intermediária, HTTP 204 e preservação das ocorrências. A demonstração pelo comando `integracao:financial-simular` usa as mesmas funções de consulta.

`npm test -- tests/ifood-financial-dominio.test.ts` executa os casos sintéticos: precisão, negativos, ausência, limites, identidade/origem, fontes não intercambiáveis, impacto, ocorrências iguais, cobertura/apuração, fronteira de 0,01%, zero, valor grande e imutabilidade. Não necessita de banco nem rede. Esses testes não aprovam o portão ERP nem demonstram integração ou operação real.
