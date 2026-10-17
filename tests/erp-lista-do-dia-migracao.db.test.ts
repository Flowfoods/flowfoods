/**
 * ERP 3.2 · a migration `20261030000000_erp_lista_do_dia` com DADO ANTIGO plantado, como superusuário e como DONO
 * NÃO-SUPERUSUÁRIO (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a 3.1), planta lotes da 3.1 (um planejado, um concluído com
 * resultado) e aplica a migration:
 *  - nada some e a migration não avisa nada (não há CHECK nem índice que dado antigo possa violar): a coluna nova nasce
 *    `false` nos lotes que já existiam (eram avulsos, a lista do dia não existia) — sem reescrever a tabela;
 *  - o lote concluído continua imutável (o gatilho da 3.1 olha a linha inteira, a coluna nova inclusive) e o estorno passa;
 *  - o lote novo nasce `daLista = true` pelo papel do tenant; o conferidor pós-deploy não acha pendência (e acha a coluna que falta).
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-lista-do-dia-migracao.db.test.ts
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP 3.2 · migration com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('lotes antigos viram avulsos (daLista = false), sem aviso e sem sumir; o concluído segue imutável; o novo nasce da lista; o conferidor não acha pendência', async () => {
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
        const comContexto = (sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','p1',true), set_config('role','erp_tenant',true); ${sql}` : sql);
        expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO')`]).ok).toBe(true);
        const plantado = psql(dono, [
          '-c',
          comContexto(`
            INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1');
            INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","atualizadoEm") VALUES ('i1','p1','Molho','KG','PRE_PREPARO',1000,0,'REFRIGERADO',now());
            INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento","insumoProduzidoId","atualizadoEm") VALUES ('f1','p1','Molho','PRE_PREPARO',2000,'KG','i1',now());
            INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot") VALUES
              ('o1','p1','l1','f1','i1','261001-01','PLANEJADA','2026-10-01',5000,'Molho'),
              ('o2','p1','l1','f1','i1','261001-02','PLANEJADA','2026-10-01',5000,'Molho');
            UPDATE "OrdemProducao" SET status = 'CONCLUIDA', "produzidoMilesimos" = 4600, "custoTotalCentavos" = 11781, "concluidaEm" = now(), "iniciadaEm" = now() WHERE id = 'o2';`),
        ]);
        expect(plantado.ok, plantado.aviso).toBe(true);
        const conta = () => psql(superuser, ['-c', `SELECT count(*) FROM "OrdemProducao"`]).saida;
        expect(conta()).toBe('2');
        // Antes da migration a coluna não existe e o conferidor ainda não cobra (a 3.1 está lá, a 3.2 não): ele a cobra.
        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect((await conferirMigracao(db)).join('\n')).toContain('OrdemProducao.daLista NÃO existe');
        } finally {
          await db.$disconnect();
        }

        const r = psql(dono, ['-f', join(MIGRACOES, DA_3_2, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(conta()).toBe('2');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "OrdemProducao" WHERE "daLista" = false`]).saida).toBe('2');
        expect(psql(superuser, ['-c', `SELECT data_type || '/' || is_nullable || '/' || column_default FROM information_schema.columns WHERE table_name = 'OrdemProducao' AND column_name = 'daLista'`]).saida).toBe('boolean/NO/false');

        // O concluído continua imutável (a coluna nova entra na comparação do gatilho) e o estorno passa.
        const mexe = psql(dono, ['-c', comContexto(`UPDATE "OrdemProducao" SET "daLista" = true WHERE id = 'o2'`)]);
        expect(mexe.ok).toBe(false);
        expect(mexe.aviso).toContain('OrdemProducao_concluida_imutavel');
        const estorna = psql(dono, ['-c', comContexto(`UPDATE "OrdemProducao" SET status = 'CANCELADA', "canceladaEm" = now(), "canceladaPorNome" = 'Gil', "motivoCancelamento" = 'Lote contaminado', versao = versao + 1 WHERE id = 'o2'`)]);
        expect(estorna.ok, estorna.aviso).toBe(true);
        // O lote novo nasce da lista (pelo papel do tenant) e o planejado antigo pode ser marcado.
        const novo = psql(dono, ['-c', comContexto(`INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot","daLista") VALUES ('o3','p1','l1','f1','i1','261002-01','PLANEJADA','2026-10-02',3000,'Molho',true)`)]);
        expect(novo.ok, novo.aviso).toBe(true);
        expect(psql(superuser, ['-c', `SELECT "daLista" FROM "OrdemProducao" WHERE id = 'o3'`]).saida).toBe('t');
        // Sem dizer nada, o lote nasce avulso.
        const avulso = psql(dono, ['-c', comContexto(`INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot") VALUES ('o4','p1','l1','f1','i1','261002-02','PLANEJADA','2026-10-02',3000,'Molho')`)]);
        expect(avulso.ok, avulso.aviso).toBe(true);
        expect(psql(superuser, ['-c', `SELECT "daLista" FROM "OrdemProducao" WHERE id = 'o4'`]).saida).toBe('f');

        const db2 = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db2)).toEqual([]);
        } finally {
          await db2.$disconnect();
        }
      });
    });
  }
});
