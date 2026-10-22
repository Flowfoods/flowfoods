/**
 * Apoio dos testes com banco do ERP: os mesmos testes rodam com o usuário do
 * app superusuário (produção hoje) ou dono NÃO superusuário das tabelas, com
 * ou sem a RLS instalada (a migration pula a RLS quando não consegue).
 */
import type { PrismaClient } from '@prisma/client';
import { SEM_CMV } from '@/lib/erp/cmv-campos';
import { montarDre } from '@/lib/erp/dre-campos';
import { linhasParaGravar } from '@/lib/erp/dre-fechamento-campos';
import { gravarFotografia } from '@/lib/erp/dre-fotografia';
import { planoEfetivo } from '@/lib/erp/dre-plano';
import { MODELOS_DE_TENANT, PAPEL_DE_TENANT, papelDisponivel, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { garantirCategoriasPadrao, sugestaoParaInsumo } from '@/lib/erp/categorias';
import { cadastrarInsumo } from '@/lib/erp/insumos';

export const TABELAS_DE_TENANT = MODELOS_DE_TENANT.map((m) => m[0].toUpperCase() + m.slice(1));

/** Filhos antes dos pais. */
const ORDEM_DE_LIMPEZA = [
  'HistoricoAlteracao', 'Etiqueta', 'MovimentoEstoque', 'SaldoEstoque', 'ContagemRetratoItem', 'ContagemItem', 'Contagem',
  'ListaProducaoItem', 'ListaProducao', 'OrdemProducao', 'RequisicaoItem', 'Requisicao', 'DocumentoFiscalItem', 'DocumentoFiscal', 'VinculoItemFornecedor', 'NotaEntradaItem', 'NotaEntrada', 'ProdutoEmbalagem',
  'ProdutoCanal', 'ProdutoVenda', 'FichaItem', 'FichaTecnica', 'InsumoVariante', 'FaturamentoLancamento',
  'Despesa', 'DreMeta', 'FarolFaixa', 'MetaCmvCategoria', 'MetaCmvConjunto', 'CategoriaNaLoja', 'DreLinha', 'DreFotografiaLinha', 'DreFotografia', 'PeriodoApuracao', 'RegraDoPeriodo', 'CanalConfig', 'Insumo', 'CategoriaInsumo', 'Fornecedor',
  'Colaborador', 'Marca', 'Loja',
];

/** Tabelas com gatilho que recusa o DELETE (a limpeza desliga só na transação dela). */
const SEM_GATILHO_NA_LIMPEZA = ['DreFotografia', 'DreFotografiaLinha', 'ListaProducaoItem', 'CategoriaInsumo', 'ContagemRetratoItem', 'MetaCmvConjunto', 'MetaCmvCategoria'];

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
      // 2.2b: a fotografia do fechamento não se apaga (gatilhos). 3.2: a linha da lista que virou lote também não. A
      // limpeza do teste desliga esses gatilhos só nesta transação.
      for (const t of SEM_GATILHO_NA_LIMPEZA) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
      for (const t of ORDEM_DE_LIMPEZA) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "parceiroId" = ANY($1)`, ids);
      for (const t of SEM_GATILHO_NA_LIMPEZA) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`);
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
 * 2.2b: um período FECHADO "de teste" dentro da transação `tx` — o período ABERTO, a fotografia mínima (sem linhas) e só então
 * FECHADO, que é a ordem que o banco exige. Para os testes que simulam o fechamento da 2.2b
 * mais barato do que fechar de verdade (que tem as suas condições).
 */
export async function criarPeriodoFechadoDeTeste(tx: ClienteDoParceiro, p: { nome: string; inicio: string; fim: string }) {
  const periodo = await tx.periodoApuracao.create({
    data: { parceiroId: tx.parceiroId, nome: p.nome, inicio: dataIso(p.inicio), fim: dataIso(p.fim) },
  });
  // Um DRE sem nenhum número (a conta pura sobre o plano padrão), gravado pelo mesmo caminho do fechamento.
  const vazio = montarDre({ escopo: { tipo: 'rede' }, plano: planoEfetivo([]), receitas: [], taxaIfood: null, despesas: [], cmv: SEM_CMV });
  await gravarFotografia(
    tx,
    { periodoId: periodo.id, inicio: p.inicio, fim: p.fim, nomeDoPeriodo: p.nome, fechadoPorNome: 'Teste', taxa: null, entrada: {}, ressalvas: [], justificativa: null, linhas: linhasParaGravar(vazio, null, null, () => null) },
    1,
  );
  // O mesmo caminho do fechamento: a fotografia nasce com o período ABERTO e só depois ele vira FECHADO.
  return tx.periodoApuracao.update({ where: { id: periodo.id }, data: { status: 'FECHADO', fechadoEm: new Date(), fechadoPorNome: 'Teste' } });
}

/** O inverso: marca a fotografia como substituída e volta o período a ABERTO (o que a reabertura faz). */
export async function reabrirPeriodoDeTeste(cliente: ClienteDoParceiro, periodoId: string) {
  await cliente.transacao(async (tx) => {
    await tx.dreFotografia.updateMany({ where: { periodoId, substituidaEm: null }, data: { substituidaEm: new Date(), reabertaPorNome: 'Teste', motivoReabertura: 'teste' } });
    await tx.periodoApuracao.update({ where: { id: periodoId }, data: { status: 'ABERTO', fechadoEm: null, fechadoPorNome: null } });
  });
}

/**
 * I.1a: a categoria é obrigatória no cadastro de insumo, então os testes que só precisam de um insumo para o resto do cenário
 * o cadastram por aqui: as dez padrão nascem (idempotente) e a categoria que o nome sugere entra sozinha. Quem passa
 * `categoriaId` (inclusive vazio) fala com o servidor sem intermediário.
 */
export async function cadastrarInsumoDeTeste(cliente: ClienteDoParceiro, entrada: Record<string, unknown>, autorNome?: string) {
  // I.1b: a conservação também é escolhida (o servidor não assume mais Seco). O teste que só precisa de um insumo diz Seco;
  // quem passa a chave `conservacao` (inclusive vazia) fala com o servidor sem intermediário.
  const comConservacao = 'conservacao' in entrada ? entrada : { ...entrada, conservacao: 'SECO' };
  if (comConservacao.categoriaId !== undefined) return cadastrarInsumo(cliente, comConservacao, autorNome);
  await garantirCategoriasPadrao(cliente);
  const sugestao = await sugestaoParaInsumo(cliente, String(comConservacao.nome ?? ''), typeof comConservacao.tipo === 'string' ? comConservacao.tipo : undefined);
  return cadastrarInsumo(cliente, { ...comConservacao, categoriaId: sugestao.categoriaId ?? '' }, autorNome);
}

/**
 * F.1a: o fornecedor ganhou campos obrigatórios (razão social, CNPJ, e-mail, WhatsApp); os testes que só precisam de um fornecedor
 * para o resto do cenário o cadastram "sem nota fiscal" (nome + WhatsApp), que é a exceção da regra. Quem exercita o cadastro
 * completo fala com o servidor sem este atalho.
 */
export const SEM_NOTA_FISCAL = { semNotaFiscal: 'on', whatsapp: '(21) 99641-6060' } as const;
