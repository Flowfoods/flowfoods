/**
 * ERP I.2a · a migration `20261103000000_erp_cmv_categorias` com DADO ANTIGO, como superusuário e como DONO NÃO-SUPERUSUÁRIO (com RLS
 * FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a I.1b), planta o que já existia (dois parceiros, loja, categoria,
 * insumos, uma abertura de estoque e um fechamento já fechados, saldo, nota e histórico) e aplica a migration:
 *  - nada some, não avisa (nenhum WARNING) e NADA do que já estava gravado muda; a contagem de antes fica com `retratoGravadoEm` nulo
 *    ("antes da I.2": nunca reconstruída) e nenhuma linha nasce nas tabelas novas;
 *  - as quatro tabelas existem, o CHECK nasce validado, a RLS (quando o perfil instala) vale e as FKs são compostas;
 *  - depois da migration, pelo papel do tenant: meta por categoria, uso por loja e retrato por insumo funcionam; o outro parceiro não
 *    enxerga; o retrato só se inclui e a soma confere; categoria com meta não se exclui; o conjunto do passado não muda;
 *  - o conferidor pós-deploy não lista pendência — e lista o CHECK que ficar NOT VALID, o gatilho e a RLS que faltarem.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-cmv-categorias-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const ESTA = '20261103000000_erp_cmv_categorias';
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

describe.skipIf(!URL_TESTE || !temPsql)('ERP I.2a · migration das metas por categoria e do retrato por insumo com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('com dado antigo: nada some nem muda, sem aviso; contagem antiga sem retrato; tabelas novas vazias e funcionando pelo papel do tenant; o conferidor não acha pendência', async () => {
        const banco = `ff_migi2a_${rotulo}_${sufixo}`;
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

        // O que já existia: dois parceiros; uma loja, a categoria, insumos, uma abertura e um fechamento JÁ fechados (sem retrato por insumo), saldo e histórico.
        expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
        const plantado = psql(dono, [
          '-c',
          noContexto(
            'p1',
            `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1'), ('l2','p1','Loja 2','l2');
             INSERT INTO "CategoriaInsumo"(id,"parceiroId",chave,nome,ordem,sistema,"atualizadoEm") VALUES ('cp','p1','PROTEINA','Proteína',10,false,now()), ('co','p1','OUTROS','Outros / a classificar',100,true,now());
             INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","categoriaId","atualizadoEm") VALUES
               ('i1','p1','Coxa de frango','KG','INGREDIENTE',5000,2500,'SECO','cp',now()),
               ('i2','p1','Farinha de trigo','KG','INGREDIENTE',5000,2500,'SECO',NULL,now());
             INSERT INTO "SaldoEstoque"(id,"parceiroId","lojaId","insumoId","quantidadeMilesimos","valorCentavos","atualizadoEm") VALUES ('s1','p1','l1','i1',3000,1500,now());
             INSERT INTO "PeriodoApuracao"(id,"parceiroId",nome,inicio,fim) VALUES ('per1','p1','Setembro de 2026','2026-09-01','2026-09-30');
             INSERT INTO "Contagem"(id,"parceiroId","lojaId",tipo,status,desfecho,"referenciaEm","fechadaEm","valorTotalCentavos","itensSemPreco") VALUES
               ('c1','p1','l1','ABERTURA','FECHADA','APLICADA','2026-09-01','2026-09-01 12:00',1500,0);
             INSERT INTO "Contagem"(id,"parceiroId","lojaId","periodoId",tipo,status,desfecho,"referenciaEm","fechadaEm","valorTotalCentavos","itensSemPreco") VALUES
               ('c2','p1','l1','per1','FECHAMENTO','FECHADA','APLICADA','2026-09-30','2026-09-30 21:00',1500,0);
             INSERT INTO "Contagem"(id,"parceiroId","lojaId",tipo,status,"referenciaEm") VALUES ('c3','p1','l2','ABERTURA','ABERTA','2026-10-01');
             INSERT INTO "HistoricoAlteracao"(id,"parceiroId",entidade,"entidadeId",acao,depois,"autorNome") VALUES ('h1','p1','Insumo','i1','CRIOU','{"nome":"Coxa de frango"}','Marina');`,
          ),
        ]);
        expect(plantado.ok, plantado.aviso).toBe(true);
        expect(psql(dono, ['-c', noContexto('p2', `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l9','p2','Loja de P2','l9'); INSERT INTO "CategoriaInsumo"(id,"parceiroId",chave,nome,ordem,sistema,"atualizadoEm") VALUES ('cp2','p2','PROTEINA','Proteína',10,false,now())`)]).ok).toBe(true);
        const retratoDe = () =>
          psql(superuser, ['-c', `SELECT string_agg(id || ':' || tipo || ':' || status || ':' || coalesce("valorTotalCentavos"::text,'-') || ':' || coalesce("itensSemPreco"::text,'-'), ',' ORDER BY id) FROM "Contagem"`]).saida;
        const contas = () =>
          psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "Contagem")::text || '/' || (SELECT count(*) FROM "Insumo")::text || '/' || (SELECT count(*) FROM "SaldoEstoque")::text || '/' || (SELECT count(*) FROM "HistoricoAlteracao")::text || '/' || (SELECT count(*) FROM "NotaEntrada")::text || '/' || (SELECT count(*) FROM "MovimentoEstoque")::text || '/' || (SELECT count(*) FROM "DreMeta")::text`]).saida;
        const antesRetrato = retratoDe();
        expect(contas()).toBe('3/2/1/1/0/0/0');

        const r = psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');

        // Nada do que existia mudou, e a contagem de antes da I.2 fica SEM retrato (nula = "antes da I.2"): a migration não reconstrói.
        expect(contas()).toBe('3/2/1/1/0/0/0');
        expect(retratoDe()).toBe(antesRetrato);
        expect(psql(superuser, ['-c', `SELECT count(*) FROM "Contagem" WHERE "retratoGravadoEm" IS NOT NULL`]).saida).toBe('0');
        for (const t of ['ContagemRetratoItem', 'CategoriaNaLoja', 'MetaCmvConjunto', 'MetaCmvCategoria']) expect(psql(superuser, ['-c', `SELECT count(*) FROM "${t}"`]).saida, t).toBe('0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE conname = 'Contagem_retrato_so_na_fechada' AND convalidated`]).saida).toBe('1');
        // As FKs são compostas com o parceiro (a categoria da meta é RESTRICT).
        expect(psql(superuser, ['-c', `SELECT confdeltype FROM pg_constraint WHERE conname = 'MetaCmvCategoria_parceiroId_categoriaId_fkey'`]).saida).toBe('r');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND conname LIKE 'MetaCmv%' AND array_length(conkey, 1) = 2`]).saida).toBe('3');
        const politicas = psql(superuser, ['-c', `SELECT count(*) FROM pg_policies WHERE policyname IN ('ContagemRetratoItem_do_parceiro','CategoriaNaLoja_do_parceiro','MetaCmvConjunto_do_parceiro','MetaCmvCategoria_do_parceiro')`]).saida;
        expect(politicas).toBe(perfil.rls ? '4' : '0');

        // Pelo papel do tenant (ou o dono, sem RLS): meta, uso por loja e retrato funcionam.
        const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
        const metas = comoP1(`INSERT INTO "MetaCmvConjunto"(id,"parceiroId","lojaId","vigenteDesde","criadoPorNome") VALUES ('k1','p1',NULL,'2026-09-01','Marina');
          INSERT INTO "MetaCmvCategoria"(id,"parceiroId","conjuntoId","categoriaId","percentualBp") VALUES ('mk1','p1','k1','cp',1100);
          INSERT INTO "CategoriaNaLoja"(id,"parceiroId","lojaId","categoriaId",usa) VALUES ('u1','p1','l2','cp',false);`);
        expect(metas.ok, metas.aviso).toBe(true);
        // O retrato entra na contagem ABERTA (a abertura da l2) e a soma confere ao centavo; fechar com outro valor é recusado.
        const retrato = comoP1(`INSERT INTO "ContagemRetratoItem"(id,"parceiroId","contagemId","insumoId","categoriaIdNaHora","tipoNaHora","quantidadeMilesimos","valorCentavos") VALUES ('r1','p1','c3','i1','cp','INGREDIENTE',2000,1000), ('r2','p1','c3','i2',NULL,'INGREDIENTE',1000,NULL);`);
        expect(retrato.ok, retrato.aviso).toBe(true);
        expect(comoP1(`UPDATE "Contagem" SET status = 'FECHADA', desfecho = 'APLICADA', "fechadaEm" = now(), "valorTotalCentavos" = 999, "retratoGravadoEm" = now() WHERE id = 'c3'`).aviso).toContain('Contagem_retrato_confere');
        const fecha = comoP1(`UPDATE "Contagem" SET status = 'FECHADA', desfecho = 'APLICADA', "fechadaEm" = now(), "valorTotalCentavos" = 1000, "retratoGravadoEm" = now() WHERE id = 'c3'`);
        expect(fecha.ok, fecha.aviso).toBe(true);
        // O retrato só se inclui; a contagem antiga (c1) não aceita retrato depois de fechada.
        expect(comoP1(`UPDATE "ContagemRetratoItem" SET "valorCentavos" = 1 WHERE id = 'r1'`).aviso).toMatch(/só se inclui|permission denied/);
        expect(comoP1(`INSERT INTO "ContagemRetratoItem"(id,"parceiroId","contagemId","insumoId","tipoNaHora","quantidadeMilesimos","valorCentavos") VALUES ('r9','p1','c1','i1','INGREDIENTE',1000,1)`).aviso).toContain('ContagemRetratoItem_da_contagem_aberta');
        // Meta fora de 0 a 100 %, categoria com meta que não se exclui (nem por SQL) e conjunto do passado que não muda.
        expect(comoP1(`UPDATE "MetaCmvCategoria" SET "percentualBp" = 10001 WHERE id = 'mk1'`).aviso).toContain('MetaCmvCategoria_percentual_faixa');
        expect(comoP1(`DELETE FROM "CategoriaInsumo" WHERE id = 'cp'`).aviso).toMatch(/MetaCmvCategoria_parceiroId_categoriaId_fkey|foreign key/);
        expect(comoP1(`INSERT INTO "MetaCmvConjunto"(id,"parceiroId","lojaId","vigenteDesde","criadoPorNome") VALUES ('k2','p1',NULL,'2026-10-01','Marina')`).ok).toBe(true);
        expect(comoP1(`UPDATE "MetaCmvCategoria" SET "percentualBp" = 1000 WHERE id = 'mk1'`).aviso).toContain('MetaCmvCategoria_do_conjunto_novo');
        if (perfil.rls) {
          // O outro parceiro não enxerga nada disso e não consegue ligar a categoria de um à loja do outro.
          expect(psql(dono, ['-c', noContexto('p2', `SELECT (SELECT count(*) FROM "MetaCmvConjunto") || '/' || (SELECT count(*) FROM "ContagemRetratoItem") || '/' || (SELECT count(*) FROM "CategoriaNaLoja")`)]).saida.split('\n').pop()).toBe('0/0/0');
          expect(psql(dono, ['-c', noContexto('p2', `INSERT INTO "CategoriaNaLoja"(id,"parceiroId","lojaId","categoriaId") VALUES ('x','p2','l1','cp2')`)]).aviso).toMatch(/foreign key|violates/);
        }

        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
          // O conferidor acusa o CHECK que ficar NOT VALID, o gatilho que faltar e a RLS que faltar.
          expect(psql(superuser, ['-c', `ALTER TABLE "Contagem" DROP CONSTRAINT "Contagem_retrato_so_na_fechada"; ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_retrato_so_na_fechada" CHECK ("retratoGravadoEm" IS NULL OR "status" = 'FECHADA') NOT VALID`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/CHECK Contagem_retrato_so_na_fechada ficou NOT VALID/);
          expect(psql(superuser, ['-c', `DROP TRIGGER "Contagem_retrato_confere" ON "Contagem"`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/Gatilho Contagem_retrato_confere NÃO existe/);
          if (perfil.rls) {
            expect(psql(superuser, ['-c', `ALTER TABLE "MetaCmvCategoria" NO FORCE ROW LEVEL SECURITY`]).ok).toBe(true);
            expect((await conferirMigracao(db)).join('\n')).toMatch(/Tabela MetaCmvCategoria sem RLS forçada/);
          }
          expect(psql(superuser, ['-c', `DROP INDEX "MetaCmvConjunto_parceiroId_lojaId_vigenteDesde_key"`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/Índice MetaCmvConjunto_parceiroId_lojaId_vigenteDesde_key NÃO existe/);
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
