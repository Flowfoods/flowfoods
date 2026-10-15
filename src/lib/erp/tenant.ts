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
 * - o dado de create/update/upsert só aceita campos ESCALARES. Qualquer campo
 *   de relação (`ficha: { connect }`, `itens: { create }`, `connectOrCreate`,
 *   `set`...) é recusado: chave estrangeira entra como escalar (`fichaId`) e
 *   o banco confere o dono pela FK composta (parceiroId, fichaId). Sem isso,
 *   um `connect` numa relação composta regravaria o `parceiroId` da linha;
 * - e o banco, por trigger, não deixa nenhum UPDATE trocar o `parceiroId`;
 * - vale para TODOS os modelos de `MODELOS_DE_TENANT` (extensão `$allModels`);
 * - o cliente devolvido só expõe, por modelo, as operações de dado (findMany,
 *   create, update...), embrulhadas e congeladas: sem `$parent`, sem
 *   `$queryRaw`, sem `parceiroFlow` — e `transacao`, que mantém a amarração;
 * - include/select/where aninhado é seguro porque toda FK entre tabelas de
 *   tenant é composta: uma linha de B não consegue apontar para uma de A, então
 *   o que vem pendurado nela também é de B.
 *
 * O `prisma` do portal (`src/lib/db.ts`) é TRAVADO em runtime para os modelos
 * de tenant: qualquer operação neles (inclusive dentro de `$transaction`)
 * estoura. O portão usa um PrismaClient base próprio, privado deste módulo.
 * O SQL cru (`$queryRaw`) do prisma do portal continua possível: esse caminho
 * é vigiado pelo teste-guarda (`tests/erp-tenant-portao.test.ts`), não pelo runtime.
 *
 * Banco (0.2, Row-Level Security): toda operação do cliente roda numa transação
 * que entra no CONTEXTO do parceiro — `app.parceiro_id` e o papel `erp_tenant`
 * (migration `20261015020000_erp_multitenant`). Debaixo desse papel o Postgres
 * só devolve e só aceita linhas daquele parceiro, inclusive em SQL cru
 * (`cliente.sql`, o caminho certo para relatório). Cliente `somenteLeitura`
 * (parceiro suspenso) recusa escrita aqui E abre a transação como read-only.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { ErroDeTenant, ehModeloDeTenant, MODELOS_DE_TENANT, type ModeloDeTenant } from './modelos';

export { ErroDeTenant, ehModeloDeTenant, MODELOS_DE_TENANT, RELACOES_DE_TENANT } from './modelos';
export type { ModeloDeTenant } from './modelos';

// Cliente base do portão: separado do `prisma` do portal (que é travado para
// os modelos de tenant). Cache no globalThis pelo mesmo motivo de `db.ts`:
// o reload do Next em dev abriria um pool novo a cada edição.
const globalDoTenant = globalThis as unknown as { prismaDoTenant?: PrismaClient };

function baseDoTenant(): PrismaClient {
  if (globalDoTenant.prismaDoTenant) return globalDoTenant.prismaDoTenant;
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  // Um por processo (lazy: quem nunca abre o portão não abre o pool).
  globalDoTenant.prismaDoTenant = base;
  return base;
}

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

const SO_DADO = new Set(['create', 'createMany', 'createManyAndReturn']);
const ESCRITA = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/** Papel do banco com RLS (migration 20261015020000_erp_multitenant). */
export const PAPEL_DE_TENANT = 'erp_tenant';

/**
 * Primeira instrução de toda transação do portão. `true` em set_config = vale
 * só até o fim da transação: a conexão volta ao pool sem papel nem parceiro.
 * `role` via set_config é o mesmo que `SET LOCAL ROLE`, numa ida só.
 */
function sqlDeContexto(parceiroId: string, somenteLeitura: boolean): Prisma.Sql {
  return somenteLeitura
    ? Prisma.sql`SELECT set_config('app.parceiro_id', ${parceiroId}, true), set_config('role', ${PAPEL_DE_TENANT}, true), set_config('transaction_read_only', 'on', true)`
    : Prisma.sql`SELECT set_config('app.parceiro_id', ${parceiroId}, true), set_config('role', ${PAPEL_DE_TENANT}, true)`;
}
const COM_DADO_DE_UPDATE = new Set(['update', 'updateMany', 'updateManyAndReturn']);

/** Campos de relação de cada modelo, lidos do esquema (não de lista à mão). */
const RELACOES_POR_MODELO = new Map<string, ReadonlySet<string>>(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    new Set(m.fields.filter((f) => f.kind === 'object').map((f) => f.name)),
  ]),
);

function conferirDado(dado: unknown, parceiroId: string, permitirAusente: boolean, relacoes: ReadonlySet<string>) {
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) throw new ErroDeTenant('dado inválido.');
  const d = dado as Record<string, unknown>;
  for (const campo of Object.keys(d)) {
    if (relacoes.has(campo)) {
      throw new ErroDeTenant(
        `campo de relação \`${campo}\` no dado: grave a FK como escalar (ex.: \`fichaId\`) e filhos em operação própria.`,
      );
    }
  }
  if ('parceiroId' in d && d.parceiroId !== parceiroId) {
    throw new ErroDeTenant('tentativa de gravar em outro parceiro.');
  }
  return permitirAusente ? d : { ...d, parceiroId };
}

/**
 * Puro e exportado para teste: reescreve os args de uma operação de `modelo`
 * (nome como o Prisma passa: "FichaItem").
 */
export function amarrarAoParceiro(modelo: string, operacao: string, args: Args, parceiroId: string): Args {
  if (!parceiroId) throw new ErroDeTenant('parceiro não informado.');
  if (!ehModeloDeTenant(modelo)) throw new ErroDeTenant(`modelo fora do portão: ${modelo}.`);
  const relacoes = RELACOES_POR_MODELO.get(modelo);
  if (!relacoes) throw new ErroDeTenant(`modelo desconhecido no esquema: ${modelo}.`);
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

  if (operacao === 'create') novo.data = conferirDado(args.data, parceiroId, false, relacoes);
  if (operacao === 'createMany' || operacao === 'createManyAndReturn') {
    const lista = Array.isArray(args.data) ? args.data : [args.data];
    novo.data = lista.map((d) => conferirDado(d, parceiroId, false, relacoes));
  }
  if (operacao === 'upsert') {
    novo.create = conferirDado(args.create, parceiroId, false, relacoes);
    novo.update = conferirDado(args.update, parceiroId, true, relacoes);
  }
  // Update nunca muda o dono da linha: `parceiroId` igual passa, diferente estoura.
  if (COM_DADO_DE_UPDATE.has(operacao)) novo.data = conferirDado(args.data, parceiroId, true, relacoes);

  return novo;
}

function estender(base: PrismaClient, parceiroId: string, somenteLeitura: boolean) {
  return base.$extends({
    name: 'tenant-parceiro-flow',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (somenteLeitura && ESCRITA.has(operation)) {
            throw new ErroDeTenant('parceiro em somente leitura (suspenso ou não liberado): escrita recusada.');
          }
          // Modelo fora da lista não passa (amarrarAoParceiro recusa).
          return query(amarrarAoParceiro(model, operation, args as Args, parceiroId) as typeof args);
        },
      },
    },
  });
}

/** Operações de dado expostas por modelo. Nada de `$parent`, `fields` etc. */
const OPERACOES = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const;
type Operacao = (typeof OPERACOES)[number];

type Amarrado = ReturnType<typeof estender>;
type ModelosDoParceiro = { readonly [M in ModeloDeTenant]: Pick<Amarrado[M], Operacao & keyof Amarrado[M]> };
type OpcoesDeTransacao = { maxWait?: number; timeout?: number };

/**
 * Cliente de UM parceiro: os modelos de tenant (e só eles, só com operações de
 * dado), o `parceiroId`, `transacao` e `sql`. Nada de `$queryRaw`,
 * `parceiroFlow`, `$parent` ou modelo do portal.
 */
export type ClienteDoParceiro = ModelosDoParceiro & {
  readonly parceiroId: string;
  /** true: toda escrita é recusada (portão e transação read-only no banco). */
  readonly somenteLeitura: boolean;
  /**
   * Transação interativa ainda amarrada ao parceiro: o `tx` recebido é outro
   * `ClienteDoParceiro`. Chamada de dentro de uma transação, só reaproveita a
   * mesma (o Prisma não aninha).
   */
  transacao<T>(fn: (tx: ClienteDoParceiro) => Promise<T>, opcoes?: OpcoesDeTransacao): Promise<T>;
  /**
   * SQL cru (template com parâmetros, como `$queryRaw`) DENTRO do contexto do
   * parceiro: o Postgres aplica a RLS, então linha de outro parceiro não
   * aparece nem se o SQL esquecer o `WHERE "parceiroId"`. É o caminho para
   * relatório (DRE, CMV). Nunca monte o texto com concatenação.
   */
  sql<T = Record<string, unknown>>(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<T[]>;
};

type Executor = <T>(consulta: Promise<T>) => Promise<T>;

/** Objeto congelado só com as operações, chamando o delegate por closure. */
function embrulhar(delegate: Record<string, unknown>, executar: Executor) {
  const ops: Record<string, unknown> = {};
  for (const op of OPERACOES) {
    const f = delegate[op];
    // async: erro do portão vira promessa rejeitada, nunca throw síncrono.
    if (typeof f === 'function') {
      ops[op] = async (...a: unknown[]) => executar((f as (...x: unknown[]) => Promise<unknown>).apply(delegate, a));
    }
  }
  return Object.freeze(ops);
}

type FonteSql = { $queryRaw: (consulta: TemplateStringsArray | Prisma.Sql, ...valores: unknown[]) => Promise<unknown> };

function montar(
  fonte: Record<string, unknown>,
  parceiroId: string,
  somenteLeitura: boolean,
  executar: Executor,
  abrir: ClienteDoParceiro['transacao'] | null,
) {
  const modelos = Object.fromEntries(
    MODELOS_DE_TENANT.map((m) => [m, embrulhar(fonte[m] as Record<string, unknown>, executar)]),
  ) as unknown as ModelosDoParceiro;
  const cru = fonte as unknown as FonteSql;
  const cliente: ClienteDoParceiro = {
    ...modelos,
    parceiroId,
    somenteLeitura,
    transacao: abrir ?? ((fn) => fn(cliente)),
    sql: async <T,>(consulta: TemplateStringsArray, ...valores: unknown[]) =>
      executar(cru.$queryRaw(consulta, ...valores)) as Promise<T[]>,
  };
  return Object.freeze(cliente);
}

function construir(base: PrismaClient, parceiroId: string, somenteLeitura: boolean): ClienteDoParceiro {
  const amarrado = estender(base, parceiroId, somenteLeitura);
  const contexto = sqlDeContexto(parceiroId, somenteLeitura);

  // Fora de transação: cada operação vira um lote [contexto, operação] numa
  // transação só (a consulta do Prisma é preguiçosa até o lote rodar).
  const avulso: Executor = async (consulta) => {
    const [, r] = await amarrado.$transaction([
      amarrado.$queryRaw(contexto),
      consulta as unknown as Prisma.PrismaPromise<unknown>,
    ]);
    return r as Awaited<typeof consulta>;
  };
  // Dentro de `transacao`: o contexto já foi aberto no começo dela.
  const direto: Executor = (consulta) => consulta;

  return montar(amarrado as unknown as Record<string, unknown>, parceiroId, somenteLeitura, avulso, (fn, opcoes) =>
    // O `tx` de um cliente estendido carrega a mesma extensão de query.
    amarrado.$transaction(async (tx) => {
      await tx.$queryRaw(contexto);
      return fn(montar(tx as unknown as Record<string, unknown>, parceiroId, somenteLeitura, direto, null));
    }, opcoes),
  );
}

/**
 * `base` existe para o teste de isolamento apontar para o banco de teste.
 * `somenteLeitura`: parceiro suspenso/não liberado — quem decide é
 * `exigirParceiro` (`src/lib/erp/contexto.ts`), não a tela.
 */
export function doParceiro(
  parceiroId: string,
  base: PrismaClient = baseDoTenant(),
  opcoes: { somenteLeitura?: boolean } = {},
): ClienteDoParceiro {
  if (!parceiroId) throw new ErroDeTenant('parceiro não informado.');
  return construir(base, parceiroId, opcoes.somenteLeitura ?? false);
}

/**
 * Resolve o parceiro pelo slug da URL. O slug só ESCOLHE; quem decide se o
 * usuário pode ver é a sessão (hoje só o nível 1, FlowFoods; as permissões por
 * parceiro chegam na fase 0.4).
 */
export async function parceiroPorSlug(slug: string, base: PrismaClient = baseDoTenant()) {
  return base.parceiroFlow.findUnique({ where: { slug } });
}

export function ehErroDeUnicidade(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

// ------------------------------------------------------------- nível 1

/** O que vai para `HistoricoAlteracao` (o `parceiroId` vem da gravação). */
export interface RegistroDeHistorico {
  entidade: string;
  entidadeId: string;
  acao: string;
  antes?: Prisma.InputJsonValue | null;
  depois?: Prisma.InputJsonValue | null;
  motivo?: string | null;
  autorNome: string;
}

export type DelegateParceiroFlow = Prisma.TransactionClient['parceiroFlow'];

/**
 * Nível 1 (FlowFoods) mexendo no próprio ParceiroFlow — criar, renomear,
 * ativar, suspender — com o antes/depois gravado no histórico DO parceiro, na
 * MESMA transação: ou as duas coisas ficam, ou nenhuma.
 *
 * `gravar` recebe só o delegate do ParceiroFlow (tabela fora do tenant). O
 * histórico entra depois, já no contexto do parceiro (papel `erp_tenant`): a
 * RLS confere que ele é mesmo daquele parceiro.
 */
export async function gravarParceiroFlow<T>(
  gravar: (
    parceiroFlow: DelegateParceiroFlow,
  ) => Promise<{ parceiroId: string; resultado: T; historico: RegistroDeHistorico | null }>,
  base: PrismaClient = baseDoTenant(),
): Promise<T> {
  return base.$transaction(async (tx) => {
    const { parceiroId, resultado, historico } = await gravar(tx.parceiroFlow);
    if (historico) {
      await tx.$queryRaw(sqlDeContexto(parceiroId, false));
      const { antes, depois, ...resto } = historico;
      const args = amarrarAoParceiro(
        'HistoricoAlteracao',
        'create',
        { data: { ...resto, antes: antes ?? undefined, depois: depois ?? undefined } },
        parceiroId,
      );
      await tx.historicoAlteracao.create(args as Prisma.HistoricoAlteracaoCreateArgs);
    }
    return resultado;
  });
}
