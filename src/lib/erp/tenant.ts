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

function estender(base: PrismaClient, parceiroId: string) {
  return base.$extends({
    name: 'tenant-parceiro-flow',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
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
 * dado), o `parceiroId` e `transacao`. Nada de `$queryRaw`, `parceiroFlow`,
 * `$parent` ou modelo do portal.
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

/** Objeto congelado só com as operações, chamando o delegate por closure. */
function embrulhar(delegate: Record<string, unknown>) {
  const ops: Record<string, unknown> = {};
  for (const op of OPERACOES) {
    const f = delegate[op];
    if (typeof f === 'function') ops[op] = (...a: unknown[]) => (f as (...x: unknown[]) => unknown).apply(delegate, a);
  }
  return Object.freeze(ops);
}

function montar(fonte: Record<string, unknown>, parceiroId: string, abrir: ClienteDoParceiro['transacao'] | null) {
  const modelos = Object.fromEntries(
    MODELOS_DE_TENANT.map((m) => [m, embrulhar(fonte[m] as Record<string, unknown>)]),
  ) as unknown as ModelosDoParceiro;
  const cliente: ClienteDoParceiro = {
    ...modelos,
    parceiroId,
    transacao: abrir ?? ((fn) => fn(cliente)),
  };
  return Object.freeze(cliente);
}

function construir(base: PrismaClient, parceiroId: string): ClienteDoParceiro {
  const amarrado = estender(base, parceiroId);
  return montar(amarrado as unknown as Record<string, unknown>, parceiroId, (fn, opcoes) =>
    // O `tx` de um cliente estendido carrega a mesma extensão de query.
    amarrado.$transaction(
      (tx) => fn(montar(tx as unknown as Record<string, unknown>, parceiroId, null)),
      opcoes,
    ),
  );
}

/** `base` existe para o teste de isolamento apontar para o banco de teste. */
export function doParceiro(parceiroId: string, base: PrismaClient = baseDoTenant()): ClienteDoParceiro {
  if (!parceiroId) throw new ErroDeTenant('parceiro não informado.');
  return construir(base, parceiroId);
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
