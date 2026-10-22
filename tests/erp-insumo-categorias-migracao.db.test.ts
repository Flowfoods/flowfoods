/**
 * ERP I.1a · a migration `20261101000000_erp_insumo_categorias` com DADO ANTIGO, como superusuário e como DONO
 * NÃO-SUPERUSUÁRIO (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a 3.3), planta o que já existia (dois parceiros, insumos
 * com nomes que só diferem por caixa, um pré-preparo, nota, saldo e movimento) e aplica a migration:
 *  - nada some, não avisa (nenhum WARNING) e nem os nomes parecidos quebram o índice de nome;
 *  - todo insumo antigo fica com a categoria NULA (a migration não classifica nem semeia nada) e o resto idêntico;
 *  - a tabela nova nasce com os CHECKs validados, os índices, o gatilho da categoria do sistema e (com RLS) a RLS forçada;
 *  - depois da migration, pelo papel do tenant: a categoria entra, a FK composta recusa a de outro parceiro, a chave de envio
 *    é única por parceiro, o outro parceiro não enxerga, o insumo antigo aceita categoria; o conferidor pós-deploy não lista
 *    pendência — e lista quando falta o gatilho ou a RLS;
 *  - a `20261101010000_erp_catalogo_v3` (só dado): o perfil "copiado do Dono" da v2 ganha `insumos.categorias`; o parcial não;
 *    rodar de novo não muda nada.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-insumo-categorias-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';
import { TODAS_AS_PERMISSOES } from '../src/lib/erp/permissoes';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_I_1A = '20261101000000_erp_insumo_categorias';
const CATALOGO_V3 = '20261101010000_erp_catalogo_v3';
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP I.1a · migration das categorias com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('com dado antigo: nada some, sem aviso; insumo antigo fica sem categoria e igual; tabela com CHECKs, índices, gatilho e (com RLS) a RLS forçada; funciona pelo papel do tenant; o conferidor não acha pendência', async () => {
        const banco = `ff_migi1a_${rotulo}_${sufixo}`;
        const dono = urlDe(banco, perfil.papel);
        const superuser = urlDe(banco);
        expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
        criados.push(banco);
        if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
        for (const m of antes(DA_I_1A)) {
          const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
          expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
        }
        const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'Insumo'`]).saida === 't';
        expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
        const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);

        // O que já existia: dois parceiros, insumos (com nomes que só diferem por caixa e por acento), um pré-preparo e o histórico.
        expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
        const plantado = psql(dono, [
          '-c',
          noContexto(
            'p1',
            `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1');
             INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","atualizadoEm") VALUES
               ('i1','p1','Cebola','KG','INGREDIENTE',5000,8990,'SECO',now()),
               ('i2','p1','cebola','KG','INGREDIENTE',5000,8990,'SECO',now()),
               ('i3','p1','Pão brioche','UN','INGREDIENTE',12,1800,'SECO',now()),
               ('i4','p1','Pao Brioche','UN','INGREDIENTE',12,1800,'SECO',now()),
               ('i5','p1','Molho','KG','PRE_PREPARO',1000,0,'REFRIGERADO',now());
             INSERT INTO "SaldoEstoque"(id,"parceiroId","lojaId","insumoId","quantidadeMilesimos","valorCentavos","atualizadoEm") VALUES ('s1','p1','l1','i1',3000,5000,now());
             INSERT INTO "HistoricoAlteracao"(id,"parceiroId",entidade,"entidadeId",acao,depois,"autorNome") VALUES ('h1','p1','Insumo','i1','CRIOU','{"nome":"Cebola"}','Marina');`,
          ),
        ]);
        expect(plantado.ok, plantado.aviso).toBe(true);
        expect(psql(dono, ['-c', noContexto('p2', `INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,"conteudoMilesimos","precoEmbalagemCentavos","atualizadoEm") VALUES ('j1','p2','Cebola','KG',1000,500,now())`)]).ok).toBe(true);
        // Perfis próprios salvos no catálogo v2 (fora do tenant: sem RLS): o "copiado do Dono" (todas as da v2), um parcial e um já na v3.
        const V2 = TODAS_AS_PERMISSOES.filter((p) => p !== 'insumos.categorias');
        const arr = (l: readonly string[]) => `ARRAY[${l.map((x) => `'${x}'`).join(',')}]::text[]`;
        expect(
          psql(dono, [
            '-c',
            `INSERT INTO "PerfilAcesso"(id,"parceiroId",nome,base,permissoes,"catalogoVersao","atualizadoEm") VALUES
               ('pa1','p1','Sócio','DONO',${arr(V2)},2,now()),
               ('pa2','p1','Sócio sem preços','DONO',${arr(V2.filter((p) => p !== 'precos.editar'))},2,now()),
               ('pa3','p2','Sócio v3','DONO',${arr(V2)},3,now());`,
          ]).ok,
        ).toBe(true);
        const retrato = () => psql(superuser, ['-c', `SELECT string_agg(id || ':' || nome || ':' || unidade || ':' || tipo || ':' || "conteudoMilesimos" || ':' || "precoEmbalagemCentavos" || ':' || conservacao || ':' || ativo, ',' ORDER BY id) FROM "Insumo"`]).saida;
        const conta = () => psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "Insumo")::text || '/' || (SELECT count(*) FROM "SaldoEstoque")::text || '/' || (SELECT count(*) FROM "HistoricoAlteracao")::text`]).saida;
        const retratoAntes = retrato();
        expect(conta()).toBe('6/1/1');

        const r = psql(dono, ['-f', join(MIGRACOES, DA_I_1A, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        // Nenhum WARNING: nome parecido não é violação (o índice de nome não mudou) e a coluna nova nasce toda nula.
        expect(r.aviso).not.toContain('WARNING');
        expect(conta()).toBe('6/1/1');
        expect(retrato()).toBe(retratoAntes);
        // A migration não classifica nem semeia: toda categoria é nula e a tabela nova está vazia.
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "Insumo" WHERE "categoriaId" IS NOT NULL OR "classificadoPor" IS NOT NULL OR "chaveEnvio" IS NOT NULL OR "hashEnvio" IS NOT NULL OR "classificacaoLote" IS NOT NULL`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "CategoriaInsumo"`]).saida).toBe('0');

        // A tabela, os CHECKs (todos validados), os índices, a FK composta, o gatilho e a RLS.
        const tabela = psql(superuser, ['-c', `SELECT relrowsecurity || ':' || relforcerowsecurity FROM pg_class WHERE relname = 'CategoriaInsumo' AND relkind = 'r'`]).saida;
        expect(tabela).toBe(`${perfil.rls}:${perfil.rls}`);
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_policies WHERE tablename = 'CategoriaInsumo' AND policyname = 'CategoriaInsumo_do_parceiro'`]).saida).toBe(perfil.rls ? '1' : '0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND convalidated AND conname LIKE 'CategoriaInsumo\\_%'`]).saida).toBe('6');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND convalidated AND conname IN ('Insumo_classificadoPor_valido','Insumo_classificacaoMotivo_curto','Insumo_classificacao_so_com_categoria','Insumo_classificacaoLote_da_migracao','Insumo_chaveEnvio_completa')`]).saida).toBe('5');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname IN ('CategoriaInsumo_parceiroId_id_key','CategoriaInsumo_parceiroId_nome_key','CategoriaInsumo_parceiroId_chave_key','CategoriaInsumo_parceiroId_ordem_idx','Insumo_parceiroId_chaveEnvio_key','Insumo_parceiroId_categoriaId_idx')`]).saida).toBe('6');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND conname IN ('Insumo_parceiroId_categoriaId_fkey','CategoriaInsumo_parceiroId_fkey')`]).saida).toBe('2');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('CategoriaInsumo_parceiro_imutavel','CategoriaInsumo_sistema_protegida')`]).saida).toBe('2');

        // Pelo papel do tenant (no contexto de p1): a categoria entra, o insumo ANTIGO aceita a categoria, e as regras valem.
        const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
        const semear = comoP1(`INSERT INTO "CategoriaInsumo"(id,"parceiroId",chave,nome,ordem,sistema,"atualizadoEm") VALUES
            ('c1','p1','MERCEARIA','Mercearias e secos',30,false,now()),('co','p1','OUTROS','Outros / a classificar',100,true,now());`);
        expect(semear.ok, semear.aviso).toBe(true);
        expect(comoP1(`UPDATE "Insumo" SET "categoriaId" = 'c1', "classificadoPor" = 'MIGRACAO', "classificacaoLote" = 'lote-20261101-0900-abcd', "classificadoEm" = now() WHERE id = 'i3'`).ok).toBe(true);
        // Nome repetido, a chave estável repetida, nome fora da faixa, ordem fora da faixa: recusados.
        expect(comoP1(`INSERT INTO "CategoriaInsumo"(id,"parceiroId",nome,"atualizadoEm") VALUES ('cx','p1','Mercearias e secos',now())`).aviso).toContain('CategoriaInsumo_parceiroId_nome_key');
        expect(comoP1(`INSERT INTO "CategoriaInsumo"(id,"parceiroId",chave,nome,"atualizadoEm") VALUES ('cx','p1','MERCEARIA','Outra',now())`).aviso).toContain('CategoriaInsumo_parceiroId_chave_key');
        expect(comoP1(`INSERT INTO "CategoriaInsumo"(id,"parceiroId",nome,ordem,"atualizadoEm") VALUES ('cx','p1','Fora',1000,now())`).aviso).toContain('CategoriaInsumo_ordem_faixa');
        expect(comoP1(`INSERT INTO "CategoriaInsumo"(id,"parceiroId",nome,"atualizadoEm") VALUES ('cx','p1',' com espaço ',now())`).aviso).toContain('CategoriaInsumo_nome_curto');
        // A do sistema não se renomeia, não se desativa e não se exclui.
        expect(comoP1(`UPDATE "CategoriaInsumo" SET nome = 'Pendentes' WHERE id = 'co'`).aviso).toContain('CategoriaInsumo_sistema_protegida');
        expect(comoP1(`DELETE FROM "CategoriaInsumo" WHERE id = 'co'`).aviso).toContain('CategoriaInsumo_sistema_protegida');
        // A categoria com insumo não se exclui (FK Restrict); a de outro parceiro não serve (FK composta).
        expect(comoP1(`DELETE FROM "CategoriaInsumo" WHERE id = 'c1'`).ok).toBe(false);
        expect(comoP1(`INSERT INTO "CategoriaInsumo"(id,"parceiroId",nome,"atualizadoEm") VALUES ('cb','p1','Para outro',now())`).ok).toBe(true);
        expect(psql(dono, ['-c', noContexto('p2', `UPDATE "Insumo" SET "categoriaId" = 'cb' WHERE id = 'j1'`)]).ok).toBe(false);
        // A chave de envio é única por parceiro e vem com a impressão; o mesmo texto em outro parceiro vale.
        expect(comoP1(`UPDATE "Insumo" SET "chaveEnvio" = 'envio-12345678', "hashEnvio" = 'h1' WHERE id = 'i1'`).ok).toBe(true);
        expect(comoP1(`UPDATE "Insumo" SET "chaveEnvio" = 'envio-12345678', "hashEnvio" = 'h2' WHERE id = 'i2'`).aviso).toContain('Insumo_parceiroId_chaveEnvio_key');
        expect(psql(dono, ['-c', noContexto('p2', `UPDATE "Insumo" SET "chaveEnvio" = 'envio-12345678', "hashEnvio" = 'h2' WHERE id = 'j1'`)]).ok).toBe(true);
        expect(comoP1(`UPDATE "Insumo" SET "classificadoPor" = 'MANUAL' WHERE id = 'i4'`).aviso).toContain('Insumo_classificacao_so_com_categoria');
        // O dono da linha é imutável.
        expect(comoP1(`UPDATE "CategoriaInsumo" SET "parceiroId" = 'p2' WHERE id = 'c1'`).ok).toBe(false);
        if (perfil.rls) {
          // O outro parceiro não enxerga, não muda e não apaga.
          expect(psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "CategoriaInsumo"`)]).saida.split('\n').pop()).toBe('0');
          psql(dono, ['-c', noContexto('p2', `UPDATE "CategoriaInsumo" SET nome = 'X'; DELETE FROM "CategoriaInsumo"`)]);
          expect(psql(superuser, ['-c', `SELECT string_agg(id || ':' || nome, ',' ORDER BY id) FROM "CategoriaInsumo"`]).saida).toBe('c1:Mercearias e secos,cb:Para outro,co:Outros / a classificar');
        }

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
          // O conferidor acusa o gatilho que faltar (e diz qual migration rodar).
          expect(psql(superuser, ['-c', `DROP TRIGGER "CategoriaInsumo_sistema_protegida" ON "CategoriaInsumo"`]).ok).toBe(true);
          expect(await conferirMigracao(db)).toEqual([expect.stringMatching(/Gatilho CategoriaInsumo_sistema_protegida NÃO existe: a migration 20261101000000_erp_insumo_categorias/)]);
          // E o CHECK que ficar NOT VALID.
          expect(psql(superuser, ['-c', `ALTER TABLE "Insumo" DROP CONSTRAINT "Insumo_chaveEnvio_completa"; ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_chaveEnvio_completa" CHECK ("chaveEnvio" IS NULL OR "hashEnvio" IS NOT NULL) NOT VALID`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/CHECK Insumo_chaveEnvio_completa ficou NOT VALID/);
          if (perfil.rls) {
            expect(psql(superuser, ['-c', `ALTER TABLE "CategoriaInsumo" NO FORCE ROW LEVEL SECURITY`]).ok).toBe(true);
            expect((await conferirMigracao(db)).join('\n')).toMatch(/Tabela CategoriaInsumo sem RLS forçada/);
          }
        } finally {
          await db.$disconnect();
        }

        // O catálogo v3 (só dado, fora do tenant): o "copiado do Dono" da v2 ganha a nova; o parcial e o já-v3 não; rodar de novo não muda.
        const lerPerfis = () =>
          psql(superuser, ['-c', `SELECT id || ':' || "catalogoVersao" || ':' || ('insumos.categorias' = ANY(permissoes))::text || ':' || cardinality(permissoes) FROM "PerfilAcesso" ORDER BY id`]).saida.split('\n');
        for (let vez = 0; vez < 2; vez++) {
          const c = psql(dono, ['-f', join(MIGRACOES, CATALOGO_V3, 'migration.sql')]);
          expect(c.ok, c.aviso).toBe(true);
          expect(lerPerfis()).toEqual([`pa1:3:true:${TODAS_AS_PERMISSOES.length}`, `pa2:2:false:${V2.length - 1}`, `pa3:3:false:${V2.length}`]);
        }
      });
    });
  }
});
