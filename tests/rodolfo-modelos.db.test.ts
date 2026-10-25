/**
 * E5.1 · decisão 473 — modelos de texto padrão com a trava do banco: três "Montar lote" ao mesmo tempo, num banco sem
 * modelos, criam cada modelo uma vez só (antes, cada um via "falta" e criava o seu).
 *
 * Roda só com banco local:
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/rodolfo-modelos.db.test.ts
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

const URL_TESTE = process.env.ERP_DB_TESTE;

vi.mock('@/lib/db', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasources: { db: { url: process.env.ERP_DB_TESTE ?? 'postgresql://sem-banco/x' } } }) };
});

import { prisma } from '@/lib/db';
import { garantirSeed } from '@/lib/rodolfo/lote';
import { SEED_TEMPLATES } from '@/lib/barney/render';

describe.skipIf(!URL_TESTE)('E5.1 · modelos padrão sem duplicar (banco)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('três "Montar lote" ao mesmo tempo criam cada modelo uma vez', async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    // Modelos padrão que nenhuma mensagem usa podem sair; os outros ficam (o banco de teste é compartilhado).
    await prisma.template.deleteMany({ where: { categoria: null, mensagens: { none: {} } } });
    const antes = await prisma.template.count({ where: { categoria: null } });
    // Sem nada a criar, o teste passaria mesmo sem a trava: precisa faltar ao menos um modelo.
    expect(antes).toBeLessThan(SEED_TEMPLATES.length);
    await Promise.all([garantirSeed(), garantirSeed(), garantirSeed()]);
    const grupos = await prisma.template.groupBy({ by: ['toque', 'canal', 'variante'], where: { categoria: null }, _count: true });
    expect(grupos.every((g) => g._count === 1), JSON.stringify(grupos)).toBe(true);
    expect(grupos.length).toBe(Math.max(antes, SEED_TEMPLATES.length));
  });
});
