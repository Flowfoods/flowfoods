# Financial — contrato local de simulação, versão 1

Recorte das INT-2.2/2.3: domínio, normalização monetária e comparação pura de eventos com impacto no repasse versus liquidação. Não encerra as INT-2.2–2.4, nem a integração Financial.

As únicas entradas aceitas têm `origem: SIMULACAO`. Essa marca é uma exigência do contrato, não uma verificação da proveniência de qualquer dado que alguém forneça. Usar exclusivamente cenários sintéticos. Não importar dados reais.

Os módulos não chamam HTTP, OAuth, banco, worker, UI, DRE ou Home. Não concedem acesso, homologam apps, ativam lojas, criam receita, substituem taxas nem alteram/reabrem períodos. A comparação pode ser compatível em uma simulação sem comprovar conciliação operacional, pagamento ou crédito bancário.

## Autoridade e fontes

O plano vigente autoriza esta construção independente e estabelece tolerância de **0,01%**. A independência técnica não libera chamadas reais, homologação ou produção.

- [Financial Events — guia oficial](https://developer.ifood.com.br/es-CO/docs/guides/modules/financial/api-financial-events): o conteúdo oficial indexado descreve `amount.value` textual, sinal de crédito/débito, `hasTransferImpact` e paginação própria `page/size/hasNextPage`.
- [Homologação Financial — guia oficial](https://developer.ifood.com.br/en-US/docs/food/guides/modules/financial/homologation): cada API tem seus dados e critérios; integração parcial não representa homologação completa.
- [Reconciliation — guia oficial](https://developer.ifood.com.br/es-CO/docs/guides/modules/financial/api-reconciliation/): distingue lançamentos com impacto e apresenta um exemplo com tolerância fixa de R$ 0,01. Esse exemplo não substitui a tolerância percentual do plano FlowFoods.

Consulta de 10/11/2026: os endereços diretos retornaram indisponibilidade/403; os detalhes acima foram obtidos do conteúdo oficial indexado. Não houve revalidação integral ao vivo dos schemas. Não há adaptador de payload do provedor neste recorte. Cada futuro adaptador Sales, Financial Events, Settlement, Anticipation e Reconciliation exige confirmação do contrato próprio; nenhum envelope, escala ou paginação é inferido de Analytics.

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

Limites defensivos locais: 80 caracteres por valor decimal e 10.000 eventos por cenário. Não são limites da API, teto comercial ou declaração de retenção. Não se usa o parser monetário numérico de Analytics. Percentuais de taxa também não são tratados como dinheiro: normalização/cálculo de taxas não fazem parte deste recorte.

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

Pendências antes de adaptação real: schemas/nulabilidade e versões atuais de cada API, paginação/204 de Sales, campos/precisão de Settlement e Anticipation, identidade de eventos, cobertura temporal e contrato do CSV/on-demand; confirmação da base percentual. Simulação não substitui TEST oficial, homologação, grants nem autorização por loja.

## Verificação

`npm test -- tests/ifood-financial-dominio.test.ts` executa os casos sintéticos: precisão, negativos, ausência, limites, identidade/origem, fontes não intercambiáveis, impacto, ocorrências iguais, cobertura/apuração, fronteira de 0,01%, zero, valor grande e imutabilidade. Não necessita de banco nem rede. Esses testes não aprovam o portão ERP nem demonstram integração ou operação real.
