/**
 * ERP L.2 · a migration `20261107000000_erp_relatorio_compras` (dois índices ADITIVOS na nota de compra) com DADO ANTIGO, como
 * superusuário e como DONO NÃO-SUPERUSUÁRIO (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a F.1b), planta o que já existia (loja, fornecedor, notas com e
 * sem emissão) e aplica a migration:
 *  - nada some e nada muda; sem aviso nenhum; a RLS (quando o papel pode instalá-la) continua como estava;
 *  - os dois índices nascem; aplicar de novo não dá erro (IF NOT EXISTS);
 *  - o papel do tenant lê as notas pela emissão e pelo lançamento depois da migration;
 *  - o conferidor fica limpo antes (banco da fase anterior) e depois, e acusa o índice que faltar.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-relatorio-compras-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao, INDICES_DA_L_2 } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const ESTA = '20261107000000_erp_relatorio_compras';
const temPsql = spawnSync('psql', ['--version']).status === 0;

function urlDe(banco: string, papel?: string): string {
  const u = new URL(URL_TESTE!);
  u.pathname = `/${banco}`;
  u.search = '';
  if (papel) {
    u.username = papel;
    u.password = papel;
  }
  return u.toString();
}

function psql(url: string, args: string[]) {
  const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, saida: (r.stdout ?? '').trim(), aviso: r.stderr ?? '' };
}

const antes = (alvo: string) => readdirSync(MIGRACOES).filter((n) => /^\d{14}_/.test(n) && n < alvo).sort();

interface Perfil {
  nome: string;
  papel?: string;
  rls: boolean;
}
const PERFIS: Perfil[] = [
  { nome: 'superusuário', rls: true },
  { nome: 'dono não-superusuário COM RLS forçada', papel: 'ff_dono', rls: true },
  { nome: 'dono não-superusuário SEM RLS', papel: 'ff_semrls', rls: false },
];

const papelExiste = (papel: string) => !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `select count(*) from pg_roles where rolname = '${papel}'`]).saida === '1';

describe.skipIf(!URL_TESTE || !temPsql)('ERP L.2 · migration dos relatórios de compras com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  function prepararBanco(perfil: Perfil, nomeDoBanco: string) {
    const dono = urlDe(nomeDoBanco, perfil.papel);
    const superuser = urlDe(nomeDoBanco);
    expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${nomeDoBanco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${nomeDoBanco}`).toBe(true);
    criados.push(nomeDoBanco);
    if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
    for (const m of antes(ESTA)) {
      const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
      expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
    }
    const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'NotaEntrada'`]).saida === 't';
    expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
    const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);
    expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
    const plantado = psql(dono, [
      '-c',
      noContexto(
        'p1',
        `INSERT INTO "Loja"(id,"parceiroId",nome,slug,cnpj) VALUES ('l1','p1','Loja 1','l1','11444777000161');
         INSERT INTO "Fornecedor"(id,"parceiroId",nome,documento,"atualizadoEm") VALUES ('f1','p1','Laticínios Rio','11222333000181',now());
         INSERT INTO "NotaEntrada"(id,"parceiroId","lojaId","fornecedorId","entradaEm","emitidaEm","totalCentavos",status,"lancadaEm","atualizadoEm",numero) VALUES
           ('n1','p1','l1','f1','2026-10-01','2026-09-30',8990,'LANCADA','2026-10-01 02:30:00',now(),'4521'),
           ('n2','p1','l1','f1','2026-10-02',NULL,1000,'LANCADA','2026-10-02 15:00:00',now(),'4522');`,
      ),
    ]);
    expect(plantado.ok, plantado.aviso).toBe(true);
    return { dono, superuser, comRls, noContexto };
  }

  const contagens = (superuser: string) => psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "NotaEntrada") || '/' || (SELECT count(*) FROM "NotaEntrada" WHERE "emitidaEm" IS NOT NULL) || '/' || (SELECT count(*) FROM "Fornecedor")`]).saida;

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('nada some nem muda, sem aviso; os dois índices nascem; aplicar de novo não erra; o papel do tenant lê pela emissão e pelo lançamento', () => {
        const { dono, superuser, comRls, noContexto } = prepararBanco(perfil, `ff_migl2_${rotulo}_${sufixo}`);
        const antesDeTudo = contagens(superuser);
        expect(antesDeTudo).toBe('2/1/1');
        const rlsAntes = psql(superuser, ['-c', `SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE relname = 'NotaEntrada'`]).saida;
        const r = psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(contagens(superuser)).toBe(antesDeTudo);
        expect(psql(superuser, ['-c', `SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE relname = 'NotaEntrada'`]).saida).toBe(rlsAntes);
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = ANY(ARRAY['${INDICES_DA_L_2.join("','")}'])`]).saida).toBe('2');
        // De novo: IF NOT EXISTS.
        const de_novo = psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]);
        expect(de_novo.ok, de_novo.aviso).toBe(true);
        // Pelo papel do tenant (ou o dono, sem RLS): a leitura dos relatórios.
        const lê = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
        const emissao = lê(`SELECT count(*) FROM "NotaEntrada" WHERE "parceiroId" = 'p1' AND "lojaId" = ANY(ARRAY['l1']) AND "emitidaEm" BETWEEN '2026-09-01' AND '2026-09-30'`);
        expect(emissao.ok, emissao.aviso).toBe(true);
        expect(emissao.saida.split('\n').pop()).toBe('1');
        const lancamento = lê(`SELECT count(*) FROM "NotaEntrada" WHERE "parceiroId" = 'p1' AND "lojaId" = ANY(ARRAY['l1']) AND "lancadaEm" >= (('2026-10-01'::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC') AND "lancadaEm" < (('2026-10-02'::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')`);
        expect(lancamento.ok, lancamento.aviso).toBe(true);
        // 02:30 UTC de 01/10 é 23:30 de 30/09 no Rio: fora do dia 01/10.
        expect(lancamento.saida.split('\n').pop()).toBe('0');
        if (comRls) expect(psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "NotaEntrada"`)]).saida.split('\n').pop()).toBe('0');
      });

      it('o conferidor fica limpo antes e depois da migration e acusa o índice que faltar', async () => {
        const { dono, superuser } = prepararBanco(perfil, `ff_migl2c_${rotulo}_${sufixo}`);
        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          // Antes (o banco da fase anterior): limpo, sem cobrar o que ainda não veio.
          expect(await conferirMigracao(db)).toEqual([]);
          expect(psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]).ok).toBe(true);
          expect(await conferirMigracao(db)).toEqual([]);
          expect(psql(superuser, ['-c', `DROP INDEX "${INDICES_DA_L_2[1]}"`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/Índice NotaEntrada_parceiroId_lojaId_lancadaEm_idx NÃO existe/);
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
