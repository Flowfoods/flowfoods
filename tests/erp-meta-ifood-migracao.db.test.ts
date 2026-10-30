/** Migration aditiva com legado positivo, zero explícito e ausência, nos três perfis de banco já usados pelo ERP. */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { CHECK_DA_META_SEM_TAXA, conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
if (URL_TESTE && !['localhost', '127.0.0.1'].includes(new URL(URL_TESTE).hostname)) throw new Error('Migration de teste exige banco local.');
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const ESTA = '20261119000000_erp_taxa_ifood_independente';
const temPsql = spawnSync('psql', ['--version']).status === 0;
function urlDe(banco: string, papel?: string) {
  const u = new URL(URL_TESTE!); u.pathname = `/${banco}`; u.search = '';
  if (papel) { u.username = papel; u.password = papel; }
  return u.toString();
}
function psql(url: string, args: string[]) {
  const r = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', url, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, saida: (r.stdout ?? '').trim(), aviso: r.stderr ?? '' };
}
const PERFIS = [{ nome: 'superusuário', papel: undefined, rls: true }, { nome: 'dono COM RLS', papel: 'ff_dono', rls: true }, { nome: 'dono SEM RLS', papel: 'ff_semrls', rls: false }];
const papelExiste = (papel: string) => !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `SELECT count(*) FROM pg_roles WHERE rolname = '${papel}'`]).saida === '1';

describe.skipIf(!URL_TESTE || !temPsql)('Meta iFood sem taxa: migration com dado antigo', { timeout: 360_000 }, () => {
  const sufixo = crypto.randomUUID().slice(0, 8), criados: string[] = [];
  afterAll(() => { for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]); });
  for (const perfil of PERFIS) {
    it.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(`${perfil.nome}: preserva linhas, defaults e RLS; pendente não vira zero conhecido`, async () => {
      const nome = `ff_migmeta_${perfil.papel ?? 'su'}_${sufixo}`;
      expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${nome}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok).toBe(true);
      criados.push(nome);
      const dono = urlDe(nome, perfil.papel), admin = urlDe(nome);
      if (perfil.papel) expect(psql(admin, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
      for (const m of readdirSync(MIGRACOES).filter(m => /^\d{14}_/.test(m) && m < ESTA).sort()) {
        const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
        expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
      }
      const comRls = psql(admin, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'CanalConfig'`]).saida === 't';
      expect(comRls).toBe(perfil.rls);
      const contexto = (p: string, sql: string) => comRls ? `BEGIN; SELECT set_config('app.parceiro_id','${p}',true), set_config('role','erp_tenant',true); ${sql}; COMMIT;` : sql;
      const executar = (p: string, sql: string) => psql(dono, ['-c', contexto(p, sql)]);
      expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO'),('p3','P3','p3','ATIVO')`]).ok).toBe(true);
      for (const [id, taxa, meta] of [['p1', 2300, 3000], ['p2', 0, 2500]]) {
        const r = executar(String(id), `INSERT INTO "CanalConfig"(id,"parceiroId",canal,"taxaBp","taxaPagamentoBp","margemAlvoPadraoBp","metaCmvPadraoBp","atualizadoEm") VALUES ('${id}','${id}','IFOOD',${taxa},0,1000,${meta},'2026-01-01')`);
        expect(r.ok, r.aviso).toBe(true);
      }
      const antes = psql(admin, ['-c', `SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM "CanalConfig" c`]).saida;
      const rlsAntes = psql(admin, ['-c', `SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE relname = 'CanalConfig'`]).saida;
      const db = new PrismaClient({ datasources: { db: { url: admin } } });
      try {
        expect(await conferirMigracao(db)).toEqual([]);
        const r = psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(psql(admin, ['-c', `SELECT jsonb_agg(to_jsonb(c) - 'taxaConfigurada' ORDER BY id) FROM "CanalConfig" c`]).saida).toBe(antes);
        expect(psql(admin, ['-c', `SELECT count(*) FROM "CanalConfig" WHERE "taxaConfigurada"`]).saida).toBe('2');
        expect(psql(admin, ['-c', `SELECT count(*) FROM "CanalConfig" WHERE "parceiroId"='p3'`]).saida).toBe('0');
        expect(psql(admin, ['-c', `SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE relname = 'CanalConfig'`]).saida).toBe(rlsAntes);
        expect(await conferirMigracao(db)).toEqual([]);
        expect(executar('p3', `INSERT INTO "CanalConfig"(id,"parceiroId",canal,"metaCmvPadraoBp","taxaConfigurada","atualizadoEm") VALUES ('pendente','p3','IFOOD',3000,false,now())`).ok).toBe(true);
        expect(psql(admin, ['-c', `SELECT "taxaConfigurada"::text || '/' || "taxaBp" || '/' || "taxaPagamentoBp" FROM "CanalConfig" WHERE id='pendente'`]).saida).toBe('false/0/0');
        expect(executar('p3', `UPDATE "CanalConfig" SET "taxaBp"=1200 WHERE id='pendente'`).ok).toBe(false);
        if (comRls) expect(executar('p3', `SELECT count(*) FROM "CanalConfig" WHERE "parceiroId" <> 'p3'`).saida.split('\n').pop()).toBe('0');
        expect(psql(dono, ['-c', `ALTER TABLE "CanalConfig" ALTER COLUMN "taxaConfigurada" SET DEFAULT false`]).ok).toBe(true);
        expect((await conferirMigracao(db)).join('\n')).toContain('BOOLEAN NOT NULL DEFAULT true');
        expect(psql(dono, ['-c', `ALTER TABLE "CanalConfig" ALTER COLUMN "taxaConfigurada" SET DEFAULT true; ALTER TABLE "CanalConfig" DROP CONSTRAINT "${CHECK_DA_META_SEM_TAXA}"`]).ok).toBe(true);
        expect((await conferirMigracao(db)).join('\n')).toContain(`CHECK ${CHECK_DA_META_SEM_TAXA} (CanalConfig) NÃO existe`);
      } finally { await db.$disconnect(); }
    });
  }
});
