/**
 * ERP 3.3 · a migration `20261031000000_erp_producao_equipe` com DADO ANTIGO, como superusuário e como DONO NÃO-SUPERUSUÁRIO
 * (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (o catálogo v2 da 3.2), planta o que já existia (lotes em
 * todas as etapas; o concluído da 3.1 com quem concluiu em `responsavel*`, sem hora de pegar; uma linha da lista com lote) e
 * aplica a migration:
 *  - nada some, não avisa; a coluna nasce; os 4 CHECKs validados; os 2 índices;
 *  - pelo papel do tenant: pegar o lote em produção (dono + hora) passa; dono no planejado, dono sem pessoa e troca de dono no
 *    concluído são recusados (CHECK e o gatilho da 3.1); o outro parceiro não enxerga;
 *  - o conferidor pós-deploy não lista pendência — e lista quando falta um CHECK ou um índice da 3.3.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-producao-equipe-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_3_3 = '20261031000000_erp_producao_equipe';
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP 3.3 · migration de quem pegou o lote, com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('com dado antigo: nada some, sem aviso, coluna, CHECKs validados e índices; as regras valem pelo papel do tenant; o conferidor não acha pendência', async () => {
        const banco = `ff_mig33_${rotulo}_${sufixo}`;
        const dono = urlDe(banco, perfil.papel);
        const superuser = urlDe(banco);
        expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
        criados.push(banco);
        if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
        for (const m of antes(DA_3_3)) {
          const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
          expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
        }
        const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'OrdemProducao'`]).saida === 't';
        expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
        const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);

        // O que já existia: lotes em todas as etapas. O concluído da 3.1 guarda quem concluiu em `responsavel*` (sem hora de pegar).
        expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
        const plantado = psql(dono, [
          '-c',
          noContexto(
            'p1',
            `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1');
             INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","atualizadoEm") VALUES
               ('i1','p1','Molho','KG','PRE_PREPARO',1000,0,'REFRIGERADO',now());
             INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento","insumoProduzidoId","atualizadoEm") VALUES
               ('f1','p1','Molho','PRE_PREPARO',2000,'KG','i1',now());
             INSERT INTO "Requisicao"(id,"parceiroId","lojaId") VALUES ('r1','p1','l1'),('r2','p1','l1'),('r3','p1','l1'),('r4','p1','l1');
             INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot","requisicaoId") VALUES
               ('o1','p1','l1','f1','i1','261021-01','PLANEJADA','2026-10-21',5000,'Molho','r1');
             INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot","requisicaoId","iniciadaEm","iniciadaPorNome") VALUES
               ('o2','p1','l1','f1','i1','261021-02','EM_EXECUCAO','2026-10-21',5000,'Molho','r2',now(),'Caio');
             INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot","requisicaoId","iniciadaEm","concluidaEm","produzidoMilesimos","custoTotalCentavos","concluidaPorNome","responsavelNomeSnapshot","responsavelUsuarioId") VALUES
               ('o3','p1','l1','f1','i1','261021-03','CONCLUIDA','2026-10-21',5000,'Molho','r3',now(),now(),4600,11781,'Caio','Caio','u-caio');
             INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot","requisicaoId","canceladaEm","motivoCancelamento") VALUES
               ('o4','p1','l1','f1','i1','261021-04','CANCELADA','2026-10-21',5000,'Molho','r4',now(),'faltou leite');
             INSERT INTO "ListaProducao"(id,"parceiroId","lojaId",dia,"criadaPorNome","atualizadaPorNome") VALUES ('lp1','p1','l1','2026-10-21','Gil','Gil');
             INSERT INTO "ListaProducaoItem"(id,"parceiroId","listaId","fichaId","fichaNomeSnapshot","unidadeSnapshot","quantidadeMilesimos","ordemProducaoId") VALUES ('it1','p1','lp1','f1','Molho','KG',5000,'o2');`,
          ),
        ]);
        expect(plantado.ok, plantado.aviso).toBe(true);
        const conta = () => psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "OrdemProducao")::text || '/' || (SELECT count(*) FROM "ListaProducaoItem")::text || '/' || (SELECT string_agg(coalesce("responsavelUsuarioId",'-'), ',' ORDER BY id) FROM "OrdemProducao")`]).saida;
        expect(conta()).toBe('4/1/-,-,u-caio,-');

        const r = psql(dono, ['-f', join(MIGRACOES, DA_3_3, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(conta()).toBe('4/1/-,-,u-caio,-');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM information_schema.columns WHERE table_name = 'OrdemProducao' AND column_name = 'responsavelDesde'`]).saida).toBe('1');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE conrelid = '"OrdemProducao"'::regclass AND conname LIKE 'OrdemProducao_responsavel_%' AND convalidated`]).saida).toBe('4');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname IN ('OrdemProducao_parceiroId_lojaId_concluidaEm_idx','OrdemProducao_parceiroId_lojaId_canceladaEm_idx')`]).saida).toBe('2');

        // Pelo papel do tenant (no contexto de p1).
        const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
        // Pegar o lote em produção: dono + hora.
        expect(comoP1(`UPDATE "OrdemProducao" SET "responsavelDesde" = now(), "responsavelUsuarioId" = 'u-duda', "responsavelNomeSnapshot" = 'Duda' WHERE id = 'o2'`).ok).toBe(true);
        // Dono no planejado, dono sem pessoa, nome longo: recusados.
        expect(comoP1(`UPDATE "OrdemProducao" SET "responsavelDesde" = now(), "responsavelUsuarioId" = 'u-duda', "responsavelNomeSnapshot" = 'Duda' WHERE id = 'o1'`).aviso).toContain('OrdemProducao_responsavel_so_em_producao');
        expect(comoP1(`UPDATE "OrdemProducao" SET "responsavelUsuarioId" = NULL WHERE id = 'o2'`).aviso).toContain('OrdemProducao_responsavel_com_pessoa');
        expect(comoP1(`UPDATE "OrdemProducao" SET "responsavelNomeSnapshot" = repeat('x', 121) WHERE id = 'o2'`).aviso).toContain('OrdemProducao_responsavel_nome_curto');
        // O concluído (da 3.1) não troca de dono: o gatilho da 3.1 cobre a coluna nova.
        expect(comoP1(`UPDATE "OrdemProducao" SET "responsavelDesde" = "concluidaEm" WHERE id = 'o3'`).aviso).toContain('OrdemProducao_concluida_imutavel');
        if (perfil.rls) {
          // O outro parceiro não enxerga nem muda.
          expect(psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "OrdemProducao"`)]).saida.split('\n').pop()).toBe('0');
          psql(dono, ['-c', noContexto('p2', `UPDATE "OrdemProducao" SET "responsavelDesde" = NULL, "responsavelUsuarioId" = NULL, "responsavelNomeSnapshot" = NULL`)]);
          expect(psql(superuser, ['-c', `SELECT "responsavelUsuarioId" FROM "OrdemProducao" WHERE id = 'o2'`]).saida).toBe('u-duda');
        }

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
          // O conferidor acusa o índice e o CHECK que faltarem (e diz qual migration rodar).
          expect(psql(superuser, ['-c', `DROP INDEX "OrdemProducao_parceiroId_lojaId_concluidaEm_idx"`]).ok).toBe(true);
          expect(psql(superuser, ['-c', `ALTER TABLE "OrdemProducao" DROP CONSTRAINT "OrdemProducao_responsavel_com_pessoa"`]).ok).toBe(true);
          const pend = await conferirMigracao(db);
          expect(pend).toEqual([
            expect.stringMatching(/CHECK OrdemProducao_responsavel_com_pessoa \(OrdemProducao\) NÃO existe: a migration 20261031000000_erp_producao_equipe/),
            expect.stringMatching(/Índice OrdemProducao_parceiroId_lojaId_concluidaEm_idx NÃO existe: a migration 20261031000000_erp_producao_equipe/),
          ]);
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
