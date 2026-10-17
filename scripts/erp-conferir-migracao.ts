/**
 * Conferência pós-deploy da migration `20261025000000_erp_faturamento` (2.1).
 *
 *   npm run erp:conferir-migracao
 *
 * A migration é tolerante a linha antiga: CHECK que alguma linha viola fica NOT
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
  return pendencias;
}

async function principal() {
  const db = new PrismaClient();
  try {
    const pendencias = await conferirMigracao(db);
    if (pendencias.length === 0) {
      console.log('Migration da 2.1 conferida: os 9 CHECKs estão validados e o índice do grão humano existe.');
      return 0;
    }
    console.error(`Migration da 2.1: ${pendencias.length} pendência(s):`);
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
