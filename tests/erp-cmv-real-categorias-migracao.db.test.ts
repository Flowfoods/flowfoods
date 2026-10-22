/**
 * ERP I.2b · a migration `20261104000000_erp_cmv_real_categorias` com DADO ANTIGO, como superusuário e como DONO NÃO-SUPERUSUÁRIO (com
 * RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a I.2a com o endurecimento), planta conjuntos de metas que já existiam
 * (da rede e de uma loja que personalizou) e aplica a migration:
 *  - nada some, não avisa (nenhum WARNING) e NADA do que já estava gravado muda: a coluna nova nasce nula em todo conjunto antigo
 *    ("sem total próprio: vale o da rede", o que valia até aqui) e o CHECK nasce validado;
 *  - pelo papel do tenant: a loja que personaliza grava a meta total própria; a rede, a loja que segue a rede e o valor fora de 0 a 100 %
 *    são recusados pelo banco; o outro parceiro não enxerga;
 *  - o conferidor pós-deploy não lista pendência — e lista o CHECK que ficar NOT VALID ou que faltar.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv-real-categorias-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const ESTA = '20261104000000_erp_cmv_real_categorias';
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP I.2b · migration da meta total por loja com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('com conjuntos antigos: nada some nem muda, sem aviso; a coluna nasce nula; o banco recusa total na rede e na loja que segue; o conferidor não acha pendência', async () => {
        const banco = `ff_migi2b_${rotulo}_${sufixo}`;
        const dono = urlDe(banco, perfil.papel);
        const superuser = urlDe(banco);
        expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
        criados.push(banco);
        if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
        for (const m of antes(ESTA)) {
          const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
          expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
        }
        const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'Insumo'`]).saida === 't';
        expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
        const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);

        expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
        const plantado = psql(dono, [
          '-c',
          noContexto(
            'p1',
            `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1'), ('l2','p1','Loja 2','l2');
             INSERT INTO "CategoriaInsumo"(id,"parceiroId",chave,nome,ordem,sistema,"atualizadoEm") VALUES ('cp','p1','PROTEINA','Proteína',10,false,now());
             INSERT INTO "MetaCmvConjunto"(id,"parceiroId","lojaId","vigenteDesde","criadoPorNome") VALUES ('k1','p1',NULL,'2026-09-01','Marina'), ('k2','p1','l1','2026-09-01','Marina');
             INSERT INTO "MetaCmvConjunto"(id,"parceiroId","lojaId","vigenteDesde","segueARede","criadoPorNome") VALUES ('k3','p1','l2','2026-09-01',true,'Marina');
             INSERT INTO "MetaCmvCategoria"(id,"parceiroId","conjuntoId","categoriaId","percentualBp") VALUES ('m1','p1','k1','cp',1100), ('m2','p1','k2','cp',1400);`,
          ),
        ]);
        expect(plantado.ok, plantado.aviso).toBe(true);
        expect(psql(dono, ['-c', noContexto('p2', `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l9','p2','Loja de P2','l9')`)]).ok).toBe(true);
        const conjuntos = () => psql(superuser, ['-c', `SELECT string_agg(id || ':' || coalesce("lojaId",'-') || ':' || "vigenteDesde" || ':' || "segueARede" || ':' || versao, ',' ORDER BY id) FROM "MetaCmvConjunto"`]).saida;
        const antesDeTudo = conjuntos();

        const r = psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');

        // Nada mudou, e todo conjunto antigo fica SEM total próprio (vale o da rede, como valia).
        expect(conjuntos()).toBe(antesDeTudo);
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "MetaCmvConjunto" WHERE "metaTotalBp" IS NOT NULL`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "MetaCmvCategoria"`]).saida).toBe('2');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE conname = 'MetaCmvConjunto_total_proprio' AND convalidated`]).saida).toBe('1');

        // Pelo papel do tenant (ou o dono, sem RLS): a loja que personaliza grava a meta total própria (o conjunto dela é o mais novo do escopo).
        const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
        const grava = comoP1(`UPDATE "MetaCmvConjunto" SET "metaTotalBp" = 3000, versao = 2 WHERE id = 'k2'`);
        expect(grava.ok, grava.aviso).toBe(true);
        expect(comoP1(`UPDATE "MetaCmvConjunto" SET "metaTotalBp" = 3200 WHERE id = 'k1'`).aviso).toContain('MetaCmvConjunto_total_proprio'); // a rede não tem total aqui (é a DreMeta)
        expect(comoP1(`UPDATE "MetaCmvConjunto" SET "metaTotalBp" = 3200 WHERE id = 'k3'`).aviso).toContain('MetaCmvConjunto_total_proprio'); // quem segue a rede não tem total
        expect(comoP1(`UPDATE "MetaCmvConjunto" SET "metaTotalBp" = 10001 WHERE id = 'k2'`).aviso).toContain('MetaCmvConjunto_total_proprio');
        expect(comoP1(`UPDATE "MetaCmvConjunto" SET "metaTotalBp" = -1 WHERE id = 'k2'`).aviso).toContain('MetaCmvConjunto_total_proprio');
        // Voltar a seguir a rede sem limpar o total é recusado; limpando junto, passa.
        expect(comoP1(`UPDATE "MetaCmvConjunto" SET "segueARede" = true WHERE id = 'k2'`).aviso).toContain('MetaCmvConjunto_total_proprio');
        expect(comoP1(`UPDATE "MetaCmvConjunto" SET "segueARede" = true, "metaTotalBp" = NULL WHERE id = 'k2'`).ok).toBe(true);
        if (perfil.rls) {
          expect(psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "MetaCmvConjunto"`)]).saida.split('\n').pop()).toBe('0');
          expect(psql(dono, ['-c', noContexto('p2', `UPDATE "MetaCmvConjunto" SET "metaTotalBp" = 2500 WHERE id = 'k2'`)]).saida).not.toContain('UPDATE 1');
        }

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
          // O conferidor acusa o CHECK que ficar NOT VALID e o que faltar.
          expect(psql(superuser, ['-c', `ALTER TABLE "MetaCmvConjunto" DROP CONSTRAINT "MetaCmvConjunto_total_proprio"; ALTER TABLE "MetaCmvConjunto" ADD CONSTRAINT "MetaCmvConjunto_total_proprio" CHECK ("metaTotalBp" IS NULL OR "metaTotalBp" >= 0) NOT VALID`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/CHECK MetaCmvConjunto_total_proprio ficou NOT VALID/);
          expect(psql(superuser, ['-c', `ALTER TABLE "MetaCmvConjunto" DROP CONSTRAINT "MetaCmvConjunto_total_proprio"`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/CHECK MetaCmvConjunto_total_proprio \(MetaCmvConjunto\) NÃO existe/);
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
