/**
 * ERP 1.5 · Entrada de compra no Postgres de verdade.
 *
 * Heranças da 1.4 (obrigatórias): (a) CHECKs do Insumo validados pela
 * migration e o 23514 virando frase (não 500).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-compras.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo, mudarSituacaoInsumo } from '@/lib/erp/insumos';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP 1.5 · compras (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `c${Date.now().toString(36)}`;
  let A: { id: string; slug: string; nome: string; status: string };
  let a: ClienteDoParceiro;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Compras A', slug: `compras-a-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id]);
    await db?.$disconnect();
  });

  describe('herança a da 1.4', () => {
    it('os CHECKs de validade do Insumo estão validados (valem também para linhas antigas)', async () => {
      const r = await db.$queryRaw<{ conname: string; convalidated: boolean }[]>`
        SELECT conname, convalidated FROM pg_constraint
        WHERE conrelid = '"Insumo"'::regclass AND conname IN ('Insumo_validades_faixa', 'Insumo_validade_principal')`;
      expect(r).toHaveLength(2);
      expect(r.every((c) => c.convalidated)).toBe(true);
    });

    it('linha que um CHECK recusa vira frase ao desativar, não erro 500', async () => {
      const nome = `Fora da regra ${sufixo}`;
      const r = await cadastrarInsumo(a, { nome, tipo: 'INGREDIENTE', unidade: 'KG', escala: 'base', conteudo: '1', preco: '10,00' });
      if (!r.ok) throw new Error(JSON.stringify(r));
      // Um CHECK NOT VALID que esta linha (gravada antes) viola: a próxima escrita nela é recusada (23514).
      const check = `Insumo_validade_teste_${sufixo}`;
      await db.$executeRawUnsafe(`ALTER TABLE "Insumo" ADD CONSTRAINT "${check}" CHECK ("nome" <> '${nome}') NOT VALID`);
      try {
        const d = await mudarSituacaoInsumo(a, r.id, false, 'teste', 'Marina Dona');
        expect(d.ok).toBe(false);
        expect(!d.ok && d.erros.geral).toMatch(/validade gravada neste insumo está fora da regra/);
        expect((await a.insumo.findUnique({ where: { id: r.id } }))?.ativo).toBe(true);
      } finally {
        await db.$executeRawUnsafe(`ALTER TABLE "Insumo" DROP CONSTRAINT "${check}"`);
      }
    });
  });
});
