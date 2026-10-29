/**
 * INT-1.4 (decisão 486) — o comando da leitura TEST de ponta a ponta, com o banco real e o iFood SIMULADO (o transporte é
 * trocado; nada sai para a rede):
 *  - chave geral desligada, app inexistente sem Client ID ou segredo ausente: recusa antes de chamar (saída 2);
 *  - com o Client ID: cadastra o app de teste na Central (só o nome da variável do cofre), lê, guarda o token cifrado, grava a
 *    evidência sem token nem segredo e um registro de auditoria (saída 0);
 *  - 403 no Analytics: saída 1 e o token guardado é descartado (a próxima execução pede outro).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_teste npx vitest run tests/integracao-leitura-test.db.test.ts
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const URL_TESTE = process.env.ERP_DB_TESTE;

vi.mock('@/lib/db', async () => {
  const { PrismaClient: P } = await import('@prisma/client');
  const real = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { prisma: real.travarTenant(new P({ datasources: { db: { url: process.env.ERP_DB_TESTE ?? 'postgresql://sem-banco/x' } } })) };
});

import { prisma } from '@/lib/db';
import { executarLeituraTest } from '@/lib/integracoes/ifood/comando-leitura-test';
import type { PedidoHttp, RespostaHttp } from '@/lib/integracoes/ifood/transporte';

const SEGREDO = `segredo-${randomBytes(6).toString('hex')}`;
const TOKEN = `tok-${randomBytes(6).toString('hex')}`;
const LOJA = '0b1f6d3e-8a51-4c2e-9d7a-3f2b6c1e5a90';
const ENV = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: randomBytes(32).toString('hex'), IFOOD_TEST_CLIENT_SECRET: SEGREDO };
const json = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): RespostaHttp => ({ status, cabecalhos: { 'content-type': 'application/json', ...cabecalhos }, corpo: JSON.stringify(corpo) });

function ifoodSimulado(kpis: () => RespostaHttp = () => json(200, { data: [], currentPage: 1, size: 0, totalItems: 0, totalPages: 0 }, { 'x-request-id': 'req-ok' })) {
  const pedidos: PedidoHttp[] = [];
  const transporte = async (p: PedidoHttp): Promise<RespostaHttp> => {
    pedidos.push(p);
    if (p.url.endsWith('/authentication/v1.0/oauth/token')) return json(200, { accessToken: TOKEN, type: 'bearer', expiresIn: 21600 });
    if (p.url.endsWith('/merchant/v1.0/merchants')) return json(200, [{ id: LOJA, name: 'Loja de teste' }]);
    return kpis();
  };
  return { pedidos, transporte };
}

function deps(transporte: (p: PedidoHttp) => Promise<RespostaHttp>, env: Record<string, string | undefined> = ENV) {
  const linhas: string[] = [];
  const gravados: { caminho: string; conteudo: string }[] = [];
  return {
    linhas,
    gravados,
    d: { transporte, env, agora: () => Date.UTC(2026, 9, 29, 12, 0, 0), log: (l: string) => linhas.push(l), gravar: async (caminho: string, conteudo: string) => void gravados.push({ caminho, conteudo }) },
  };
}

describe.skipIf(!URL_TESTE)('INT-1.4 · o comando da leitura TEST (Postgres real, iFood simulado)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  const clientId = `cli-int14-${randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
  });

  afterAll(async () => {
    if (!db) return;
    const nossos = await db.integracaoApp.findMany({ where: { clientId }, select: { id: true } });
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"`);
      for (const a of nossos) await tx.$executeRawUnsafe(`DELETE FROM "IntegracaoApp" WHERE id = $1`, a.id);
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"`);
    });
    await db.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE evento = 'integracao.leitura-test' AND dados->>'clientId' = $1`, clientId);
    await db.$disconnect();
    await prisma.$disconnect();
  });

  it('recusa antes de chamar: chave geral desligada; nenhum app de TEST sem --client-id; segredo ausente', async () => {
    const s = ifoodSimulado();
    const a = deps(s.transporte, { ...ENV, INTEGRACAO_IFOOD_ATIVA: 'false' });
    expect(await executarLeituraTest({ clientId }, a.d)).toBe(2);
    expect(a.linhas.join('\n')).toMatch(/chave geral está desligada/);
    // Sem --client-id e sem um único app de TEST na Central (outros testes em paralelo podem ter os deles): pede o Client ID.
    if ((await db.integracaoApp.count({ where: { provedor: 'IFOOD', ambiente: 'TEST' } })) !== 1) {
      const b = deps(s.transporte);
      expect(await executarLeituraTest({}, b.d)).toBe(2);
      expect(b.linhas.join('\n')).toMatch(/Nenhum app de TEST na Central: rode com --client-id|Há \d+ apps de TEST na Central; diga qual com --client-id/);
    }
    const c = deps(s.transporte, { ...ENV, IFOOD_TEST_CLIENT_SECRET: '' });
    expect(await executarLeituraTest({ clientId }, c.d)).toBe(2);
    expect(c.linhas.join('\n')).toMatch(/Falta a variável IFOOD_TEST_CLIENT_SECRET/);
    expect(s.pedidos).toHaveLength(0);
  });

  it('com o Client ID: cadastra o app de teste, lê, guarda o token cifrado, grava a evidência sem token nem segredo e audita', async () => {
    const s = ifoodSimulado();
    const r = deps(s.transporte);
    expect(await executarLeituraTest({ clientId, dia: '2026-10-28' }, r.d)).toBe(0);
    const app = await db.integracaoApp.findFirstOrThrow({ where: { clientId } });
    expect([app.ambiente, app.categoria, app.nomeDoSegredo]).toEqual(['TEST', 'TEST', 'IFOOD_TEST_CLIENT_SECRET']);
    const token = await db.integracaoToken.findUniqueOrThrow({ where: { appId: app.id } });
    expect(token.tokenCifrado.startsWith('v1.')).toBe(true);
    expect(token.tokenCifrado).not.toContain(TOKEN);
    expect(r.gravados).toHaveLength(1);
    const evidencia = r.gravados[0].conteudo;
    expect(evidencia).not.toContain(TOKEN);
    expect(evidencia).not.toContain(SEGREDO);
    expect(JSON.parse(evidencia)).toMatchObject({ ok: true, loja: LOJA, dia: '2026-10-28', app: { clientId, ambiente: 'TEST' } });
    expect(r.linhas.join('\n')).not.toContain(TOKEN);
    expect(r.linhas.join('\n')).toMatch(/Leitura TEST oficial com HTTP 200/);
    const auditoria = await db.auditLog.findFirstOrThrow({ where: { evento: 'integracao.leitura-test', dados: { path: ['clientId'], equals: clientId } }, orderBy: { criadoEm: 'desc' } });
    expect(auditoria.dados).toMatchObject({ clientId, loja: LOJA, ok: true });
    expect(JSON.stringify(auditoria.dados)).not.toContain(TOKEN);
    // Rodar de novo reaproveita o app (sem cadastrar outro) e o token guardado (sem pedir outro).
    const s2 = ifoodSimulado();
    expect(await executarLeituraTest({ clientId, dia: '2026-10-28' }, deps(s2.transporte).d)).toBe(0);
    expect(await db.integracaoApp.count({ where: { clientId } })).toBe(1);
    expect(s2.pedidos.filter((p) => p.url.endsWith('/oauth/token'))).toHaveLength(0);
  });

  it('evidência que conteria o segredo do app não é gravada (saída 1)', async () => {
    const pedidos: PedidoHttp[] = [];
    const transporte = async (p: PedidoHttp): Promise<RespostaHttp> => {
      pedidos.push(p);
      if (p.url.endsWith('/authentication/v1.0/oauth/token')) return json(200, { accessToken: TOKEN, type: 'bearer', expiresIn: 21600 });
      // Um nome de loja que (por absurdo) traz o segredo: a conferência antes de gravar recusa.
      if (p.url.endsWith('/merchant/v1.0/merchants')) return json(200, [{ id: LOJA, name: `Loja ${SEGREDO}` }]);
      return json(200, { data: [], currentPage: 1, size: 0, totalItems: 0, totalPages: 0 });
    };
    const r = deps(transporte);
    expect(await executarLeituraTest({ clientId, dia: '2026-10-28', tokenNovo: true }, r.d)).toBe(1);
    expect(r.gravados).toHaveLength(0);
    expect(r.linhas.join('\n')).toMatch(/conteria o segredo do app: não foi gravada/);
    expect(r.linhas.join('\n')).not.toContain(SEGREDO);
  });

  it('403 no Analytics: saída 1, a dica do que conferir e o token guardado descartado', async () => {
    const s = ifoodSimulado(() => json(403, { message: 'Forbidden' }));
    const r = deps(s.transporte);
    expect(await executarLeituraTest({ clientId, dia: '2026-10-28' }, r.d)).toBe(1);
    expect(r.linhas.join('\n')).toMatch(/403 no Analytics/);
    const app = await db.integracaoApp.findFirstOrThrow({ where: { clientId } });
    expect(await db.integracaoToken.findUnique({ where: { appId: app.id } })).toBeNull();
  });
});
