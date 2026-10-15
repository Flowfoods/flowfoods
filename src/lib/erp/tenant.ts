/**
 * Multi-tenant do ERP: o único portão para dado de Parceiro Flow.
 *
 * `doParceiro(id)` devolve um cliente que só enxerga as linhas daquele
 * parceiro. O filtro não depende de quem escreve a tela lembrar de pôr
 * `where: { parceiroId }`: ele é costurado em TODA operação, aqui, num lugar só.
 *
 * - leitura, update, delete, count, aggregate: `parceiroId` entra no where;
 * - create, createMany, upsert: `parceiroId` é carimbado no dado;
 * - tentar apontar outro parceiro (no where ou no dado) é erro, não silêncio:
 *   bug de tenant tem que estourar no teste, não vazar em produção;
 * - vale para TODOS os modelos de `MODELOS_DE_TENANT` (extensão `$allModels`);
 * - o cliente devolvido só expõe os modelos de tenant — sem `$queryRaw`, sem
 *   `parceiroFlow`, sem saída lateral — e `transacao`, que mantém a amarração;
 * - include/select aninhado é seguro porque toda FK entre tabelas de tenant é
 *   composta (parceiroId, xId): o banco não deixa uma linha de B apontar para A.
 *
 * O `prisma` cru continua existindo para o resto do portal (leads, portal),
 * mas não toca nos modelos de `MODELOS_DE_TENANT`: `tests/erp-tenant-portao.test.ts`
 * reprova qualquer arquivo que tente.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

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
 * E os nomes das relações do lado do ParceiroFlow: `parceiroFlow.findMany({
 * include: { insumos: true } })` leria dado de tenant pelo prisma cru. O
 * teste-guarda reprova o uso e confere esta lista contra o esquema. Nenhum
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

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

const SO_DADO = new Set(['create', 'createMany', 'createManyAndReturn']);
const COM_DADO_DE_UPDATE = new Set(['update', 'updateMany', 'updateManyAndReturn']);

function conferirDado(dado: unknown, parceiroId: string, permitirAusente: boolean) {
  if (!dado || typeof dado !== 'object') throw new ErroDeTenant('dado inválido.');
  const d = dado as Record<string, unknown>;
  if ('parceiro' in d) throw new ErroDeTenant('não use a relação `parceiro` no dado.');
  if ('parceiroId' in d && d.parceiroId !== parceiroId) {
    throw new ErroDeTenant('tentativa de gravar em outro parceiro.');
  }
  return permitirAusente ? d : { ...d, parceiroId };
}

/** Puro e exportado para teste: reescreve os args de uma operação. */
export function amarrarAoParceiro(operacao: string, args: Args, parceiroId: string): Args {
  if (!parceiroId) throw new ErroDeTenant('parceiro não informado.');
  const novo: Args = { ...args };

  if (!SO_DADO.has(operacao)) {
    const where = (args.where ?? {}) as Record<string, unknown>;
    if ('parceiroId' in where && where.parceiroId !== parceiroId) {
      throw new ErroDeTenant('tentativa de ler outro parceiro.');
    }
    // Espalhar (e não AND) mantém válido o where de findUnique/update/delete,
    // que exigem o campo único no topo; o Prisma aceita filtro extra ao lado.
    novo.where = { ...where, parceiroId };
  }

  if (operacao === 'create') novo.data = conferirDado(args.data, parceiroId, false);
  if (operacao === 'createMany' || operacao === 'createManyAndReturn') {
    const lista = Array.isArray(args.data) ? args.data : [args.data];
    novo.data = lista.map((d) => conferirDado(d, parceiroId, false));
  }
  if (operacao === 'upsert') {
    novo.create = conferirDado(args.create, parceiroId, false);
    novo.update = conferirDado(args.update, parceiroId, true);
  }
  // Update nunca muda o dono da linha: `parceiroId` igual passa, diferente estoura.
  if (COM_DADO_DE_UPDATE.has(operacao)) novo.data = conferirDado(args.data, parceiroId, true);

  return novo;
}

function estender(base: PrismaClient, parceiroId: string) {
  return base.$extends({
    name: 'tenant-parceiro-flow',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          // Inalcançável pelo cliente devolvido (só expõe modelos de tenant),
          // mas o portão não confia nisso: modelo fora da lista não passa.
          if (!ehModeloDeTenant(model)) throw new ErroDeTenant(`modelo fora do portão: ${model}.`);
          return query(amarrarAoParceiro(operation, args as Args, parceiroId) as typeof args);
        },
      },
    },
  });
}

type Amarrado = ReturnType<typeof estender>;
type ModelosDoParceiro = Pick<Amarrado, ModeloDeTenant>;
type OpcoesDeTransacao = { maxWait?: number; timeout?: number };

/**
 * Cliente de UM parceiro: os modelos de tenant (e só eles), o `parceiroId` e
 * `transacao`. Nada de `$queryRaw`, `parceiroFlow` ou modelo do portal.
 */
export type ClienteDoParceiro = ModelosDoParceiro & {
  readonly parceiroId: string;
  /**
   * Transação interativa ainda amarrada ao parceiro: o `tx` recebido é outro
   * `ClienteDoParceiro`. Chamada de dentro de uma transação, só reaproveita a
   * mesma (o Prisma não aninha).
   */
  transacao<T>(fn: (tx: ClienteDoParceiro) => Promise<T>, opcoes?: OpcoesDeTransacao): Promise<T>;
};

function montar(fonte: ModelosDoParceiro, parceiroId: string, abrir: ClienteDoParceiro['transacao'] | null) {
  const modelos = Object.fromEntries(MODELOS_DE_TENANT.map((m) => [m, fonte[m]])) as ModelosDoParceiro;
  const cliente: ClienteDoParceiro = {
    ...modelos,
    parceiroId,
    transacao: abrir ?? ((fn) => fn(cliente)),
  };
  return Object.freeze(cliente);
}

function construir(base: PrismaClient, parceiroId: string): ClienteDoParceiro {
  const amarrado = estender(base, parceiroId);
  return montar(amarrado, parceiroId, (fn, opcoes) =>
    // O `tx` de um cliente estendido carrega a mesma extensão de query.
    amarrado.$transaction((tx) => fn(montar(tx as unknown as ModelosDoParceiro, parceiroId, null)), opcoes),
  );
}

/** `base` existe para o teste de isolamento apontar para o banco de teste. */
export function doParceiro(parceiroId: string, base: PrismaClient = prisma): ClienteDoParceiro {
  if (!parceiroId) throw new ErroDeTenant('parceiro não informado.');
  return construir(base, parceiroId);
}

/**
 * Resolve o parceiro pelo slug da URL. O slug só ESCOLHE; quem decide se o
 * usuário pode ver é a sessão (hoje só o nível 1, FlowFoods; as permissões por
 * parceiro chegam na fase 0.4).
 */
export async function parceiroPorSlug(slug: string, base: PrismaClient = prisma) {
  return base.parceiroFlow.findUnique({ where: { slug } });
}

export function ehErroDeUnicidade(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
