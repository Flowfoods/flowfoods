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
 * - o cliente devolvido só expõe os modelos de tenant — sem `$queryRaw`, sem
 *   `parceiroFlow`, sem saída lateral.
 *
 * O `prisma` cru continua existindo para o resto do portal (leads, portal),
 * mas não toca nos modelos de `MODELOS_DE_TENANT`: `tests/erp-tenant-portao.test.ts`
 * reprova qualquer arquivo que tente.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

/** Todo modelo novo do ERP com `parceiroId` entra nesta lista. */
export const MODELOS_DE_TENANT = ['insumo'] as const;

/**
 * E o nome da relação do lado do ParceiroFlow: `parceiroFlow.findMany({ include:
 * { insumos: true } })` leria dado de tenant pelo prisma cru. O teste-guarda reprova.
 */
export const RELACOES_DE_TENANT = ['insumos'] as const;

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

function construir(base: PrismaClient, parceiroId: string) {
  const amarrado = base.$extends({
    name: 'tenant-parceiro-flow',
    query: {
      insumo: {
        $allOperations({ operation, args, query }) {
          return query(amarrarAoParceiro(operation, args as Args, parceiroId) as typeof args);
        },
      },
    },
  });
  return { parceiroId, insumo: amarrado.insumo } as const;
}

export type ClienteDoParceiro = ReturnType<typeof construir>;

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
