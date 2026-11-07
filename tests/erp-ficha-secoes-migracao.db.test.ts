/** 3A: upgrade aditivo e barreiras SQL reais nos três perfis suportados. */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { executarPsqlDeTeste } from './erp-psql-apoio';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACAO = '20261120000000_erp_ficha_secoes';
const PASTA = join(process.cwd(), 'prisma', 'migrations');
const temPsql = spawnSync('psql', ['--version']).status === 0;
const perfis = [
  { nome: 'superusuário', papel: '', rls: true },
  { nome: 'dono não-superusuário com RLS forçada', papel: 'ff_dono', rls: true },
  { nome: 'dono não-superusuário sem RLS', papel: 'ff_semrls', rls: false },
] as const;

function urlDe(banco: string, papel = '') {
  const url = new URL(URL_TESTE!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
  url.pathname = `/${banco}`;
  url.search = '';
  if (papel) { url.username = papel; url.password = papel; }
  return url.toString();
}
const psql = executarPsqlDeTeste;
const papelExiste = (papel: string) => !papel || (!!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `SELECT count(*) FROM pg_roles WHERE rolname = '${papel}'`]).saida === '1');

describe.skipIf(!URL_TESTE || !temPsql)('3A · migration de seções de ficha (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const criados: string[] = [];

  afterAll(() => {
    for (const banco of criados) {
      const r = psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`]);
      expect(r.ok, r.aviso).toBe(true);
    }
  }, 360_000);

  for (const perfil of perfis) {
    it.skipIf(!papelExiste(perfil.papel))(`${perfil.nome}: preserva legado, confere FK tripla/check/RLS e denuncia proteção removida`, async () => {
      const banco = `ff_mig3a_${perfil.papel || 'su'}_${sufixo}`;
      const dono = urlDe(banco, perfil.papel), su = urlDe(banco);
      const criar = psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]);
      expect(criar.ok, criar.aviso).toBe(true);
      criados.push(banco);
      if (perfil.papel) expect(psql(su, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
      for (const m of readdirSync(PASTA).filter(n => /^\d{14}_/.test(n) && n < MIGRACAO).sort()) {
        const r = psql(dono, ['-f', join(PASTA, m, 'migration.sql')]);
        expect(r.ok, `${m}: ${r.aviso}`).toBe(true);
      }
      const executar = (sql: string) => {
        const r = psql(su, ['-c', sql]);
        expect(r.ok, r.aviso).toBe(true);
        return r.saida;
      };
      const noTenant = (parceiro: string, sql: string) => psql(dono, ['-c', perfil.rls
        ? `SELECT set_config('app.parceiro_id','${parceiro}',true),set_config('role','erp_tenant',true); ${sql}` : sql]);
      executar(`INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','Sintético 1','p1','ATIVO'),('p2','Sintético 2','p2','ATIVO');
        INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,"conteudoMilesimos","precoEmbalagemCentavos","atualizadoEm") VALUES ('i1','p1','Ingrediente','KG',1000,1777,now());
        INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento",descricao,"modoPreparo","passosPreparo","consumoImediato","fotoArquivo","fotoMime","fotoBytes","atualizadoEm") VALUES
          ('f1','p1','Prato legado','PRATO',1000,'UN','Descrição','Montar',ARRAY['Etapa original'],true,'0123456789abcdef0123456789abcdef.jpg','image/jpeg',777,now()),
          ('f2','p1','Preparo legado','PRE_PREPARO',1000,'KG','Molho','Misturar',ARRAY['Bater'],false,NULL,NULL,NULL,now()),
          ('f3','p2','Outro parceiro','PRATO',1000,'UN',NULL,NULL,ARRAY[]::text[],false,NULL,NULL,NULL,now());
        INSERT INTO "FichaItem"(id,"parceiroId","fichaId","insumoId","quantidadeMilesimos") VALUES ('fi1','p1','f1','i1',300),('fi2','p1','f2','i1',1000);
        INSERT INTO "ProdutoVenda"(id,"parceiroId","fichaId",nome) VALUES ('pv1','p1','f1','Prato legado');
        INSERT INTO "ProdutoCanal"(id,"parceiroId","produtoId",canal,"precoManualCentavos","margemAlvoBp","atualizadoEm") VALUES ('pc1','p1','pv1','LOJA',4999,6000,now());
        INSERT INTO "HistoricoAlteracao"(id,"parceiroId",entidade,"entidadeId",acao,depois,"autorNome") VALUES ('h1','p1','FichaTecnica','f1','CRIOU','{"nome":"Prato legado"}','Teste');`);
      const retrato = () => executar(`SELECT jsonb_build_object(
        'fichas',(SELECT jsonb_agg(to_jsonb(f)-'secaoId'-'subsecaoId' ORDER BY id) FROM "FichaTecnica" f),
        'itens',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM "FichaItem" i),
        'insumos',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM "Insumo" i),
        'produtos',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM "ProdutoVenda" p),
        'precos',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM "ProdutoCanal" p),
        'historico',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM "HistoricoAlteracao" h))::text`);
      const antes = retrato();
      const migrada = psql(dono, ['-f', join(PASTA, MIGRACAO, 'migration.sql')]);
      expect(migrada.ok, migrada.aviso).toBe(true);
      expect(migrada.aviso).not.toContain('WARNING');
      expect(retrato()).toBe(antes);
      expect(executar(`SELECT count(*) FROM "FichaTecnica" WHERE "secaoId" IS NOT NULL OR "subsecaoId" IS NOT NULL`)).toBe('0');
      expect(executar(`SELECT (SELECT count(*) FROM "SecaoFicha")+(SELECT count(*) FROM "SubsecaoFicha")`)).toBe('0');

      // Isolamento e árvore são barreiras do banco, não apenas validação do formulário.
      executar(`INSERT INTO "SecaoFicha"(id,"parceiroId",nome,"nomeChave","atualizadoEm") VALUES
        ('s1','p1','Pratos','pratos',now()),('s2','p1','Bebidas','bebidas',now()),('s3','p2','Pratos','pratos',now());
        INSERT INTO "SubsecaoFicha"(id,"parceiroId","secaoId",nome,"nomeChave","atualizadoEm") VALUES
        ('ss1','p1','s1','Quentes','quentes',now()),('ss2','p1','s2','Quentes','quentes',now()),('ss3','p2','s3','Quentes','quentes',now());`);
      expect(noTenant('p1', `UPDATE "FichaTecnica" SET "secaoId"='s1',"subsecaoId"='ss1' WHERE id='f1'`).ok).toBe(true);
      for (const sql of [
        `UPDATE "FichaTecnica" SET "secaoId"='s3',"subsecaoId"=NULL WHERE id='f1'`,
        `UPDATE "FichaTecnica" SET "secaoId"='s1',"subsecaoId"='ss2' WHERE id='f1'`,
        `UPDATE "FichaTecnica" SET "secaoId"='s1',"subsecaoId"='ss3' WHERE id='f1'`,
        `UPDATE "FichaTecnica" SET "secaoId"=NULL,"subsecaoId"='ss1' WHERE id='f1'`,
        `INSERT INTO "SubsecaoFicha"(id,"parceiroId","secaoId",nome,"nomeChave","atualizadoEm") VALUES ('furo','p1','s3','Filho','filho',now())`,
        `UPDATE "SubsecaoFicha" SET "secaoId"='s2' WHERE id='ss1'`,
        `UPDATE "SecaoFicha" SET "parceiroId"='p2' WHERE id='s2'`,
        `DELETE FROM "SecaoFicha" WHERE id='s1'`,
        `DELETE FROM "SubsecaoFicha" WHERE id='ss1'`,
        `INSERT INTO "SecaoFicha"(id,"parceiroId",nome,"nomeChave","atualizadoEm") VALUES ('vazia','p1','','',now())`,
      ]) expect(noTenant('p1', sql).ok, sql).toBe(false);
      expect(executar(`SELECT "secaoId"||':'||"subsecaoId" FROM "FichaTecnica" WHERE id='f1'`)).toBe('s1:ss1');
      expect(executar(`SELECT "precoManualCentavos" FROM "ProdutoCanal" WHERE id='pc1'`)).toBe('4999');
      executar(`INSERT INTO "SecaoFicha"(id,"parceiroId",nome,"nomeChave","atualizadoEm") VALUES ('normalizada','p1','  Seção   sintética  ','chave-forjada',now())`);
      expect(executar(`SELECT "nomeChave"="erp_chave_nome_classificacao_ficha"(nome) FROM "SecaoFicha" WHERE id='normalizada'`)).toBe('t');
      // Unicidade normalizada também para registros arquivados, mas seção e parceiro distinguem filhos.
      executar(`UPDATE "SecaoFicha" SET ativa=false WHERE id='s2'`);
      expect(noTenant('p1', `INSERT INTO "SecaoFicha"(id,"parceiroId",nome,"nomeChave","atualizadoEm") VALUES ('duplicada','p1','BEBÍDAS','bebidas',now())`).ok).toBe(false);
      for (const tabela of ['SecaoFicha', 'SubsecaoFicha']) {
        expect(executar(`SELECT relrowsecurity||':'||relforcerowsecurity FROM pg_class WHERE oid='"${tabela}"'::regclass`)).toBe(`${perfil.rls}:${perfil.rls}`);
        if (perfil.rls) {
          const vazia = psql(dono, ['-c', `SET ROLE erp_tenant; SELECT count(*) FROM "${tabela}"`]);
          expect(vazia.ok, vazia.aviso).toBe(true);
          expect(vazia.saida.split('\n').pop()).toBe('0');
          expect(noTenant('p2', `SELECT count(*) FROM "${tabela}" WHERE "parceiroId"='p1'`).saida.split('\n').pop()).toBe('0');
          expect(noTenant('p2', `UPDATE "${tabela}" SET nome='Furo' WHERE "parceiroId"='p1'`).ok).toBe(true);
          expect(executar(`SELECT count(*) FROM "${tabela}" WHERE nome='Furo'`)).toBe('0');
        }
      }
      // Confere as definições, não só os nomes: FK da subseção inclui o pai e usa RESTRICT nos dois sentidos.
      const fks = executar(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f' AND conrelid='"FichaTecnica"'::regclass ORDER BY conname`);
      expect(fks).toMatch(/FOREIGN KEY \("parceiroId", "secaoId", "subsecaoId"\) REFERENCES "SubsecaoFicha"\("parceiroId", "secaoId", id\) ON UPDATE RESTRICT ON DELETE RESTRICT/);
      // Acervo sintético grande: o plano usa o índice novo sem desabilitar scans sequenciais.
      executar(`INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento","secaoId","atualizadoEm")
        SELECT 'acervo-'||n,'p1','Acervo sintético '||n,'PRATO',1000,'UN',CASE WHEN n=4500 THEN 's2' ELSE 's1' END,now() FROM generate_series(1,4500) n;
        ANALYZE "FichaTecnica";`);
      const plano = executar(`EXPLAIN (FORMAT JSON) SELECT id FROM "FichaTecnica" WHERE "parceiroId"='p1' AND "secaoId"='s2'`);
      expect(plano).toMatch(/FichaTecnica_parceiroId_secaoId(?:_subsecaoId)?_idx/);
      const db = new PrismaClient({ datasources: { db: { url: su } } });
      try {
        expect(await conferirMigracao(db)).toEqual([]);
        for (const [tipo, tabela, restaurar] of [
          ['f', 'FichaTecnica', ''], ['c', 'FichaTecnica', ' NOT VALID'],
        ] as const) {
          const alvo = executar(`SELECT conname||'|'||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='"${tabela}"'::regclass AND contype='${tipo}' AND (conname ILIKE '%secao%' OR conname='FichaTecnica_classificacao_par_completo') ORDER BY conname LIMIT 1`);
          expect(alvo).not.toBe('');
          const separador = alvo.indexOf('|'), nome = alvo.slice(0, separador), definicao = alvo.slice(separador + 1);
          executar(`ALTER TABLE "${tabela}" DROP CONSTRAINT "${nome}"`);
          if (restaurar) executar(`ALTER TABLE "${tabela}" ADD CONSTRAINT "${nome}" ${definicao}${restaurar}`);
          expect((await conferirMigracao(db)).join('\n')).toContain(nome);
          if (restaurar) executar(`ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}"`);
          else executar(`ALTER TABLE "${tabela}" ADD CONSTRAINT "${nome}" ${definicao}`);
          if (tipo === 'c') {
            executar(`ALTER TABLE "${tabela}" DROP CONSTRAINT "${nome}"; ALTER TABLE "${tabela}" ADD CONSTRAINT "${nome}" CHECK (true)`);
            expect((await conferirMigracao(db)).join('\n')).toContain(nome);
            executar(`ALTER TABLE "${tabela}" DROP CONSTRAINT "${nome}"; ALTER TABLE "${tabela}" ADD CONSTRAINT "${nome}" ${definicao}`);
          }
        }
        executar(`DROP TRIGGER "SecaoFicha_parceiro_imutavel" ON "SecaoFicha"`);
        expect((await conferirMigracao(db)).join('\n')).toContain('SecaoFicha_parceiro_imutavel');
        executar(`CREATE TRIGGER "SecaoFicha_parceiro_imutavel" BEFORE UPDATE ON "SecaoFicha" FOR EACH ROW EXECUTE FUNCTION erp_parceiro_imutavel()`);
        executar(`DROP INDEX "FichaTecnica_parceiroId_secaoId_subsecaoId_idx"`);
        expect((await conferirMigracao(db)).join('\n')).toContain('FichaTecnica_parceiroId_secaoId_subsecaoId_idx');
        executar(`CREATE INDEX "FichaTecnica_parceiroId_secaoId_subsecaoId_idx" ON "FichaTecnica"("parceiroId","secaoId","subsecaoId") WHERE "subsecaoId" IS NOT NULL`);
        expect((await conferirMigracao(db)).join('\n')).toContain('FichaTecnica_parceiroId_secaoId_subsecaoId_idx');
        executar(`DROP INDEX "FichaTecnica_parceiroId_secaoId_subsecaoId_idx"`);
        executar(`CREATE INDEX "FichaTecnica_parceiroId_secaoId_subsecaoId_idx" ON "FichaTecnica"("parceiroId","secaoId","subsecaoId")`);
        if (perfil.rls) {
          executar(`DROP POLICY "SubsecaoFicha_do_parceiro" ON "SubsecaoFicha"`);
          expect((await conferirMigracao(db)).join('\n')).toContain('SubsecaoFicha');
        }
      } finally { await db.$disconnect(); }
    });
  }
});
