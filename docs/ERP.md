# ERP Barney — fatia vertical (Passo zero) + fundação do banco (0.1)

Plano, fases e ordem: página "FlowFoods Barney — ERP" no Notion. Este arquivo
só diz como ver a fatia funcionando e quais regras o código já trava.

## O que existe

| Peça | Onde |
|---|---|
| Parceiro Flow (tenant) e Insumo | `prisma/schema.prisma` (bloco ERP) + migration `20261015000000_erp_insumo` |
| Esquema inteiro de Ficha, Estoque, Produção e DRE (0.1) | bloco ERP + migration `20261015010000_erp_fundacao` |
| Portão de tenant (`doParceiro`) | `src/lib/erp/tenant.ts` |
| Milésimos e centavos (texto → inteiro, arredondamento) | `src/lib/erp/unidades.ts` |
| Regra de cadastro | `src/lib/erp/insumos.ts` |
| Telas | `/rodolfo/erp` (parceiros) e `/rodolfo/erp/<slug>` (insumos) |

## Mapa do esquema (0.1)

Toda tabela abaixo tem `parceiroId` (tenant) e só se acessa por `doParceiro`.

| Bloco | Tabela | Para quê |
|---|---|---|
| Estrutura | `ParceiroFlow` | N2, o tenant. Ganhou `periodoTipo`/`periodoDiaInicio` (sugestão de período do DRE) |
| Estrutura | `Loja` | N3, loja/unidade do parceiro; estoque, produção e faturamento são por loja |
| Estrutura | `Marca` | marca do grupo; produto e faturamento podem apontar marca |
| Estrutura | `Colaborador` | pessoa da operação; âncora do histórico por funcionário (login vem na 0.3) |
| Insumos | `Insumo` | já existia; ganhou tipo (ingrediente/embalagem/pré-preparo), taxa de entrega, conservação e validade por conservação, mínimo, fornecedor padrão, origem |
| Insumos | `InsumoVariante` | outras embalagens de compra do mesmo insumo |
| Compras | `Fornecedor` | quem vende |
| Compras | `NotaEntrada` / `NotaEntradaItem` | nota de compra e itens com snapshot; só mexe no estoque quando LANCADA |
| Ficha | `FichaTecnica` | prato ou pré-preparo, rendimento; pré-preparo pode produzir um Insumo |
| Ficha | `FichaItem` | insumo OU subficha, quantidade líquida, fator de correção |
| Venda | `ProdutoVenda` | item de venda (aponta a ficha) |
| Venda | `ProdutoCanal` | preço por canal: manual sobrescreve o sugerido; margem-alvo |
| Venda | `ProdutoEmbalagem` | camada de embalagem por canal (delivery, iFood) |
| Venda | `CanalConfig` | taxa do canal (%, fixa) e margem-alvo padrão, por parceiro |
| Estoque | `SaldoEstoque` | saldo e valor por loja × insumo (cache dos movimentos, com versão) |
| Estoque | `MovimentoEstoque` | livro-razão: entrada, requisição, produção, ajuste, contagem, perda; snapshot e saldo antes/depois |
| Estoque | `Contagem` / `ContagemItem` | abertura, cíclica, fechamento de período; sistema × contado |
| Estoque | `Requisicao` / `RequisicaoItem` | pedido do setor; a baixa sai daqui |
| Produção | `OrdemProducao` | lote: planejado/produzido, custo, responsável (snapshot). Lista do dia = ordens planejadas × saldo (derivada) |
| Produção | `Etiqueta` | etiqueta impressa: lote do fornecedor, validade, abertura, snapshot |
| DRE | `FaturamentoLancamento` | faturamento por loja × canal × dia: valor, pedidos, clientes; chave de idempotência única |
| DRE | `DreLinha` / `DreMeta` | linhas do DRE e meta % por linha com vigência |
| DRE | `Despesa` | despesa manual/importada numa linha, por loja ou da rede |
| DRE | `PeriodoApuracao` | períodos configuráveis; contagem de fechamento aponta o período |
| DRE | `FarolFaixa` | 5 faixas do farol por canal |
| Auditoria | `HistoricoAlteracao` | antes/depois de todo corte, ajuste ou alteração sensível |

### Unidades inteiras

| Grandeza | Unidade guardada | Exemplo |
|---|---|---|
| Quantidade | milésimos da unidade base | 1,5 kg = 1500 |
| Dinheiro | centavos (`Int`) | R$ 89,90 = 8990 |
| Percentual, meta, taxa, margem | pontos-base | 12% = 1200 |
| Fator de correção/rendimento | milésimos | FC 1,18 = 1180 |
| Validade | minutos | 3 dias = 4320 |

Custo unitário nunca é gravado: guarda-se quantidade e valor total, e o
custo médio sai da divisão (em `unidades.ts`). Nada acumulado é gravado
(DRE, CMV, total do mês são somas), por isso não há `BigInt`.

## Regras travadas

- **Multi-tenant.** Modelo de tenant só se lê/grava por `doParceiro(id)`, que
  amarra o parceiro em toda query e estoura se alguém apontar outro.
  `tests/erp-tenant-portao.test.ts` reprova `prisma.<modelo>` cru e acesso pelas
  relações do ParceiroFlow fora do portão, e confere `MODELOS_DE_TENANT` e
  `RELACOES_DE_TENANT` contra o esquema. Para transação: `cliente.transacao(tx => …)`.
- **Inteiros.** Quantidade em milésimos da unidade base, dinheiro em centavos.
  O banco tem CHECK: quantidade > 0, preço >= 0 (e faixas de %/fator).
- **Tenant nas FKs.** Toda FK entre tabelas de tenant é composta
  `(parceiroId, xId) → (parceiroId, id)`: o banco recusa ficha de B com insumo
  de A, mesmo por SQL cru. O teste-guarda confere isso no esquema.
- **Livro-razão.** `MovimentoEstoque` e `HistoricoAlteracao` não aceitam
  UPDATE (trigger); correção é lançamento novo. Movimento tem CHECK de sinal
  por tipo e de saldo antes + quantidade = depois.
- **Idempotência.** `FaturamentoLancamento.chaveIdempotencia` é única por
  parceiro; movimento também aceita chave.
- **Origem.** `origem` MANUAL/IMPORTACAO/INTEGRACAO onde dado pode vir de fora.
- **Servidor decide.** O formulário manda texto; a conversão e o custo por
  unidade são calculados no servidor. A prévia na tela é só prévia.

## Ver funcionando (local, nunca produção)

```bash
# Postgres local com DATABASE_URL apontando para localhost no .env
npx prisma migrate deploy
npm run erp:seed-teste        # cria "Teste · Casa Alfa" e "Teste · Casa Beta"
npm run build && npm start    # entre em /rodolfo/login → menu ERP
```

## Provar o isolamento

```bash
ERP_DB_TESTE=postgresql://USUARIO:SENHA@localhost:5432/BANCO \
  npx vitest run tests/erp-isolamento.db.test.ts
```

Sem `ERP_DB_TESTE`, esse arquivo é pulado e a suíte padrão segue sem banco.
