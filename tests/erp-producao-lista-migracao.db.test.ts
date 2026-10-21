/**
 * ERP 3.2 · a migration `20261030000000_erp_lista_do_dia` com DADO ANTIGO, como superusuário e como DONO NÃO-SUPERUSUÁRIO
 * (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a 3.1), planta o que já existia (parceiros, lojas, fichas,
 * insumos e lotes de produção em todas as etapas) e aplica a migration:
 *  - nada some, não avisa; as duas tabelas nascem com os CHECKs validados, os índices únicos, as FKs compostas e os gatilhos;
 *  - com RLS (superusuário e dono com FORCE): RLS ligada, FORÇADA e com a política nas duas; sem RLS: nenhuma das duas tem;
 *  - depois da migration, pelo papel do tenant: a lista e a linha entram; a mesma loja e dia não repetem; a linha que virou lote
 *    não muda nem sai, e com o lote cancelado volta a mudar; o lote tem de ser da mesma loja, dia e ficha; o outro parceiro não
 *    enxerga; o conferidor pós-deploy não lista pendência — e lista quando falta um gatilho.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-producao-lista-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_3_2 = '20261030000000_erp_lista_do_dia';
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP 3.2 · migration da lista do dia com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('com dado antigo: nada some, sem aviso, tabelas com CHECKs, índices, gatilhos e (com RLS) a RLS forçada; a lista funciona pelo papel do tenant e o conferidor não acha pendência', async () => {
        const banco = `ff_mig32_${rotulo}_${sufixo}`;
        const dono = urlDe(banco, perfil.papel);
        const superuser = urlDe(banco);
        expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
        criados.push(banco);
        if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
        for (const m of antes(DA_3_2)) {
          const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
          expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
        }
        const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'OrdemProducao'`]).saida === 't';
        expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
        const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);

        // O que já existia: dois parceiros, lojas, fichas, insumos e lotes em todas as etapas (o da 3.1).
        expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
        const plantado = psql(dono, [
          '-c',
          noContexto(
            'p1',
            `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1'),('l2','p1','Loja 2','l2');
             INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","atualizadoEm") VALUES
               ('i1','p1','Molho','KG','PRE_PREPARO',1000,0,'REFRIGERADO',now()),('i2','p1','Base','KG','PRE_PREPARO',1000,0,'REFRIGERADO',now());
             INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento","insumoProduzidoId","atualizadoEm") VALUES
               ('f1','p1','Molho','PRE_PREPARO',2000,'KG','i1',now()),('f2','p1','Base','PRE_PREPARO',1000,'KG','i2',now());
             INSERT INTO "Requisicao"(id,"parceiroId","lojaId") VALUES ('r1','p1','l1'),('r2','p1','l1'),('r3','p1','l2'),('r4','p1','l1');
             INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot","requisicaoId") VALUES
               ('o1','p1','l1','f1','i1','261021-01','PLANEJADA','2026-10-21',5000,'Molho','r1'),
               ('o3','p1','l2','f1','i1','261021-03','PLANEJADA','2026-10-21',5000,'Molho','r3'),
               ('o4','p1','l1','f2','i2','261021-04','PLANEJADA','2026-10-21',1000,'Base','r4');
             INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot","requisicaoId","canceladaEm","motivoCancelamento") VALUES
               ('o2','p1','l1','f1','i1','261021-02','CANCELADA','2026-10-21',5000,'Molho','r2',now(),'faltou leite');`,
          ),
        ]);
        expect(plantado.ok, plantado.aviso).toBe(true);
        const conta = () => psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "OrdemProducao")::text || '/' || (SELECT count(*) FROM "FichaTecnica")::text || '/' || (SELECT count(*) FROM "Loja")::text`]).saida;
        expect(conta()).toBe('4/2/2');

        const r = psql(dono, ['-f', join(MIGRACOES, DA_3_2, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(conta()).toBe('4/2/2');

        // As tabelas, os CHECKs (validados de nascença), os índices e os gatilhos.
        const tabelas = psql(superuser, ['-c', `SELECT relname || ':' || relrowsecurity || ':' || relforcerowsecurity FROM pg_class WHERE relname IN ('ListaProducao','ListaProducaoItem') AND relkind = 'r' ORDER BY 1`]).saida.split('\n');
        const sim = String(perfil.rls);
        expect(tabelas).toEqual([`ListaProducao:${sim}:${sim}`, `ListaProducaoItem:${sim}:${sim}`]);
        const politicas = psql(superuser, ['-c', `SELECT count(*) FROM pg_policies WHERE tablename IN ('ListaProducao','ListaProducaoItem') AND policyname LIKE '%_do_parceiro'`]).saida;
        expect(politicas).toBe(perfil.rls ? '2' : '0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE conrelid IN ('"ListaProducao"'::regclass, '"ListaProducaoItem"'::regclass) AND contype = 'c' AND convalidated`]).saida).toBe('6');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE conrelid IN ('"ListaProducao"'::regclass, '"ListaProducaoItem"'::regclass) AND contype = 'f'`]).saida).toBe('6');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname IN ('ListaProducao_parceiroId_lojaId_dia_key','ListaProducaoItem_parceiroId_ordemProducaoId_key')`]).saida).toBe('2');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('ListaProducao_parceiro_imutavel','ListaProducaoItem_parceiro_imutavel','ListaProducao_loja_dia_imutaveis','ListaProducaoItem_lote_confere')`]).saida).toBe('4');

        // Pelo papel do tenant (no contexto de p1): a lista do dia e a linha que aponta o lote planejado da mesma loja.
        const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
        const lista = comoP1(`INSERT INTO "ListaProducao"(id,"parceiroId","lojaId",dia,"criadaPorNome","atualizadaPorNome") VALUES ('lp1','p1','l1','2026-10-21','Gil','Gil');
          INSERT INTO "ListaProducaoItem"(id,"parceiroId","listaId","fichaId","fichaNomeSnapshot","unidadeSnapshot","quantidadeMilesimos","ordemProducaoId") VALUES ('it1','p1','lp1','f1','Molho','KG',5000,'o1'),('it2','p1','lp1','f1','Molho','KG',2000,'o2');`);
        expect(lista.ok, lista.aviso).toBe(true);
        // A mesma loja e dia não repetem; quantidade zero e acima de 10 mil são recusadas.
        expect(comoP1(`INSERT INTO "ListaProducao"(id,"parceiroId","lojaId",dia,"criadaPorNome","atualizadaPorNome") VALUES ('lp2','p1','l1','2026-10-21','Gil','Gil')`).aviso).toContain('ListaProducao_parceiroId_lojaId_dia_key');
        expect(comoP1(`INSERT INTO "ListaProducaoItem"(id,"parceiroId","listaId","fichaId","fichaNomeSnapshot","unidadeSnapshot","quantidadeMilesimos") VALUES ('itx','p1','lp1','f1','Molho','KG',0)`).aviso).toContain('ListaProducaoItem_quantidade_faixa');
        expect(comoP1(`INSERT INTO "ListaProducaoItem"(id,"parceiroId","listaId","fichaId","fichaNomeSnapshot","unidadeSnapshot","quantidadeMilesimos") VALUES ('itx','p1','lp1','f1','Molho','KG',10000001)`).aviso).toContain('ListaProducaoItem_quantidade_faixa');
        // O lote de outra loja, ou de outra ficha, não serve à linha.
        expect(comoP1(`INSERT INTO "ListaProducaoItem"(id,"parceiroId","listaId","fichaId","fichaNomeSnapshot","unidadeSnapshot","quantidadeMilesimos","ordemProducaoId") VALUES ('it3','p1','lp1','f1','Molho','KG',1000,'o3')`).aviso).toContain('ListaProducaoItem_lote_confere');
        expect(comoP1(`INSERT INTO "ListaProducaoItem"(id,"parceiroId","listaId","fichaId","fichaNomeSnapshot","unidadeSnapshot","quantidadeMilesimos","ordemProducaoId") VALUES ('it3','p1','lp1','f1','Molho','KG',1000,'o4')`).aviso).toContain('ListaProducaoItem_lote_confere');
        // A linha com lote vivo não muda nem sai; a do lote cancelado muda (e pode apontar outro lote).
        expect(comoP1(`UPDATE "ListaProducaoItem" SET "quantidadeMilesimos" = 1 WHERE id = 'it1'`).aviso).toContain('ListaProducaoItem_com_lote');
        expect(comoP1(`DELETE FROM "ListaProducaoItem" WHERE id = 'it1'`).aviso).toContain('ListaProducaoItem_com_lote');
        expect(comoP1(`DELETE FROM "ListaProducao" WHERE id = 'lp1'`).aviso).toContain('ListaProducaoItem_com_lote');
        expect(comoP1(`UPDATE "ListaProducaoItem" SET "quantidadeMilesimos" = 3000, "ordemProducaoId" = NULL WHERE id = 'it2'`).ok).toBe(true);
        // A lista não muda de loja nem de dia.
        expect(comoP1(`UPDATE "ListaProducao" SET dia = '2026-10-22' WHERE id = 'lp1'`).aviso).toContain('ListaProducao_loja_dia_imutaveis');
        // O dono da linha é imutável.
        expect(comoP1(`UPDATE "ListaProducaoItem" SET "parceiroId" = 'p2' WHERE id = 'it2'`).ok).toBe(false);
        if (perfil.rls) {
          // O outro parceiro não enxerga, não muda e não apaga.
          expect(psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "ListaProducao"`)]).saida.split('\n').pop()).toBe('0');
          psql(dono, ['-c', noContexto('p2', `UPDATE "ListaProducaoItem" SET "quantidadeMilesimos" = 7; DELETE FROM "ListaProducaoItem"`)]);
          expect(psql(superuser, ['-c', `SELECT string_agg(id || ':' || "quantidadeMilesimos", ',' ORDER BY id) FROM "ListaProducaoItem"`]).saida).toBe('it1:5000,it2:3000');
        }

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
          // O conferidor acusa o gatilho que faltar (e diz qual migration rodar).
          expect(psql(superuser, ['-c', `DROP TRIGGER "ListaProducaoItem_lote_confere" ON "ListaProducaoItem"`]).ok).toBe(true);
          const pend = await conferirMigracao(db);
          expect(pend).toEqual([expect.stringMatching(/Gatilho ListaProducaoItem_lote_confere NÃO existe: a migration 20261030000000_erp_lista_do_dia/)]);
          if (perfil.rls) {
            expect(psql(superuser, ['-c', `ALTER TABLE "ListaProducao" NO FORCE ROW LEVEL SECURITY`]).ok).toBe(true);
            expect((await conferirMigracao(db)).join('\n')).toMatch(/Tabela ListaProducao sem RLS forçada/);
          }
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
