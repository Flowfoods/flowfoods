/**
 * Apoio dos testes com banco do ERP: os mesmos testes rodam com o usuário do
 * app superusuário (produção hoje) ou dono NÃO superusuário das tabelas, com
 * ou sem a RLS instalada (a migration pula a RLS quando não consegue).
 */
import type { PrismaClient } from '@prisma/client';
import { montarDre } from '@/lib/erp/dre-campos';
import { linhasParaGravar } from '@/lib/erp/dre-fechamento-campos';
import { gravarFotografia } from '@/lib/erp/dre-fotografia';
import { planoEfetivo } from '@/lib/erp/dre-plano';
import { MODELOS_DE_TENANT, PAPEL_DE_TENANT, papelDisponivel, type ClienteDoParceiro } from '@/lib/erp/tenant';

export const TABELAS_DE_TENANT = MODELOS_DE_TENANT.map((m) => m[0].toUpperCase() + m.slice(1));

/** Filhos antes dos pais. */
const ORDEM_DE_LIMPEZA = [
  'HistoricoAlteracao', 'Etiqueta', 'MovimentoEstoque', 'SaldoEstoque', 'ContagemItem', 'Contagem',
  'OrdemProducao', 'RequisicaoItem', 'Requisicao', 'NotaEntradaItem', 'NotaEntrada', 'ProdutoEmbalagem',
  'ProdutoCanal', 'ProdutoVenda', 'FichaItem', 'FichaTecnica', 'InsumoVariante', 'FaturamentoLancamento',
  'Despesa', 'DreMeta', 'FarolFaixa', 'DreLinha', 'DreFotografiaLinha', 'DreFotografia', 'PeriodoApuracao', 'RegraDoPeriodo', 'CanalConfig', 'Insumo', 'Fornecedor',
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
      // 2.2b: a fotografia do fechamento não se apaga (gatilhos). A limpeza do teste os desliga só nesta transação.
      for (const t of ['DreFotografia', 'DreFotografiaLinha']) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
      for (const t of ORDEM_DE_LIMPEZA) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "parceiroId" = ANY($1)`, ids);
      for (const t of ['DreFotografia', 'DreFotografiaLinha']) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`);
      await tx.$executeRawUnsafe(`DELETE FROM "ParceiroFlow" WHERE "id" = ANY($1)`, ids);
      if (precisaDeContexto(p)) {
        for (const t of TABELAS_DE_TENANT) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`);
      }
    },
    { timeout: 30000 },
  );
}

const dataIso = (s: string) => new Date(`${s}T00:00:00.000Z`);

/**
 * 2.2b: um período FECHADO "de teste" dentro da transação `tx` — o período e uma fotografia mínima (sem linhas),
 * que é o que o banco exige para o período ficar FECHADO. Para os testes que simulam o fechamento da 2.2b
 * mais barato do que fechar de verdade (que tem as suas condições).
 */
export async function criarPeriodoFechadoDeTeste(tx: ClienteDoParceiro, p: { nome: string; inicio: string; fim: string }) {
  const periodo = await tx.periodoApuracao.create({
    data: { parceiroId: tx.parceiroId, nome: p.nome, inicio: dataIso(p.inicio), fim: dataIso(p.fim), status: 'FECHADO', fechadoEm: new Date(), fechadoPorNome: 'Teste' },
  });
  // Um DRE sem nenhum número (a conta pura sobre o plano padrão), gravado pelo mesmo caminho do fechamento.
  const vazio = montarDre({ escopo: { tipo: 'rede' }, plano: planoEfetivo([]), receitas: [], taxaIfood: null, despesas: [] });
  await gravarFotografia(
    tx,
    { periodoId: periodo.id, inicio: p.inicio, fim: p.fim, nomeDoPeriodo: p.nome, fechadoPorNome: 'Teste', taxa: null, entrada: {}, ressalvas: [], justificativa: null, linhas: linhasParaGravar(vazio, null, null, () => null) },
    1,
  );
  return periodo;
}

/** O inverso: marca a fotografia como substituída e volta o período a ABERTO (o que a reabertura faz). */
export async function reabrirPeriodoDeTeste(cliente: ClienteDoParceiro, periodoId: string) {
  await cliente.transacao(async (tx) => {
    await tx.dreFotografia.updateMany({ where: { periodoId, substituidaEm: null }, data: { substituidaEm: new Date(), reabertaPorNome: 'Teste', motivoReabertura: 'teste' } });
    await tx.periodoApuracao.update({ where: { id: periodoId }, data: { status: 'ABERTO', fechadoEm: null, fechadoPorNome: null } });
  });
}
