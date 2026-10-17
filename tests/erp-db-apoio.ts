/**
 * Apoio dos testes com banco do ERP: os mesmos testes rodam com o usuário do
 * app superusuário (produção hoje) ou dono NÃO superusuário das tabelas, com
 * ou sem a RLS instalada (a migration pula a RLS quando não consegue).
 */
import type { PrismaClient } from '@prisma/client';
import { MODELOS_DE_TENANT, PAPEL_DE_TENANT, papelDisponivel } from '@/lib/erp/tenant';

export const TABELAS_DE_TENANT = MODELOS_DE_TENANT.map((m) => m[0].toUpperCase() + m.slice(1));

/** Filhos antes dos pais. */
const ORDEM_DE_LIMPEZA = [
  'HistoricoAlteracao', 'Etiqueta', 'MovimentoEstoque', 'SaldoEstoque', 'ContagemItem', 'Contagem',
  'OrdemProducao', 'RequisicaoItem', 'Requisicao', 'NotaEntradaItem', 'NotaEntrada', 'ProdutoEmbalagem',
  'ProdutoCanal', 'ProdutoVenda', 'FichaItem', 'FichaTecnica', 'InsumoVariante', 'FaturamentoLancamento',
  'Despesa', 'DreMeta', 'FarolFaixa', 'DreLinha', 'PeriodoApuracao', 'RegraDoPeriodo', 'CanalConfig', 'Insumo', 'Fornecedor',
  'Colaborador', 'Marca', 'Loja',
];

export interface PerfilDoBanco {
  superusuario: boolean;
  /** RLS instalada e o papel `erp_tenant` utilizável pelo usuário do app. */
  rls: boolean;
}

export async function perfilDoBanco(db: PrismaClient): Promise<PerfilDoBanco> {
  const [r] = await db.$queryRaw<{ s: boolean }[]>`SELECT rolsuper AS s FROM pg_roles WHERE rolname = current_user`;
  return { superusuario: r.s, rls: await papelDisponivel(db) };
}

/** Dono não-superusuário com RLS FORÇADA não vê nada fora do papel: SQL cru vai no contexto do parceiro. */
function precisaDeContexto(p: PerfilDoBanco) {
  return !p.superusuario && p.rls;
}

/** SQL cru "sem portão", como o usuário do app (no contexto do parceiro quando a RLS forçada exige). */
export async function cru(db: PrismaClient, p: PerfilDoBanco, parceiroId: string, sql: string, ...valores: unknown[]) {
  if (!precisaDeContexto(p)) return db.$executeRawUnsafe(sql, ...valores);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.parceiro_id', ${parceiroId}, true), set_config('role', ${PAPEL_DE_TENANT}, true)`;
    return tx.$executeRawUnsafe(sql, ...valores);
  });
}

/** Apaga tudo destes parceiros. Dono não-superusuário com RLS forçada desliga o FORCE só nesta transação. */
export async function limparParceiros(db: PrismaClient, p: PerfilDoBanco, ids: string[]) {
  await db.$transaction(
    async (tx) => {
      if (precisaDeContexto(p)) {
        for (const t of TABELAS_DE_TENANT) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" NO FORCE ROW LEVEL SECURITY`);
      }
      for (const t of ORDEM_DE_LIMPEZA) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "parceiroId" = ANY($1)`, ids);
      await tx.$executeRawUnsafe(`DELETE FROM "ParceiroFlow" WHERE "id" = ANY($1)`, ids);
      if (precisaDeContexto(p)) {
        for (const t of TABELAS_DE_TENANT) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`);
      }
    },
    { timeout: 30000 },
  );
}
