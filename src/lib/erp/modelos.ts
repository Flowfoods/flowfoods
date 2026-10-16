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

/**
 * Acesso das pessoas dos parceiros (0.3): FORA do tenant de propósito — e-mail,
 * senha, link, rosto e sessão são lidos ANTES de saber o parceiro (no login).
 * Três deles têm `parceiroId` (o vínculo, o link e a sessão) e mesmo assim não
 * são dado de negócio do parceiro: o que muda neles vai para o histórico DO
 * parceiro. Só `src/lib/erp/credenciais.ts` toca nestes modelos: o `prisma` do
 * portal recusa em runtime e o teste-guarda reprova uso fora do módulo.
 */
export const MODELOS_DE_CREDENCIAL = [
  'usuarioErp',
  'acessoParceiro',
  'conviteAcesso',
  'passkeyErp',
  'desafioWebauthn',
  'sessaoErp',
  'tentativaEntradaErp',
  // 0.4: perfil próprio do parceiro. Lido na validação da sessão (antes do
  // contexto do parceiro), por isso mora aqui e não no tenant.
  'perfilAcesso',
] as const;

/** Relações do ParceiroFlow que chegam nas credenciais (mesma trava do portal). */
export const RELACOES_DE_CREDENCIAL = ['erpAcessos', 'erpConvites', 'erpSessoes', 'erpPerfis'] as const;

const NOMES_DE_CREDENCIAL = new Set<string>(MODELOS_DE_CREDENCIAL.map((m) => m[0].toUpperCase() + m.slice(1)));

export function ehModeloDeCredencial(model: string | undefined): boolean {
  return !!model && NOMES_DE_CREDENCIAL.has(model);
}

/**
 * Onboarding (0.5): o pedido de acesso de um futuro parceiro mora FORA do
 * tenant — nasce antes de existir parceiro, e spam nunca vira ParceiroFlow.
 * Só `src/lib/erp/pedidos.ts` e a ativação em `credenciais.ts` tocam nestes
 * modelos: o `prisma` do portal recusa em runtime, o teste-guarda reprova o
 * resto e o papel `erp_tenant` não tem GRANT. Nenhum carrega `parceiroId` (o
 * vínculo com o parceiro criado se chama `parceiroCriadoId`).
 */
export const MODELOS_DE_PEDIDO = ['pedidoParceiro', 'pedidoParceiroEvento', 'tentativaPedidoParceiro'] as const;

/** Relações do ParceiroFlow que chegam nos pedidos (mesma trava do portal). */
export const RELACOES_DE_PEDIDO = ['erpPedidoDeOrigem'] as const;

const NOMES_DE_PEDIDO = new Set<string>(MODELOS_DE_PEDIDO.map((m) => m[0].toUpperCase() + m.slice(1)));

export function ehModeloDePedido(model: string | undefined): boolean {
  return !!model && NOMES_DE_PEDIDO.has(model);
}

export class ErroDeTenant extends Error {
  constructor(mensagem: string) {
    super(`[tenant] ${mensagem}`);
    this.name = 'ErroDeTenant';
  }
}
