# ERP · Integridade dos números — retomada de 23/10/2026

Primeiro bloco da fila do Notion ("Integridade, cálculo e validação"). Arquivo próprio para não colidir com a
sessão que entrega a L.3 em `ERP.md` e `DECISOES.md` (branch `bruce/charming-wright-lyj09z`, ativa em 23/10).
Quando as duas entregas forem integradas, este conteúdo pode virar seção do `ERP.md` e decisões numeradas.

## Entrega N.1 — teste de duas lojas (ponto 1) e conta pura da meta de CMV

### Ponto 1 — custo de reposição × valorização do estoque e CMV do período

**Estado de hoje, medido no Postgres** (`tests/erp-custo-duas-lojas.db.test.ts`):

| Onde | Custo usado hoje | Fonte no código |
|---|---|---|
| Ficha técnica e precificação (reposição) | última compra lançada da **rede inteira**; sem compra, o cadastro | `compras-custo.ts` (`ultimasCompras`), decisão 65 |
| Retrato do estoque na abertura e no fechamento | o mesmo custo de referência da rede | `contagem.ts` (`custosDeReferencia` ao concluir) |
| Saídas do livro (requisição, produção, ajuste) | o mesmo custo de referência da rede | `requisicao.ts`, `producao.ts` |
| CMV real do período | estoque inicial + compras da loja − estoque final (retratos acima) | `cmv.ts` |

Cenário do teste: insumo a R$ 10,00/kg; lojas A e B abrem com 10 kg (R$ 100,00 cada); **só a loja A** compra
5 kg a R$ 20,00/kg; a loja B não compra nem consome nada.

| Medida | Resultado observado |
|---|---|
| Custo de reposição da rede | R$ 20,00/kg (correto para precificar) |
| Retrato da abertura da loja B (já gravado) | continua R$ 100,00 (histórico não muda) |
| Livro da loja B (`SaldoEstoque.valorCentavos`) | continua R$ 100,00 |
| Retrato do fechamento de setembro da loja B | **R$ 200,00** (10 kg × o preço que só a A pagou) |
| CMV real de setembro da loja B | **−R$ 100,00** (R$ 100,00 + R$ 0,00 − R$ 200,00) |

**Conclusão:** a contaminação entre lojas descrita no ponto 1 existe. A compra de uma loja muda a valorização do
estoque e o CMV real de outra. O histórico já gravado não é reescrito.

**Bloqueio:** corrigir exige escolher o método de valorização do estoque, e o plano diz que ele **não foi
decidido**. Nada foi alterado no cálculo. Opções levantadas (o custo de reposição da ficha continua a última compra
da rede em todas):

| Opção | O que muda | Prós | Contras |
|---|---|---|---|
| A. Última compra **da própria loja** (sem compra na loja: rede, depois cadastro) | retrato e saídas usam o último preço da loja | menor mudança; mesma lógica da decisão 65, por loja | loja que nunca comprou ainda herda o preço da rede |
| B. Custo médio ponderado **da loja** | retrato e saídas usam valor ÷ quantidade do livro da loja | número contábil mais estável | as saídas de hoje entram pelo preço da rede: o livro precisa ser corrigido junto |
| C. PEPS (primeiro que entra, primeiro que sai) | custo por lote | mais exato | depende de lote por entrada (liga com a 3.4); mudança grande |

As expectativas marcadas "HOJE (decisão pendente)" no teste mudam junto com a correção, quando o método for decidido.

### Correção independente aprovada — preço pela meta de CMV (conta pura)

Decisão do Notion "precificar pela meta de CMV; margem como resultado" + pontos 2 e 17.
Arquivo novo `src/lib/erp/cmv-produto-campos.ts` (puro, sem banco):

- custo físico = ingredientes/pré-preparos + embalagens do canal; a taxa fica fora;
- sugerido = custo físico ÷ meta de CMV do canal, para cima ao centavo;
- CMV teórico = custo físico ÷ preço **definido pela pessoa**; a sugestão não conta como preço praticado;
- farol: dentro (≤ meta) · acima · sem dados (com o motivo) · não ofertado;
- "Resultado após os custos informados" = preço − custo físico − taxa do canal, com as parcelas listadas;
  nunca "lucro líquido";
- taxa do iFood não configurada não invalida CMV nem sugestão, só deixa o resultado pendente;
- a conta antiga por margem-alvo (`preco-campos.ts`) segue intacta; nenhuma margem é convertida em meta.

Ainda **não ligada às telas**: falta gravar a meta por canal, a tela de configuração, e trocar detalhe/lista da
ficha para o farol de CMV (próxima entrega, N.2).

### Testes executados (23/10/2026, Postgres 16 local, banco de teste isolado)

| Suíte | Resultado |
|---|---|
| `tests/erp-cmv-produto.test.ts` (cenário de referência completo + variações) | 23 aprovados |
| `tests/erp-custo-duas-lojas.db.test.ts` (ponto 1, com banco) | 5 aprovados |
| `tests/erp-retrato-estoque.db.test.ts` + `tests/erp-cmv.db.test.ts` (regressão) | 32 aprovados |
| `npm run typecheck` | sem erro |
| Validação em produção | não executada (fora do escopo) |

## Entrega N.2 — meta de CMV por canal ligada à Precificação, à ficha e à lista

### O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Precificação | margem-alvo por canal comandava a sugestão | **meta de CMV por canal** (form próprio, versão, histórico); margem-alvo antiga fica guardada num bloco recolhido "registro antigo", sem uso |
| Ficha · "Preço e CMV por canal" | custo do canal com taxa, sugerido por margem, margem bruta e líquida | custo físico (insumos + embalagens) separado da taxa; meta; sugestão = custo físico ÷ meta (botões "usar"); preço de venda; CMV com farol em palavra; "Resultado após os custos informados" com as parcelas e "não é lucro líquido" |
| Preço vazio | valia o sugerido | **não definido**: CMV e resultado ficam "sem dados" (a sugestão não é preço praticado). Nenhum preço gravado mudou |
| Lista de fichas | margem líquida por canal | preço, CMV, farol e meta **por célula de canal** (desktop); linha "CMV: …" no tablet/celular |
| Histórico do preço | margem líquida e custo com taxa | preço definido, CMV (meta e farol), resultado e custo físico na hora; campos novos escondidos de quem não vê preços |

Arquivos: `prisma/migrations/20261108000000_erp_meta_cmv_canal` (coluna nula `CanalConfig.metaCmvPadraoBp`, CHECK 1–9.999, aditiva),
`src/lib/erp/canais.ts` (`salvarMetasDeCmv`, `cmvDaLista`, `cmv` no detalhe), `src/lib/erp/cmv-produto-campos.ts` (retrato),
`src/lib/erp/historico.ts`, telas em `src/components/erp/telas/fichas/` (`custo-por-canal.tsx`, `lista.tsx`, `canais.tsx`,
`form-metas-cmv.tsx`) e as ações/páginas nas duas árvores (`/erp` e `/rodolfo/erp/[slug]`).

Decisões tomadas na execução (reversíveis, sem efeito em dado):
- meta guardada **por parceiro e canal** (mesmo lugar da taxa e da antiga margem-alvo); vigência = valor atual, com histórico;
- a meta do iFood só grava com a taxa do iFood configurada: a linha do iFood nasce com a taxa, e criá-la antes faria a taxa
  "não configurada" virar 0% em silêncio;
- preço vazio = não definido (antes era "usar o sugerido"); assim a troca de base da sugestão não muda preço de ninguém.

### Testes executados (23/10/2026, Postgres 16 local)

| Suíte | Resultado |
|---|---|
| `tests/erp-cmv-produto.db.test.ts` (cenário de referência de ponta a ponta: nota → ficha → embalagens → taxa → metas → preços; conflito, faixa, permissão, lista = detalhe, operador sem dado financeiro) | 8 aprovados |
| `tests/erp-precos.db.test.ts` (1.10, expectativas do histórico atualizadas para CMV; veto do Guardião ampliado para CMV/resultado/custo físico) | 11 aprovados |
| Suíte inteira com banco (`ERP_DB_TESTE`) | 128 arquivos, 2.481 aprovados, **44 pulados**, 0 falhas |
| `npm run typecheck`, `eslint` nos arquivos mexidos, `npm run gate` | limpos |
| Telas no navegador (Chromium, app local com banco de teste) | ficha, lista e Precificação a 1440, 1180 (tablet deitado), 820 (tablet em pé) e 390 px: sem rolagem lateral, nada escondido |

Os 44 pulados são variantes das provas de migração que exigem papéis de banco não-superusuário (`papelExiste`) e não
existem neste Postgres local. Não foram executados; não contam como aprovados.

### Limites e pendências

- Filtro da lista por status de CMV por canal (dentro/acima/sem dados) **não feito**: precisa filtrar no servidor sobre o
  conjunto todo, em `fichas.ts`, que a sessão da L.3 está mexendo. Próxima entrega.
- Texto de ajuda "Como a conta é feita" (`ajuda-textos.ts`) ainda descreve a margem-alvo: arquivo em edição pela L.3;
  atualizar depois da integração.
- Canal "não ofertado" existe na conta, mas não há como marcar na ficha ainda (`ProdutoCanal.ativo` sem tela).
- Ponto 1 continua bloqueado na escolha do método de valorização (ver N.1).
- Nada publicado: sem merge, sem deploy.
