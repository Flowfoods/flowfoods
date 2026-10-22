/**
 * ERP I.1b · as migrations `20261102000000_erp_insumo_clareza` (tipo MATERIAL e marca de referência) e
 * `20261102010000_erp_insumo_conservacao_confirmada` com DADO ANTIGO, como superusuário e como DONO NÃO-superusuário (com RLS
 * FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a I.1a), planta o que já existia (dois parceiros, insumos
 * em Seco, um pré-preparo, saldo, nota e histórico) e aplica as duas migrations:
 *  - nada some, não avisa (nenhum WARNING) e NADA do que já estava gravado muda (tipo, custo, unidade, conservação, prazo,
 *    categoria): a migration não reinterpreta o Seco antigo nem o custo 0;
 *  - as colunas novas nascem nulas (a marca e a confirmação da conservação), o CHECK da marca nasce validado;
 *  - depois da migration, pelo papel do tenant: o insumo entra com o tipo MATERIAL e a marca, o CHECK recusa marca torta ou
 *    longa, o outro parceiro não enxerga; o conferidor pós-deploy não lista pendência — e lista o CHECK que ficar NOT VALID;
 *  - a migration não cria nota, movimento, despesa nem conta (as contagens dessas tabelas ficam idênticas).
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-insumo-clareza-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const CLAREZA = '20261102000000_erp_insumo_clareza';
const CONFIRMADA = '20261102010000_erp_insumo_conservacao_confirmada';
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP I.1b · migrations da clareza do cadastro com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('com dado antigo: nada some nem muda, sem aviso; colunas novas nulas; tipo MATERIAL e marca funcionam pelo papel do tenant; o conferidor não acha pendência', async () => {
        const banco = `ff_migi1b_${rotulo}_${sufixo}`;
        const dono = urlDe(banco, perfil.papel);
        const superuser = urlDe(banco);
        expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
        criados.push(banco);
        if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
        for (const m of antes(CLAREZA)) {
          const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
          expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
        }
        const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'Insumo'`]).saida === 't';
        expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
        const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);

        // O que já existia: dois parceiros; insumos em Seco (a frango "assumida" e a farinha de verdade), custo 0 ("ainda não sei"), um pré-preparo.
        expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
        const plantado = psql(dono, [
          '-c',
          noContexto(
            'p1',
            `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1');
             INSERT INTO "CategoriaInsumo"(id,"parceiroId",chave,nome,ordem,sistema,"atualizadoEm") VALUES ('cp','p1','PROTEINA','Proteína',10,false,now());
             INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","validadeSecoMin","categoriaId","atualizadoEm") VALUES
               ('i1','p1','Coxa de frango','KG','INGREDIENTE',5000,0,'SECO',NULL,'cp',now()),
               ('i2','p1','Farinha de trigo','KG','INGREDIENTE',5000,2500,'SECO',4320,NULL,now()),
               ('i3','p1','Caixa kraft','UN','EMBALAGEM',100000,7400,'SECO',NULL,NULL,now()),
               ('i4','p1','Molho','KG','PRE_PREPARO',1000,0,'REFRIGERADO',NULL,NULL,now());
             INSERT INTO "SaldoEstoque"(id,"parceiroId","lojaId","insumoId","quantidadeMilesimos","valorCentavos","atualizadoEm") VALUES ('s1','p1','l1','i2',3000,5000,now());
             INSERT INTO "HistoricoAlteracao"(id,"parceiroId",entidade,"entidadeId",acao,depois,"autorNome") VALUES ('h1','p1','Insumo','i2','CRIOU','{"nome":"Farinha de trigo"}','Marina');`,
          ),
        ]);
        expect(plantado.ok, plantado.aviso).toBe(true);
        expect(psql(dono, ['-c', noContexto('p2', `INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,"conteudoMilesimos","precoEmbalagemCentavos","atualizadoEm") VALUES ('j1','p2','Cebola','KG',1000,500,now())`)]).ok).toBe(true);
        const retrato = () =>
          psql(superuser, ['-c', `SELECT string_agg(id || ':' || nome || ':' || unidade || ':' || tipo || ':' || "conteudoMilesimos" || ':' || "precoEmbalagemCentavos" || ':' || conservacao || ':' || coalesce("validadeSecoMin"::text,'-') || ':' || coalesce("categoriaId",'-') || ':' || ativo, ',' ORDER BY id) FROM "Insumo"`]).saida;
        const contas = () =>
          psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "Insumo")::text || '/' || (SELECT count(*) FROM "SaldoEstoque")::text || '/' || (SELECT count(*) FROM "HistoricoAlteracao")::text || '/' || (SELECT count(*) FROM "NotaEntrada")::text || '/' || (SELECT count(*) FROM "MovimentoEstoque")::text || '/' || (SELECT count(*) FROM "Despesa")::text`]).saida;
        const retratoAntes = retrato();
        expect(contas()).toBe('5/1/1/0/0/0');

        // A primeira: o tipo e a marca. Nenhum WARNING, nada muda.
        const r1 = psql(dono, ['-f', join(MIGRACOES, CLAREZA, 'migration.sql')]);
        expect(r1.ok, r1.aviso).toBe(true);
        expect(r1.aviso).not.toContain('WARNING');
        // A segunda: a confirmação da conservação.
        const r2 = psql(dono, ['-f', join(MIGRACOES, CONFIRMADA, 'migration.sql')]);
        expect(r2.ok, r2.aviso).toBe(true);
        expect(r2.aviso).not.toContain('WARNING');

        expect(contas()).toBe('5/1/1/0/0/0');
        // O Seco que ninguém escolheu NÃO é reinterpretado, e o custo 0 continua 0: a migration só acrescenta colunas.
        expect(retrato()).toBe(retratoAntes);
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "Insumo" WHERE "marcaReferencia" IS NOT NULL OR "conservacaoConfirmadaEm" IS NOT NULL`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'InsumoTipo'`]).saida).toBe('INGREDIENTE,EMBALAGEM,PRE_PREPARO,MATERIAL');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND convalidated AND conname = 'Insumo_marcaReferencia_curta'`]).saida).toBe('1');

        // Pelo papel do tenant: o material entra com a marca; o CHECK recusa marca torta ou longa; o insumo antigo aceita a confirmação.
        const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
        const novo = comoP1(`INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","marcaReferencia","conservacaoConfirmadaEm","atualizadoEm") VALUES ('m1','p1','Detergente','L','MATERIAL',5000,1890,'SECO','Ypê',now(),now())`);
        expect(novo.ok, novo.aviso).toBe(true);
        expect(comoP1(`UPDATE "Insumo" SET "marcaReferencia" = ' Camil ' WHERE id = 'i2'`).aviso).toContain('Insumo_marcaReferencia_curta');
        expect(comoP1(`UPDATE "Insumo" SET "marcaReferencia" = '' WHERE id = 'i2'`).aviso).toContain('Insumo_marcaReferencia_curta');
        expect(comoP1(`UPDATE "Insumo" SET "marcaReferencia" = '${'x'.repeat(81)}' WHERE id = 'i2'`).aviso).toContain('Insumo_marcaReferencia_curta');
        expect(comoP1(`UPDATE "Insumo" SET "marcaReferencia" = 'Camil', "conservacaoConfirmadaEm" = now() WHERE id = 'i2'`).ok).toBe(true);
        if (perfil.rls) {
          // O outro parceiro não enxerga o material do primeiro.
          expect(psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "Insumo" WHERE tipo = 'MATERIAL'`)]).saida.split('\n').pop()).toBe('0');
        }

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
          // O conferidor acusa o CHECK da marca que ficar NOT VALID (e diz qual migration rodar).
          expect(psql(superuser, ['-c', `ALTER TABLE "Insumo" DROP CONSTRAINT "Insumo_marcaReferencia_curta"; ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_marcaReferencia_curta" CHECK ("marcaReferencia" IS NULL OR char_length("marcaReferencia") <= 80) NOT VALID`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/CHECK Insumo_marcaReferencia_curta ficou NOT VALID/);
          // E a coluna da confirmação que faltar.
          expect(psql(superuser, ['-c', `ALTER TABLE "Insumo" DROP COLUMN "conservacaoConfirmadaEm"`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/Insumo\.conservacaoConfirmadaEm NÃO existe/);
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
