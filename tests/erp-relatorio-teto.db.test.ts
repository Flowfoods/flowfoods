/**
 * ERP L.4 · a transação de relatório no portão (Postgres de verdade): somente leitura no banco e no portão, teto de tempo por
 * consulta cortado pelo Postgres (nunca um 500: vira `ErroDeRelatorio`), o teto some no fim da transação e o limite de simultâneos
 * segura o pool.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-relatorio-teto.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doParceiro, ErroDeRelatorio, ErroDeTenant, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { VAGAS_DO_PROCESSO } from '@/lib/erp/vagas-de-relatorio';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;

describe.skipIf(!URL_TESTE)('ERP L.4 · transação de relatório (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let a: ClienteDoParceiro;
  let id: string;
  const sufixo = `r${globalThis.crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    id = (await db.parceiroFlow.create({ data: { nome: 'Teto A', slug: `teto-a-${sufixo}`, status: 'ATIVO' } })).id;
    a = doParceiro(id, db);
  });
  afterAll(async () => {
    if (db) {
      await limparParceiros(db, perfil, [id]);
      await db.$disconnect();
    }
  });

  const config = (tx: ClienteDoParceiro) => tx.sql<{ ro: string; teto: string }>`SELECT current_setting('transaction_read_only') AS "ro", current_setting('statement_timeout') AS "teto"`;

  it('a transação de relatório abre somente leitura e com teto de 20 s no banco; a comum não', async () => {
    const [rel] = await a.transacao((tx) => config(tx), { relatorio: {} });
    expect(rel).toEqual({ ro: 'on', teto: '20s' });
    const [comum] = await a.transacao((tx) => config(tx));
    expect(comum.ro).toBe('off');
    expect(comum.teto).toBe('0');
  });

  it('o teto é cortado pelo banco e vira a frase amigável, não um erro 500; a conexão volta limpa', async () => {
    const t0 = Date.now();
    const erro = await a.transacao((tx) => tx.sql`SELECT pg_sleep(3)::text`, { relatorio: { tetoMs: 300 } }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDeRelatorio);
    expect(erro.motivo).toBe('tempo');
    expect(erro.message).toBe('O relatório ficou grande demais. Diminua o período ou escolha menos lojas.');
    expect(Date.now() - t0).toBeLessThan(2_500);
    // A vaga foi devolvida e o teto não vaza para a próxima transação do pool.
    expect(VAGAS_DO_PROCESSO.emUso).toBe(0);
    for (let i = 0; i < 12; i++) {
      const [c] = await a.transacao((tx) => config(tx));
      expect(c.teto).toBe('0');
    }
  });

  it('uma consulta rápida dentro do teto passa normalmente', async () => {
    const r = await a.transacao((tx) => tx.sql<{ n: number }>`SELECT 1::int AS "n"`, { relatorio: { tetoMs: 5_000 } });
    expect(r).toEqual([{ n: 1 }]);
  });

  it('gravar na transação de relatório falha (portão e banco)', async () => {
    const porModelo = await a.transacao((tx) => tx.loja.create({ data: { nome: 'Não pode' } as never }), { relatorio: {} }).catch((e) => e);
    expect(porModelo).toBeInstanceOf(ErroDeTenant);
    expect(porModelo.message).toMatch(/relatório é somente leitura/);
    const porSql = await a.transacao((tx) => tx.sql`UPDATE "Loja" SET "nome" = 'x' WHERE "parceiroId" = ${id}`, { relatorio: {} }).catch((e) => e);
    expect(porSql).toBeInstanceOf(ErroDeTenant);
    // No banco: mesmo sem o portão, a transação é read-only e o Postgres recusa a escrita.
    const noBanco = await a.transacao((tx) => tx.sql`CREATE TEMP TABLE teto_ro (x int)`, { relatorio: {} }).catch((e) => e);
    expect(String(noBanco?.message ?? noBanco)).toMatch(/cannot execute CREATE TABLE in a read-only transaction/);
    // E nada ficou gravado.
    expect(await a.loja.count()).toBe(0);
  });

  it('seis relatórios juntos nunca passam de três ao mesmo tempo e todos terminam', async () => {
    let maximo = 0;
    const rodar = () =>
      a.transacao(
        async (tx) => {
          maximo = Math.max(maximo, VAGAS_DO_PROCESSO.emUso);
          await tx.sql`SELECT pg_sleep(0.4)::text`;
          return true;
        },
        { relatorio: {} },
      );
    const resultados = await Promise.all(Array.from({ length: 6 }, rodar));
    expect(resultados.every(Boolean)).toBe(true);
    expect(maximo).toBe(3);
    expect(VAGAS_DO_PROCESSO.emUso).toBe(0);
  });
});
