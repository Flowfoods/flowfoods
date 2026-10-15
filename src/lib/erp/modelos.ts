/**
 * Listas do portão de tenant, sem dependência nenhuma: `src/lib/db.ts` (que
 * trava o prisma do portal) e `src/lib/erp/tenant.ts` (que abre o portão) leem
 * daqui sem import circular.
 */

/**
 * Todo modelo do ERP com `parceiroId` entra nesta lista (nome do delegate do
 * Prisma). `tests/erp-tenant-portao.test.ts` confere contra o esquema: modelo
 * com `parceiroId` fora da lista reprova.
 */
export const MODELOS_DE_TENANT = [
  'insumo',
  'loja',
  'marca',
  'colaborador',
  'fornecedor',
  'insumoVariante',
  'fichaTecnica',
  'fichaItem',
  'produtoVenda',
  'produtoCanal',
  'produtoEmbalagem',
  'canalConfig',
  'notaEntrada',
  'notaEntradaItem',
  'saldoEstoque',
  'movimentoEstoque',
  'contagem',
  'contagemItem',
  'requisicao',
  'requisicaoItem',
  'ordemProducao',
  'etiqueta',
  'faturamentoLancamento',
  'dreLinha',
  'dreMeta',
  'despesa',
  'periodoApuracao',
  'farolFaixa',
  'historicoAlteracao',
] as const;

export type ModeloDeTenant = (typeof MODELOS_DE_TENANT)[number];

/**
 * E os nomes das relações do lado do ParceiroFlow: incluir `insumos` num
 * `parceiroFlow.findMany` leria dado de tenant pelo prisma cru. O `prisma` do
 * portal recusa em runtime; o teste-guarda reprova o uso no código e confere
 * esta lista contra o esquema. Nenhum
 * modelo fora do tenant aponta para modelo de tenant além do ParceiroFlow.
 */
export const RELACOES_DE_TENANT = [
  'insumos',
  'erpLojas',
  'erpMarcas',
  'erpColaboradores',
  'erpFornecedores',
  'erpInsumoVariantes',
  'erpFichasTecnicas',
  'erpFichaItens',
  'erpProdutosVenda',
  'erpProdutoCanais',
  'erpProdutoEmbalagens',
  'erpCanaisConfig',
  'erpNotasEntrada',
  'erpNotaEntradaItens',
  'erpSaldosEstoque',
  'erpMovimentosEstoque',
  'erpContagens',
  'erpContagemItens',
  'erpRequisicoes',
  'erpRequisicaoItens',
  'erpOrdensProducao',
  'erpEtiquetas',
  'erpFaturamentos',
  'erpDreLinhas',
  'erpDreMetas',
  'erpDespesas',
  'erpPeriodosApuracao',
  'erpFarolFaixas',
  'erpHistoricoAlteracoes',
] as const;

const NOMES_DE_MODELO = new Set<string>(MODELOS_DE_TENANT.map((m) => m[0].toUpperCase() + m.slice(1)));

/** `model` como o Prisma passa à extensão ("FichaItem"). */
export function ehModeloDeTenant(model: string | undefined): boolean {
  return !!model && NOMES_DE_MODELO.has(model);
}

export class ErroDeTenant extends Error {
  constructor(mensagem: string) {
    super(`[tenant] ${mensagem}`);
    this.name = 'ErroDeTenant';
  }
}
