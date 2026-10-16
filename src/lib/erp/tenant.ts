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
 * estoura. O portão usa um PrismaClient base próprio (`base.ts`, que só ele e
 * `credenciais.ts` importam).
 * O SQL cru (`$queryRaw`) do prisma do portal continua possível: esse caminho
 * é vigiado pelo teste-guarda (`tests/erp-tenant-portao.test.ts`), não pelo runtime.
 *
 * Banco (0.2, Row-Level Security): toda operação do cliente roda numa transação
 * que entra no CONTEXTO do parceiro — `app.parceiro_id` e o papel `erp_tenant`
 * (migration `20261015020000_erp_multitenant`). Debaixo desse papel o Postgres
 * só devolve e só aceita linhas daquele parceiro, inclusive em SQL cru
 * (`cliente.sql`, o caminho certo para relatório). Se o banco não tem o papel
 * (migration não pôde instalar a RLS), o portão detecta e segue sem ele.
 *
 * Status (0.2): toda ESCRITA confere, na própria transação e com FOR SHARE,
 * que o parceiro está ATIVO (`erp_exigir_parceiro_ativo`). Vale para qualquer
 * `doParceiro` — tela, worker, webhook. Cliente `somenteLeitura` (o que
 * `exigirParceiro` entrega para parceiro não ATIVO) recusa a escrita antes do
 * banco e abre a transação read-only.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { baseDoErp } from './base';
import { ErroDeTenant, ehModeloDeTenant, MODELOS_DE_TENANT, type ModeloDeTenant } from './modelos';

export { ErroDeTenant, ehModeloDeTenant, MODELOS_DE_TENANT, RELACOES_DE_TENANT } from './modelos';
export type { ModeloDeTenant } from './modelos';

// Cliente base do portão: separado do `prisma` do portal (que é travado para
// os modelos de tenant). Um por processo, lazy (`base.ts`).
const baseDoTenant = baseDoErp;

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
 * `role` via set_config é o mesmo que `SET LOCAL ROLE`, numa ida só. Sem o
 * papel disponível (migration não conseguiu instalar a RLS), só o parceiro.
 * `leitura`: a transação abre read-only no Postgres.
 */
function sqlDeContexto(parceiroId: string, leitura: boolean, papel: boolean): Prisma.Sql {
  const ro = leitura ? Prisma.sql`, set_config('transaction_read_only', 'on', true)` : Prisma.empty;
  return papel
    ? Prisma.sql`SELECT set_config('app.parceiro_id', ${parceiroId}, true), set_config('role', ${PAPEL_DE_TENANT}, true)${ro}`
    : Prisma.sql`SELECT set_config('app.parceiro_id', ${parceiroId}, true)${ro}`;
}

/**
 * Toda ESCRITA confere o status do parceiro dentro da própria transação (função
 * da migration, com FOR SHARE): parceiro que não está ATIVO não recebe escrita,
 * venha ela de tela, worker ou webhook, e uma suspensão concorrente é respeitada.
 */
function sqlDeStatus(parceiroId: string): Prisma.Sql {
  return Prisma.sql`SELECT "erp_exigir_parceiro_ativo"(${parceiroId}) AS "status"`;
}

/** Erro do banco que o portão traduz para ErroDeTenant. */
function traduzirErro(e: unknown): unknown {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('erp_parceiro_inativo')) {
    return new ErroDeTenant('parceiro não está ATIVO (suspenso ou aguardando liberação): escrita recusada.');
  }
  return e;
}

// ------------------------------------------------------- papel disponível?

const papelPorBase = new WeakMap<PrismaClient, Promise<boolean>>();
let avisouSemPapel = false;

/**
 * O papel `erp_tenant` existe, o usuário do app consegue assumi-lo e ele tem
 * GRANT nas tabelas (a migration instalou a RLS)? Conferido uma vez por cliente
 * base. Se não, o portão opera sem `SET ROLE` (o isolamento por `parceiroId`,
 * FK composta e triggers continua) e avisa UMA vez no log.
 */
export function papelDisponivel(base: PrismaClient = baseDoTenant()): Promise<boolean> {
  const emCache = papelPorBase.get(base);
  if (emCache) return emCache;
  const conferencia = base.$queryRaw<{ ok: boolean }[]>`
      SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${PAPEL_DE_TENANT})
        THEN (CASE WHEN current_setting('server_version_num')::int >= 160000
                   THEN pg_has_role(current_user, ${PAPEL_DE_TENANT}, 'SET')
                   ELSE pg_has_role(current_user, ${PAPEL_DE_TENANT}, 'MEMBER') END)
             AND has_table_privilege(${PAPEL_DE_TENANT}, '"HistoricoAlteracao"', 'INSERT')
             AND coalesce((SELECT relforcerowsecurity FROM pg_class WHERE oid = to_regclass('"HistoricoAlteracao"')), false)
        ELSE false END AS "ok"`
    .then(([r]) => {
      const ok = !!r?.ok;
      if (!ok && !avisouSemPapel) {
        avisouSemPapel = true;
        console.warn(
          `[tenant] papel ${PAPEL_DE_TENANT} indisponível neste banco (a migration não instalou a RLS ou o usuário do app não pode assumi-lo). ` +
            'O ERP segue isolado pelo portão (parceiroId + FK composta + triggers), SEM a RLS do banco. Ver docs/DECISOES.md, decisão 31.',
        );
      }
      return ok;
    })
    .catch((e) => {
      papelPorBase.delete(base); // falha de conexão não vira "sem papel" para sempre
      throw e;
    });
  papelPorBase.set(base, conferencia);
  return conferencia;
}

// ------------------------------------------------------- SQL cru do cliente

/**
 * `cliente.sql` roda DENTRO do contexto do parceiro; o texto (fora dos
 * parâmetros) não pode mexer no contexto nem na transação.
 */
const PROIBIDO_NO_SQL: [RegExp, string][] = [
  [/\bset_config\b/i, 'set_config'],
  [/(^|;)\s*set\s/i, 'SET'],
  [/\bset\s+(local|session)\b/i, 'SET LOCAL/SESSION'],
  [/\breset\b/i, 'RESET'],
  [/\brole\b/i, 'ROLE'],
  [/\bcommit\b/i, 'COMMIT'],
  [/\brollback\b/i, 'ROLLBACK'],
  [/\bbegin\b/i, 'BEGIN'],
  [/\bstart\s+transaction\b/i, 'START TRANSACTION'],
  [/\bsavepoint\b/i, 'SAVEPOINT'],
];

/** Puro e exportado para teste: recusa o texto do SQL (parâmetros não entram). */
export function conferirSqlDoParceiro(partes: readonly string[]): void {
  const texto = partes.join(' $ ');
  for (const [re, nome] of PROIBIDO_NO_SQL) {
    if (re.test(texto))
      throw new ErroDeTenant(`SQL do parceiro não pode usar ${nome}: o contexto do tenant é do portão.`);
  }
}

const ESCRITA_NO_SQL = /\b(insert|update|delete|merge|truncate|copy|call)\b/i;

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
   * relatório (DRE, CMV). Nunca monte o texto com concatenação. O texto não
   * pode mexer no contexto nem na transação (set_config, SET, RESET, ROLE,
   * COMMIT, ROLLBACK, BEGIN, SAVEPOINT): `conferirSqlDoParceiro` recusa.
   * Leitura avulsa abre read-only; INSERT/UPDATE/DELETE passam pela
   * conferência de status do parceiro, como as escritas por modelo.
   */
  sql<T = Record<string, unknown>>(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<T[]>;
};

/** Roda a consulta no contexto do parceiro. `escreve`: passa pela conferência de status. */
type Executor = <T>(consulta: Promise<T>, escreve: boolean) => Promise<T>;

/** Objeto congelado só com as operações, chamando o delegate por closure. */
function embrulhar(delegate: Record<string, unknown>, executar: Executor) {
  const ops: Record<string, unknown> = {};
  for (const op of OPERACOES) {
    const f = delegate[op];
    // async: erro do portão vira promessa rejeitada, nunca throw síncrono.
    if (typeof f === 'function') {
      ops[op] = async (...a: unknown[]) =>
        executar((f as (...x: unknown[]) => Promise<unknown>).apply(delegate, a), ESCRITA.has(op));
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
    sql: async <T>(consulta: TemplateStringsArray, ...valores: unknown[]) => {
      conferirSqlDoParceiro(consulta);
      return executar(cru.$queryRaw(consulta, ...valores), ESCRITA_NO_SQL.test(consulta.join(' '))) as Promise<T[]>;
    },
  };
  return Object.freeze(cliente);
}

function construir(base: PrismaClient, parceiroId: string, somenteLeitura: boolean): ClienteDoParceiro {
  const amarrado = estender(base, parceiroId, somenteLeitura);

  function barrarSeSoLeitura(escreve: boolean) {
    if (somenteLeitura && escreve) {
      throw new ErroDeTenant('parceiro em somente leitura (suspenso ou aguardando liberação): escrita recusada.');
    }
  }

  // Fora de transação: cada operação vira um lote numa transação só —
  // [contexto, (status, se escreve), operação]. A consulta do Prisma é
  // preguiçosa até o lote rodar. Leitura avulsa abre read-only no banco.
  const avulso: Executor = async (consulta, escreve) => {
    const papel = await papelDisponivel(base);
    const passos: Prisma.PrismaPromise<unknown>[] = [
      amarrado.$queryRaw(sqlDeContexto(parceiroId, somenteLeitura || !escreve, papel)),
    ];
    if (escreve) passos.push(amarrado.$queryRaw(sqlDeStatus(parceiroId)));
    passos.push(consulta as unknown as Prisma.PrismaPromise<unknown>);
    try {
      const r = await amarrado.$transaction(passos);
      return r[r.length - 1] as Awaited<typeof consulta>;
    } catch (e) {
      throw traduzirErro(e);
    }
  };

  const avulsoComTrava: Executor = async (c, escreve) => {
    barrarSeSoLeitura(escreve);
    return avulso(c, escreve);
  };

  return montar(
    amarrado as unknown as Record<string, unknown>,
    parceiroId,
    somenteLeitura,
    avulsoComTrava,
    async (fn, opcoes) => {
      const papel = await papelDisponivel(base);
      try {
        // O `tx` de um cliente estendido carrega a mesma extensão de query.
        return await amarrado.$transaction(async (tx) => {
          await tx.$queryRaw(sqlDeContexto(parceiroId, somenteLeitura, papel));
          // Dentro de `transacao`: contexto já aberto; a 1ª escrita confere o
          // status (FOR SHARE segura a linha do parceiro até o fim da transação).
          let statusConferido = false;
          const direto: Executor = async (consulta, escreve) => {
            barrarSeSoLeitura(escreve);
            if (escreve && !statusConferido) {
              await tx.$queryRaw(sqlDeStatus(parceiroId));
              statusConferido = true;
            }
            return consulta;
          };
          return fn(montar(tx as unknown as Record<string, unknown>, parceiroId, somenteLeitura, direto, null));
        }, opcoes);
      } catch (e) {
        throw traduzirErro(e);
      }
    },
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

/**
 * CHECK do banco recusou a gravação (Postgres 23514): o nome do CHECK, ou null
 * se o erro é outro. O Prisma não traduz esse código (vem como erro
 * desconhecido, com o texto do Postgres); quem grava devolve uma frase em vez
 * de deixar virar 500.
 */
export function checkVioladoDe(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : '';
  if (!/23514|violates check constraint/.test(msg)) return null;
  return /constraint \\?"([^"\\]+)\\?"/.exec(msg)?.[1] ?? 'desconhecido';
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
  const papel = await papelDisponivel(base);
  return base.$transaction(async (tx) => {
    const { parceiroId, resultado, historico } = await gravar(tx.parceiroFlow);
    // Sem conferência de status: é o nível 1 mudando o próprio status/nome
    // (suspender grava histórico de um parceiro que acabou de ficar SUSPENSO).
    if (historico) await fecharComHistorico(tx, parceiroId, [historico], papel);
    return resultado;
  });
}

/**
 * ÚLTIMO passo de uma transação fora do tenant (ParceiroFlow, acesso das
 * pessoas): entra no contexto do parceiro e grava o histórico sob a RLS, que
 * confere que ele é mesmo daquele parceiro. Ou fica tudo, ou nada.
 *
 * Depois disto a transação está no papel `erp_tenant` (quando há papel): nada
 * fora do tenant pode vir depois. Não confere status do parceiro — é registro
 * de auditoria, não escrita de negócio. Só `gravarParceiroFlow` e
 * `credenciais.ts` usam (teste-guarda).
 */
export async function fecharComHistorico(
  tx: Prisma.TransactionClient,
  parceiroId: string,
  registros: RegistroDeHistorico[],
  papel: boolean,
): Promise<void> {
  if (registros.length === 0) return;
  await tx.$queryRaw(sqlDeContexto(parceiroId, false, papel));
  for (const registro of registros) {
    const { antes, depois, ...resto } = registro;
    const args = amarrarAoParceiro(
      'HistoricoAlteracao',
      'create',
      { data: { ...resto, antes: antes ?? undefined, depois: depois ?? undefined } },
      parceiroId,
    );
    await tx.historicoAlteracao.create(args as Prisma.HistoricoAlteracaoCreateArgs);
  }
}
