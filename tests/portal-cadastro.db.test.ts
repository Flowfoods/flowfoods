/**
 * Decisão 477 — com banco: dois cadastros com o mesmo nome ao mesmo tempo ganham endereços e links diferentes.
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/portal-cadastro.db.test.ts
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

const URL_TESTE = process.env.ERP_DB_TESTE;
vi.mock('@/lib/db', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasources: { db: { url: process.env.ERP_DB_TESTE ?? 'postgresql://sem-banco/x' } } }) };
});

import { prisma } from '@/lib/db';
import { cadastrarCliente } from '@/lib/portal/cadastro';

const NOME = `Teste Cadastro ${Date.now()}`;

describe.skipIf(!URL_TESTE)('decisão 477 · cadastro do Portal (banco)', () => {
  afterAll(async () => {
    await prisma.portalCliente.deleteMany({ where: { nome: NOME } });
    await prisma.auditLog.deleteMany({ where: { evento: 'portal_cadastrado', dados: { path: ['nome'], equals: NOME } } });
    await prisma.$disconnect();
  });

  it('três cadastros com o mesmo nome ao mesmo tempo: três endereços e três links', async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    const autor = { userId: null };
    const r = await Promise.all([1, 2, 3].map(() => cadastrarCliente(NOME, 'valentins', ['valentins'], autor)));
    const base = NOME.toLowerCase().replace(/ /g, '-');
    expect(r.map((c) => c.slug).sort()).toEqual([base, `${base}-2`, `${base}-3`].sort());
    expect(new Set(r.map((c) => c.token)).size).toBe(3);
    expect(await prisma.portalCliente.count({ where: { nome: NOME } })).toBe(3);
    // Cada cadastro com o seu registro de auditoria, na mesma transação.
    expect(await prisma.auditLog.count({ where: { evento: 'portal_cadastrado', dados: { path: ['nome'], equals: NOME } } })).toBe(3);
  });

  it('quem chama a função direto não grava nome sem letra nem questionário que não existe', async () => {
    await expect(cadastrarCliente('!!', 'valentins', ['valentins'], { userId: null })).rejects.toThrow('Nome sem letra nem número.');
    await expect(cadastrarCliente(NOME, 'qualquer-coisa', ['valentins'], { userId: null })).rejects.toThrow('Questionário que não existe no código.');
  });
});
