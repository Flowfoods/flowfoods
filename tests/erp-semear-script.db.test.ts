/**
 * ERP I.1a · o script `erp:semear-categorias` (Postgres real): sem argumento só semeia casa sem categoria nenhuma e nunca recria o que
 * a casa excluiu; só `--completar`, ato explícito, devolve a padrão excluída.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro } from '@/lib/erp/tenant';
import { excluirCategoria, listarCategorias } from '@/lib/erp/categorias';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const SCRIPT = join(process.cwd(), 'scripts', 'erp-semear-categorias.ts');

describe.skipIf(!URL_TESTE)('ERP I.1a · script erp:semear-categorias (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let P: { id: string; slug: string };

  const rodar = (...args: string[]) => {
    const r = spawnSync('npx', ['tsx', SCRIPT, '--parceiro', P.slug, ...args], { env: { ...process.env, DATABASE_URL: URL_TESTE }, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    return r.stdout;
  };

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    P = await db.parceiroFlow.create({ data: { nome: 'Semear', slug: `semear-${globalThis.crypto.randomUUID().slice(0, 8)}`, status: 'ATIVO' } });
  });
  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [P.id]);
    await db?.$disconnect();
  });

  it('sem argumento semeia a casa vazia; depois de excluir uma padrão, rodar de novo NÃO a devolve; --completar devolve', async () => {
    const c = doParceiro(P.id, db);
    expect(await c.categoriaInsumo.count()).toBe(0);
    expect(rodar()).toMatch(/10 categorias criadas/);
    expect(await c.categoriaInsumo.count()).toBe(10);
    const bebidas = (await listarCategorias(c)).find((x) => x.chave === 'BEBIDAS')!;
    expect(await excluirCategoria(c, bebidas.id, 'Marina')).toMatchObject({ ok: true });
    // Sem argumento: a casa já tem categorias, nada é recriado.
    expect(rodar()).toMatch(/nada a criar/);
    expect(await c.categoriaInsumo.count({ where: { chave: 'BEBIDAS' } })).toBe(0);
    // Ato explícito: devolve só a que faltava.
    expect(rodar('--completar')).toMatch(/1 categorias criadas/);
    expect(await c.categoriaInsumo.count({ where: { chave: 'BEBIDAS' } })).toBe(1);
    expect(await c.categoriaInsumo.count()).toBe(10);
  });
});
