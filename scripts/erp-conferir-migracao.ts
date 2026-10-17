/**
 * Conferência pós-deploy das migrations `20261025000000_erp_faturamento` (2.1),
 * `20261026000000_erp_dre_despesas` (2.2a), `20261027000000_erp_dre_fechamento` (2.2b) e `20261028000000_erp_cmv` (2.3).
 *
 *   npm run erp:conferir-migracao
 *
 * As migrations são tolerantes a linha antiga: CHECK que alguma linha viola fica NOT
 * VALID e o índice único do grão humano não é criado se houver duplicidade, e
 * avisa só com WARNING no terminal de quem rodou (o log do deploy automático
 * não mostra). Este script lê o catálogo do Postgres (pg_constraint, pg_index:
 * não passam pela RLS) e lista o que ficou pendente. Sai com código 1 se houver
 * pendência, 0 se estiver tudo no lugar. Só leitura.
 *
 * Para resolver: corrija as linhas e rode `ALTER TABLE "<tabela>" VALIDATE
 * CONSTRAINT "<nome>";` (e o CREATE UNIQUE INDEX da migration, se faltar).
 */

import { PrismaClient } from '@prisma/client';

export const CHECKS_DA_2_1 = [
  ['FaturamentoLancamento', 'FaturamentoLancamento_valor_teto'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_pedidos_teto'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_clientes_teto'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_valor_tem_pedido'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_data_minima'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_chave_do_espaco'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_integracao_tem_ref'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_textos_curtos'],
  ['Loja', 'Loja_canais_ao_menos_um'],
] as const;

export const INDICE_DO_GRAO = 'FaturamentoLancamento_grao_humano';

/** Os CHECKs que a 2.2a acrescentou em tabelas que já existiam (a tabela nova tem os dela de nascença). */
export const CHECKS_DA_2_2A = [
  ['DreLinha', 'DreLinha_nome_curto'],
  ['DreLinha', 'DreLinha_codigo_curto'],
  ['DreLinha', 'DreLinha_calculada_tem_codigo'],
  ['Despesa', 'Despesa_valor_faixa'],
  ['Despesa', 'Despesa_competencia_minima'],
  ['Despesa', 'Despesa_competencia_fim'],
  ['Despesa', 'Despesa_descricao_curta'],
  ['Despesa', 'Despesa_canal_nulo'],
  ['Despesa', 'Despesa_textos_curtos'],
  ['Despesa', 'Despesa_recorrente_de_mes_inteiro'],
] as const;

/** Os CHECKs que a 2.2b acrescentou em tabelas que já existiam (as duas tabelas novas têm os dela de nascença). */
export const CHECKS_DA_2_2B = [
  ['DreMeta', 'DreMeta_sem_meta_zera'],
  ['DreMeta', 'DreMeta_nome_curto'],
  ['PeriodoApuracao', 'PeriodoApuracao_fechado_tem_data'],
  ['PeriodoApuracao', 'PeriodoApuracao_fechadoPor_curto'],
] as const;

/** O CHECK que a 2.3 acrescentou em tabela que já existia (a coluna `itensSemPreco` da contagem). */
export const CHECKS_DA_2_3 = [['Contagem', 'Contagem_itensSemPreco_nao_negativo']] as const;

/** O que a migration deixou pendente (frases prontas para o terminal); lista vazia = tudo no lugar. */
export async function conferirMigracao(db: Pick<PrismaClient, '$queryRaw'>): Promise<string[]> {
  const pendencias: string[] = [];
  const checks = await db.$queryRaw<{ tabela: string; nome: string; validado: boolean }[]>`
    SELECT c.conrelid::regclass::text AS tabela, c.conname AS nome, c.convalidated AS validado
    FROM pg_constraint c
    WHERE c.conname = ANY(${CHECKS_DA_2_1.map(([, nome]) => nome)})`;
  for (const [tabela, nome] of CHECKS_DA_2_1) {
    const achado = checks.find((c) => c.nome === nome);
    if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261025000000_erp_faturamento não foi aplicada por inteiro.`);
    else if (!achado.validado) {
      pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
    }
  }
  const indice = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = ${INDICE_DO_GRAO}`;
  if (!indice[0] || indice[0].n === 0) {
    pendencias.push(`Índice ${INDICE_DO_GRAO} NÃO existe: há mais de uma linha humana no mesmo loja × canal × dia. Corrija as duplicadas e rode o CREATE UNIQUE INDEX da migration.`);
  }
  // 2.2a: só se a migration dela já rodou (o catálogo não passa pela RLS).
  const aplicada = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_class WHERE relname = 'RegraDoPeriodo' AND relkind = 'r'`;
  if (aplicada[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_2_2A.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_2_2A) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261026000000_erp_dre_despesas não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
  }
  // 2.2b: só se a migration dela já rodou (o catálogo não passa pela RLS).
  const fechamento = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_class WHERE relname = 'DreFotografia' AND relkind = 'r'`;
  if (fechamento[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_2_2B.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_2_2B) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261027000000_erp_dre_fechamento não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
    // Os gatilhos que fazem a fotografia valer (sem eles o fechado não seria imutável).
    const gatilhos = await db.$queryRaw<{ nome: string }[]>`
      SELECT tgname AS nome FROM pg_trigger
      WHERE NOT tgisinternal AND tgname = ANY(${['DreFotografia_imutavel', 'DreFotografiaLinha_so_inclusao', 'PeriodoApuracao_fechado_imutavel', 'PeriodoApuracao_fechado_tem_fotografia', 'DreFotografia_substituida_reabre_periodo', 'DreFotografia_so_periodo_aberto', 'PeriodoApuracao_aberto_sem_fotografia_vigente', 'DreFotografia_vigente_so_em_periodo_fechado', 'DreFotografia_sem_truncate', 'DreFotografiaLinha_sem_truncate']})`;
    for (const t of ['DreFotografia_imutavel', 'DreFotografiaLinha_so_inclusao', 'PeriodoApuracao_fechado_imutavel', 'PeriodoApuracao_fechado_tem_fotografia', 'DreFotografia_substituida_reabre_periodo', 'DreFotografia_so_periodo_aberto', 'PeriodoApuracao_aberto_sem_fotografia_vigente', 'DreFotografia_vigente_so_em_periodo_fechado', 'DreFotografia_sem_truncate', 'DreFotografiaLinha_sem_truncate']) {
      if (!gatilhos.some((g) => g.nome === t)) pendencias.push(`Gatilho ${t} NÃO existe: a migration 20261027000000_erp_dre_fechamento não foi aplicada por inteiro.`);
    }
  }
  // 2.3: só se a migration dela já rodou (a coluna existe; o catálogo não passa pela RLS).
  const cmv = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'Contagem' AND column_name = 'itensSemPreco'`;
  if (cmv[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_2_3.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_2_3) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261028000000_erp_cmv não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
  }
  return pendencias;
}

async function principal() {
  const db = new PrismaClient();
  try {
    const pendencias = await conferirMigracao(db);
    if (pendencias.length === 0) {
      console.log('Migrations da 2.1, da 2.2a, da 2.2b e da 2.3 conferidas: os CHECKs estão validados, o índice do grão humano e os gatilhos do fechamento existem.');
      return 0;
    }
    console.error(`Migrations da 2.1, da 2.2a, da 2.2b e da 2.3: ${pendencias.length} pendência(s):`);
    for (const p of pendencias) console.error(`  - ${p}`);
    return 1;
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.endsWith('erp-conferir-migracao.ts')) {
  principal().then((c) => process.exit(c), (e) => {
    console.error(e);
    process.exit(2);
  });
}
