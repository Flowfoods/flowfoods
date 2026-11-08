# Analytics — contrato diário e distribuições marginais

O contrato separa resposta agrupada válida, cobertura completa e compatibilidade
com a consulta diária. Nenhum desses estados autoriza uma loja nem publica
faturamento. O módulo é puro; não possui acesso a banco, cofre ou rede.

## Evidência usada

O corpo em `tests/fixtures/ifood-analytics-test-oficial-20261107.json` é a massa
padronizada TEST devolvida pelo iFood em 07/11/2026, 16:17:51 UTC. Não contém
pedidos ou pessoas de clientes reais, credenciais ou identificadores de loja.
SHA-256 do JSON compacto sem quebra final:
`3c78c4a9bd91d55b14c17de9c6ee3817c93940a0938fee950a62a122ca46f067`.
A cadeia de origem e a evidência integral ficam no plano privado de integração.

Foi solicitada a consulta diária em D-1. Vieram 20 grupos, página 1 de 5,
total declarado 91, apenas `gmv`/`gmvWithoutDelivery` e dimensões diferentes das
solicitadas: `dayOfWeek` e `paymentMethod` adicionais, sem `category`. O corpo é
válido, mas não fecha a cobertura nem corresponde ao grão diário. Não acrescentar
zeros, multiplicar a página por cinco, inferir pedidos por totalItems ou apagar
dimensões para aparentar compatibilidade. Não consultamos páginas adicionais
nesta entrega; repetição entre páginas é cenário negativo sintético de teste.

Fontes oficiais consultadas em 07/11/2026:

- [Critérios de homologação](https://developer.ifood.com.br/en-US/docs/food/guides/modules/analytics/homologation): resposta padronizada TEST, distinta de produção; limites de page/size.
- [Endpoints](https://developer.ifood.com.br/en-US/docs/food/guides/modules/analytics/endpoints): campos e agregados, paginação e valores em moeda local.
- [Funcionamento](https://developer.ifood.com.br/en-US/docs/food/guides/modules/analytics/workflow): métricas e agrupamentos.

As páginas completas responderam 403 à ferramenta de consulta; os trechos
indexados oficiais estavam disponíveis. O formato agrupado também foi verificado
na resposta efetiva. Não houve nova chamada à API nem reprodução de homologação.
O Blueprint privado foi consultado; seu conteúdo não foi copiado para o repositório.

## Limites do contrato

- Montadores mínimo, diário e de distribuições usam datas civis reais, intervalo
  inclusivo/exclusivo, página 1–1000, tamanho 1–10000 e omitem sort. A guarda D-1
  continua no leitor, com a data atual de Brasília. `ontemNoFuso` serve outros
  fusos explícitos. A marginal de pagamentos tem contrato próprio versionado
  descrito abaixo; o parser agrupado não aceita esse retorno como uma linha diária.
- Enums novos são preservados, assim como dimensões adicionais no corpo validado.
  A compatibilidade diária exige exatamente as quatro dimensões pedidas e as
  seis somas solicitadas. Campo presente nulo continua nulo; ausente não vira zero.
- Recibos devem ser vinculados pelo cliente à requisição realmente enviada.
  A identidade inclui ambiente, merchant, dia e perfil. Conferir igualdade não
  autentica a origem do arquivo nem substitui autorização por parceiro/loja.
- As páginas formam prefixo sequencial desde 1, com metadados estáveis, índice
  solicitado correto e grupos únicos pela chave completa. Tamanho efetivo pode
  diferir do pedido. A última página pode declarar o tamanho restante. Totais,
  número de páginas e quantidade de linhas precisam fechar. Zero de páginas
  recebidas é incompleto. Vazio oficial exige conjuntamente data vazia,
  totalItems=0, totalPages=0 e currentPage=1; size pode ser zero ou um tamanho válido.
- Normalização diária revalida os recibos. Não aceita um objeto previamente
  rotulado completo. Não calcula médias de médias, não mistura estados e não
  publica um dia parcial. Quantidade de pedidos vem de groupByKey.count.

## Pagamentos — INT-1.8C, versão 1

O perfil `pagamentos` solicita `terms.paymentMethod.count`, sem `groupBy`,
recorte comercial ou métrica monetária. Usa o dia civil com fim exclusivo,
página 1 e tamanho 1. Sua identidade inclui ambiente, merchant UUID canônico,
dia, fuso persistido, perfil e versão 1. Não reutiliza recibos do perfil diário.

O envelope aceito contém exatamente um item em `data`, `currentPage=1`,
`size=1`, `totalItems=1` e `totalPages=1`. O item contém `paymentMethod`,
com agregado nulo ou mapa `value` de método para contagem; `cardinality`,
quando presente, não é denominador. Uma resposta agrupada parcial, como a
fixture TEST acima, não demonstra cobertura desta marginal e é recusada.

Contagens são ocorrências de métodos de pagamento, **não pedidos únicos**.
O total marginal é a soma dessas ocorrências e serve de denominador à sua
distribuição; não se usa o total de pedidos diário. Não há conversão monetária.
Cada contagem precisa ser inteira, não negativa e até `Number.MAX_SAFE_INTEGER`.
O texto JSON original é validado antes de aceitar números de `JSON.parse`,
incluindo integralidade decimal exata e chaves duplicadas com escapes. Valores
fracionários que o Number arredondaria para inteiro também são recusados.

O normalizador devolve `parcelas: null | [{metodo, ocorrencias}]`, com contagens
em strings inteiras canônicas. O agregado nulo fica como SQL NULL: falta dado.
Mapa vazio vira array vazio: total explícito zero. Método com contagem zero
continua presente. Métodos desconhecidos e nomes literais como `null` ou
`__proto__` são preservados sem classificação implícita. Limites locais:
2 MiB por corpo, 2.000 métodos e 800 bytes UTF-8 por nome; ultrapassá-los recusa
o recorte inteiro, sem truncá-lo. O SQL reconfere o corpo e as parcelas.

O snapshot marginal e sua versão não preenchem `KpiIfoodDia` nem faturamento.
No painel, a cobertura exige uma versão PUBLICADO para cada fonte/dia
selecionado e é independente da cobertura diária. Uma fonte ausente ou
incompatível impede a soma parcial do período; NULL propagado continua ausência.
Uma revisão PENDENTE_PERIODO é indicada sem substituir a última PUBLICADO.

Este contrato foi implementado a partir da documentação oficial citada e de
casos sintéticos. **Não há resposta marginal real completa capturada nesta
entrega.** A fixture oficial agrupada não foi convertida em marginal, e nenhum
valor TEST é preenchido no produto. A implementação não homologa apps nem
autoriza ou ativa a coleta de uma loja.

## Horário e primeiro pedido — INT-1.8D, versão 1

O perfil `complementares` solicita somente `terms.orderCreationHour.count` e
`terms.customerFirstOrderInMerchant.count`, sem groupBy, métricas ou pagamento.
Usa uma página de tamanho 1, um item completo e identidade de ambiente,
merchant UUID canônico, dia, fuso persistido, perfil e versão. O builder legado
`consultaDistribuicoes` mantém sua consulta de três termos; não é usado pelo
novo perfil de dois termos.

Os dois campos devem estar presentes no item. Cada um aceita null explícito
ou objeto `value` com mapa de contagens e `cardinality` opcional. Campo ausente,
extra ou envelope incompleto recusa a publicação. Cada mapa mantém NULL,
vazio e zero informado sem completar um com o outro. Cardinalidade não é total
de ocorrências. Chaves desconhecidas não são removidas nem convertidas.

O scanner puro compartilhado com pagamentos preserva duplicatas/Unicode e
prova os inteiros a partir do léxico original antes do arredondamento de
JSON.parse. Os limites são 2 MiB de corpo, 2.000 termos por campo, 800 bytes
por chave e contagem não negativa até MAX_SAFE; somas posteriores usam BigInt.
Campos normalizados têm `{termo, ocorrencias}` com contagem decimal textual.
O SQL reconfere os dois mapas contra o raw; JSON null não substitui SQL NULL.

O rótulo de hora não promete conversão para Brasília: o fuso do recorte não
documenta o fuso dos buckets. São horas reconhecidas apenas as chaves canônicas
0–23; outras permanecem distintas. Não há zero implícito em horas ausentes.
Primeiro pedido é por merchant. Mais de um merchant na mesma loja ERP não
permite deduplicar pessoas, inferir retenção ou dizer clientes únicos.

Os denominadores são as ocorrências de cada distribuição, incluindo termos
desconhecidos apresentados. Não somar os dois totais nem cruzar os buckets
entre si, com pagamento ou com o grão financeiro. Cobertura exige snapshot
PUBLICADO próprio por fonte/dia, com disponibilidade de cada campo independente.
Revisão pendente não substitui a última versão publicada.

O contrato usa os ModelTermFields documentados na referência oficial acima.
Não foi capturada resposta marginal real completa para estes campos. Nenhum
valor TEST é inferido ou incorporado ao produto. A persistência não alimenta
KPI diário, faturamento ou DRE e não ativa configurações.

## Dinheiro

A conversão exige `{ moeda: 'BRL', unidade: 'REAL' | 'CENTAVO' }` explícito,
conforme contrato confirmado para a fonte. Nunca deduz escala pelo valor nem
aplica o parser brasileiro de formulários ao número JSON. São aceitos zero,
nulo e valores negativos, conservando o sinal; a política de cada indicador é
responsabilidade da fatia consumidora.

Em REAL, o decimal representado pelo Number é convertido com BigInt. Subcentavos
são recusados, sem decidir arredondamento comercial. Como o transporte existente
usa JSON.parse, reais com módulo maior ou igual a 2^45 são recusados: o Number
pode já ter perdido centavos. Abaixo desse limite, o espaçamento é menor que meio
centavo. CENTAVO exige inteiro seguro. Somas usam BigInt, conferem o resultado e
propagam nulos. A função não recupera um lexema monetário já perdido pelo transporte.

## Diagnóstico sem nova chamada

No worker, para a evidência original do leitor:

```sh
npm run integracao:validar-analytics-test -- --arquivo /tmp/integracao-leituras/leitura-test-....json
```

Não precisa exportar segredos. O comando não chama API nem banco. Confere o app
TEST, método, caminho e consulta diária registrados; exibe apenas diagnóstico e
requestId, sem corpo bruto. Aceita arquivo regular até 10 MiB.

- Saída 0: formato, páginas e campos diários compatíveis; dinheiro não avaliado.
- Saída 1: evidência válida, mas parcial ou incompatível com a consulta diária.
- Saída 2: arquivo ou contrato inválido.

**A fixture oficial deve produzir saída 1.** Isso não desfaz os HTTP 200 da
INT-1.4. Demonstra a proteção que a futura INT-1.6 deve respeitar. Testes de janela
completa e de normalização usam massa sintética identificada, sem alegar cobertura
oficial dos 91 grupos. O diagnóstico acima permanece específico do contrato
diário; não valida pagamentos nem distribuições complementares. Jobs, ponte financeira,
homologação e acesso produtivo têm gates próprios.
