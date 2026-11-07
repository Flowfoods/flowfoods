# Analytics — contrato INT-1.5

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
  fusos explícitos. O retorno de distribuições marginais terá schema próprio
  quando sua forma real for confirmada; o parser agrupado não aceita esse retorno
  como se fosse uma linha diária.
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
oficial dos 91 grupos. A ponte com faturamento, distribuição por pagamento,
jobs, persistência, homologação e acesso produtivo continuam em suas fatias.
