/**
 * ERP 2.3 · a migration `20261028000000_erp_cmv` com DADO ANTIGO plantado, como superusuário e como DONO NÃO-SUPERUSUÁRIO
 * (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a 2.2b), planta contagens (uma abertura e um fechamento já
 * FECHADOS e uma abertura em andamento) e aplica a migration:
 *  - nada some, a migration não falha e não avisa (a coluna é nova: não há linha antiga para violar o CHECK);
 *  - a contagem antiga fica com `itensSemPreco` NULO ("não registrado"), e a fechada continua imutável;
 *  - a coluna é gravada no MESMO UPDATE que fecha uma contagem em andamento, e o CHECK recusa número negativo;
 *  - o papel do tenant consegue gravar a coluna nova (a RLS não a deixa de fora);
 *  - o conferidor pós-deploy não lista pendência.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_2_3 = '20261028000000_erp_cmv';
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP 2.3 · migration com dado antigo (Postgres real)', { timeout: 240_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('contagem antiga fica "não registrado", a fechada segue imutável, a coluna grava no UPDATE que fecha, o CHECK recusa negativo e o conferidor não acha pendência', async () => {
        const banco = `ff_mig23_${rotulo}_${sufixo}`;
        const dono = urlDe(banco, perfil.papel);
        const superuser = urlDe(banco);
        expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
        criados.push(banco);
        if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
        for (const m of antes(DA_2_3)) {
          const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
          expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
        }
        const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'Contagem'`]).saida === 't';
        expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
        const comContexto = (sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','p1',true), set_config('role','erp_tenant',true); ${sql}` : sql);

        expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO')`]).ok).toBe(true);
        const plantio = `
          INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1'),('l2','p1','Loja 2','l2');
          INSERT INTO "PeriodoApuracao"(id,"parceiroId",nome,inicio,fim) VALUES ('pa','p1','Setembro','2026-09-01','2026-09-30');
          INSERT INTO "Contagem"(id,"parceiroId","lojaId",tipo,status,desfecho,"referenciaEm","fechadaEm","valorTotalCentavos") VALUES
            ('c1','p1','l1','ABERTURA','FECHADA','APLICADA','2026-09-01','2026-09-01 12:00',1000000);
          INSERT INTO "Contagem"(id,"parceiroId","lojaId","periodoId",tipo,status,desfecho,"referenciaEm","fechadaEm","valorTotalCentavos") VALUES
            ('c2','p1','l1','pa','FECHAMENTO','FECHADA','APLICADA','2026-09-30','2026-09-30 21:00',1200000);
          INSERT INTO "Contagem"(id,"parceiroId","lojaId",tipo,status,"referenciaEm") VALUES
            ('c3','p1','l2','ABERTURA','ABERTA','2026-09-01');`;
        const plantado = psql(dono, ['-c', comContexto(plantio)]);
        expect(plantado.ok, plantado.aviso).toBe(true);
        const conta = () => psql(superuser, ['-c', `SELECT count(*) FROM "Contagem"`]).saida;
        expect(conta()).toBe('3');

        const r = psql(dono, ['-f', join(MIGRACOES, DA_2_3, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(conta()).toBe('3');

        // Contagem antiga: nulo ("não registrado"); o CHECK está validado.
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "Contagem" WHERE "itensSemPreco" IS NULL`]).saida).toBe('3');
        expect(psql(superuser, ['-c', `SELECT convalidated::text FROM pg_constraint WHERE conname = 'Contagem_itensSemPreco_nao_negativo'`]).saida).toBe('true');

        // A fechada continua imutável (a coluna nova não abriu brecha).
        const mudar = psql(dono, ['-c', comContexto(`UPDATE "Contagem" SET "itensSemPreco" = 2 WHERE id = 'c1'`)]);
        expect(mudar.ok).toBe(false);
        expect(mudar.aviso).toContain('Contagem_fechada_imutavel');

        // Número negativo é recusado (na contagem em andamento), e a coluna grava no MESMO UPDATE que fecha.
        const negativo = psql(dono, ['-c', comContexto(`UPDATE "Contagem" SET "itensSemPreco" = -1 WHERE id = 'c3'`)]);
        expect(negativo.ok).toBe(false);
        expect(negativo.aviso).toContain('Contagem_itensSemPreco_nao_negativo');
        const fecha = psql(dono, ['-c', comContexto(`UPDATE "Contagem" SET status = 'FECHADA', desfecho = 'APLICADA', "fechadaEm" = now(), "valorTotalCentavos" = 500000, "itensSemPreco" = 3 WHERE id = 'c3'`)]);
        expect(fecha.ok, fecha.aviso).toBe(true);
        expect(psql(superuser, ['-c', `SELECT "itensSemPreco" FROM "Contagem" WHERE id = 'c3'`]).saida).toBe('3');

        // O papel do tenant alcança a coluna nova (a RLS e os privilégios não a deixam de fora).
        if (perfil.rls) expect(psql(superuser, ['-c', `SELECT has_column_privilege('erp_tenant', '"Contagem"', 'itensSemPreco', 'UPDATE')::text`]).saida).toBe('true');

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
