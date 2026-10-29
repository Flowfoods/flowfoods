/**
 * INT-1.3 (decisão 485) — o token no banco: dois "processos" (dois serviços de token, cada um com seu cliente Prisma) pedindo
 * ao mesmo tempo fazem UM pedido ao iFood simulado (trava do Postgres por app); o token fica cifrado na tabela global; invalidar
 * apaga; o app não se apaga e leva o token junto só por cascata de quem pode (o serviço).
 * Decisão 487: a leitura e a gravação ficam DENTRO da transação da trava — com um pool de UMA conexão (o cliente deste arquivo),
 * a renovação funciona; o iFood pedindo para esperar além do prazo para na hora, solta a trava e o próximo processo segue.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/integracao-token.db.test.ts
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const URL_TESTE = process.env.ERP_DB_TESTE;

vi.mock('@/lib/db', async () => {
  const { PrismaClient: P } = await import('@prisma/client');
  const real = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  // Pool de UMA conexão: ler ou gravar fora da transação da trava travaria aqui (decisão 487).
  const url = process.env.ERP_DB_TESTE ? `${process.env.ERP_DB_TESTE}${process.env.ERP_DB_TESTE.includes('?') ? '&' : '?'}connection_limit=1&pool_timeout=20` : 'postgresql://sem-banco/x';
  return { prisma: real.travarTenant(new P({ datasources: { db: { url } } })) };
});

import { prisma } from '@/lib/db';
import { armazemDoBanco } from '@/lib/integracoes/core/armazem-token';
import { registrarApp } from '@/lib/integracoes/core/apps';
import { ServicoDeToken, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import type { PedidoHttp, RespostaHttp } from '@/lib/integracoes/ifood/transporte';

const ENV = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: randomBytes(32).toString('hex'), IFOOD_TEST_CLIENT_SECRET: 'segredo-de-teste' };

describe.skipIf(!URL_TESTE)('INT-1.3 · o token no banco (Postgres real)', { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let app: AppParaToken;
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    const r = await registrarApp({ provedor: 'IFOOD', ambiente: 'TEST', nome: 'Teste (C)', categoria: 'TEST', clientId: `tok-${sufixo}`, nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', modulos: ['ANALYTICS'] }, 'teste');
    if (!r.ok) throw new Error(JSON.stringify(r));
    app = { id: r.id, ambiente: 'TEST', clientId: `tok-${sufixo}`, nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: 'NAO_SE_APLICA' };
  });

  afterAll(async () => {
    if (!db) return;
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"`);
      await tx.$executeRawUnsafe(`DELETE FROM "IntegracaoApp" WHERE id = $1`, app.id);
      await tx.$executeRawUnsafe(`ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"`);
    });
    await db.$disconnect();
    await prisma.$disconnect();
  });

  it('dois processos ao mesmo tempo: um pedido de token; guardado cifrado; invalidar apaga', async () => {
    const pedidos: PedidoHttp[] = [];
    const transporte = async (p: PedidoHttp): Promise<RespostaHttp> => {
      pedidos.push(p);
      // O iFood simulado demora: sem a trava, o segundo processo pediria outro token nesse meio-tempo.
      await new Promise((r) => setTimeout(r, 300));
      return { status: 200, cabecalhos: {}, corpo: JSON.stringify({ accessToken: `token-${pedidos.length}`, type: 'bearer', expiresIn: 21600 }) };
    };
    const servico = () => new ServicoDeToken({ armazem: armazemDoBanco, transporte, limitador: new Limitador(), env: ENV });
    const [a, b] = await Promise.all([servico().token(app), servico().token(app)]);
    expect(a).toBe(b);
    expect(pedidos).toHaveLength(1);
    const linha = await db.integracaoToken.findUnique({ where: { appId: app.id } });
    expect(linha?.tokenCifrado.startsWith('v1.')).toBe(true);
    expect(linha?.tokenCifrado).not.toContain('token-1');
    // Um terceiro processo, depois: lê do banco, sem pedir.
    expect(await servico().token(app)).toBe('token-1');
    expect(pedidos).toHaveLength(1);
    // Invalidar com um token velho não apaga o atual; com o atual, apaga.
    await servico().invalidar(app, 'token-velho');
    expect(await db.integracaoToken.findUnique({ where: { appId: app.id } })).not.toBeNull();
    await servico().invalidar(app, 'token-1');
    expect(await db.integracaoToken.findUnique({ where: { appId: app.id } })).toBeNull();
  });

  it('o iFood pede para esperar além do prazo: erro claro na hora, a trava solta e o próximo processo pede o seu', async () => {
    const pedidos: PedidoHttp[] = [];
    const lento = async (p: PedidoHttp): Promise<RespostaHttp> => {
      pedidos.push(p);
      return { status: 429, cabecalhos: { 'retry-after': '46' }, corpo: '{}' };
    };
    const inicio = Date.now();
    await expect(new ServicoDeToken({ armazem: armazemDoBanco, transporte: lento, limitador: new Limitador(), env: ENV }).token(app)).rejects.toThrow(/pediu para esperar 46 s/);
    expect(Date.now() - inicio).toBeLessThan(5000);
    expect(pedidos).toHaveLength(1);
    const ok = async (): Promise<RespostaHttp> => ({ status: 200, cabecalhos: {}, corpo: JSON.stringify({ accessToken: 'token-depois', type: 'bearer', expiresIn: 21600 }) });
    expect(await new ServicoDeToken({ armazem: armazemDoBanco, transporte: ok, limitador: new Limitador(), env: ENV }).token(app)).toBe('token-depois');
  });
});
