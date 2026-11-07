/** 3C: identidade durável da criação; nenhum backfill em receita, preço ou foto. */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { executarPsqlDeTeste as psql } from './erp-psql-apoio';
import { conferirEnvioDaFicha, conferirMigracao, CHECK_DO_ENVIO_DA_FICHA } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACAO = '20261122000000_erp_ficha_envio';
const PASTA = join(process.cwd(), 'prisma', 'migrations');
const temPsql = spawnSync('psql', ['--version']).status === 0;
const perfis = [{ nome: 'superusuário', papel: '', rls: true }, { nome: 'dono com RLS', papel: 'ff_dono', rls: true }, { nome: 'dono sem RLS', papel: 'ff_semrls', rls: false }];
function urlDe(banco: string, papel = '') {
  const url = new URL(URL_TESTE!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Banco local obrigatório.');
  url.pathname = `/${banco}`; url.search = '';
  if (papel) { url.username = papel; url.password = papel; }
  return url.toString();
}
const papelExiste = (papel: string) => !papel || (!!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `SELECT count(*) FROM pg_roles WHERE rolname='${papel}'`]).saida === '1');

describe.skipIf(!URL_TESTE || !temPsql)('3C · migration da identidade de envio (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = crypto.randomUUID().replaceAll('-', '').slice(0, 8), criados: string[] = [];
  afterAll(() => {
    for (const banco of criados) { const r = psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`]); expect(r.ok, r.aviso).toBe(true); }
  }, 360_000);
  for (const perfil of perfis) it.skipIf(!papelExiste(perfil.papel))(`${perfil.nome}: legado intacto, par íntegro, unicidade tenant e identidade imutável`, async () => {
    const banco = `ff_mig3c_${perfil.papel || 'su'}_${sufixo}`, su = urlDe(banco), dono = urlDe(banco, perfil.papel);
    const criado = psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]);
    expect(criado.ok, criado.aviso).toBe(true); criados.push(banco);
    if (perfil.papel) expect(psql(su, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
    for (const m of readdirSync(PASTA).filter(n => /^\d{14}_/.test(n) && n < MIGRACAO).sort()) {
      const r = psql(dono, ['-f', join(PASTA, m, 'migration.sql')]); expect(r.ok, `${m}: ${r.aviso}`).toBe(true);
    }
    const sql = (s: string) => { const r = psql(su, ['-c', s]); expect(r.ok, r.aviso).toBe(true); return r.saida; };
    const tenant = (p: string, s: string) => psql(dono, ['-c', perfil.rls ? `SELECT set_config('app.parceiro_id','${p}',true),set_config('role','erp_tenant',true); ${s}` : s]);
    sql(`INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','Teste 3C','p1','ATIVO'),('p2','Outro 3C','p2','ATIVO');
      INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,"conteudoMilesimos","precoEmbalagemCentavos","atualizadoEm") VALUES ('i1','p1','Legado','UN',1000,420,now());
      INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento","passosPreparo","fotoArquivo","fotoMime","fotoBytes","atualizadoEm") VALUES ('f1','p1','Receita legada','PRATO',1000,'UN',ARRAY['Etapa original'],'${'0'.repeat(32)}.jpg','image/jpeg',100,now());
      INSERT INTO "FichaItem"(id,"parceiroId","fichaId","insumoId","quantidadeMilesimos") VALUES ('fi1','p1','f1','i1',1000);
      INSERT INTO "ProdutoVenda"(id,"parceiroId","fichaId",nome) VALUES ('pv1','p1','f1','Receita legada');
      INSERT INTO "ProdutoCanal"(id,"parceiroId","produtoId",canal,"precoManualCentavos","atualizadoEm") VALUES ('pc1','p1','pv1','LOJA',1234,now());
      INSERT INTO "HistoricoAlteracao"(id,"parceiroId",entidade,"entidadeId",acao,depois,"autorNome") VALUES ('h1','p1','FichaTecnica','f1','CRIOU','{"nome":"Receita legada"}','Teste');`);
    const retrato = () => sql(`SELECT jsonb_build_object('ficha',(SELECT to_jsonb(f)-'chaveEnvio'-'hashEnvio' FROM "FichaTecnica" f WHERE id='f1'),
      'itens',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM "FichaItem" i),'precos',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM "ProdutoCanal" p),
      'historico',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM "HistoricoAlteracao" h))::text`);
    const antes = retrato(), db = new PrismaClient({ datasources: { db: { url: su } } });
    try {
      expect(await conferirEnvioDaFicha(db)).toEqual([]);
      const r = psql(dono, ['-f', join(PASTA, MIGRACAO, 'migration.sql')]); expect(r.ok, r.aviso).toBe(true);
      expect(retrato()).toBe(antes);
      expect(sql(`SELECT "chaveEnvio" IS NULL AND "hashEnvio" IS NULL FROM "FichaTecnica" WHERE id='f1'`)).toBe('t');
      expect(sql(`SELECT relrowsecurity||':'||relforcerowsecurity FROM pg_class WHERE oid='"FichaTecnica"'::regclass`)).toBe(`${perfil.rls}:${perfil.rls}`);
      const inserir = (id: string, p: string, chave: string | null, hash: string | null) => `INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento","atualizadoEm","chaveEnvio","hashEnvio") VALUES ('${id}','${p}','Ficha ${id}','PRATO',1000,'UN',now(),${chave === null ? 'NULL' : `'${chave}'`},${hash === null ? 'NULL' : `'${hash}'`})`;
      const chave = 'a'.repeat(40), hash = 'b'.repeat(64);
      for (const [k, h] of [[chave, null], [null, hash], ['', ''], ['g'.repeat(40), hash], [chave, 'A'.repeat(64)], ['a'.repeat(39), hash], [chave, 'b'.repeat(65)]]) expect(tenant('p1', inserir('invalida', 'p1', k, h)).ok, String(k)).toBe(false);
      expect(tenant('p1', inserir('f2', 'p1', chave, hash)).ok).toBe(true);
      expect(tenant('p1', inserir('duplicada', 'p1', chave, hash)).ok).toBe(false);
      expect(tenant('p2', inserir('f3', 'p2', chave, hash)).ok).toBe(true);
      expect(tenant('p1', inserir('f4', 'p1', null, null)).ok).toBe(true);
      for (const s of [`UPDATE "FichaTecnica" SET "chaveEnvio"='${'c'.repeat(40)}' WHERE id='f2'`, `UPDATE "FichaTecnica" SET "hashEnvio"='${'d'.repeat(64)}' WHERE id='f2'`, `UPDATE "FichaTecnica" SET "chaveEnvio"=NULL,"hashEnvio"=NULL WHERE id='f2'`, `UPDATE "FichaTecnica" SET "chaveEnvio"='${'e'.repeat(40)}',"hashEnvio"='${hash}' WHERE id='f1'`]) expect(tenant('p1', s).ok).toBe(false);
      expect(tenant('p1', `UPDATE "FichaTecnica" SET nome='Nome novo',"chaveEnvio"='${chave}',"hashEnvio"='${hash}' WHERE id='f2'`).ok).toBe(true);
      if (perfil.rls) {
        expect(psql(dono, ['-c', 'SET ROLE erp_tenant; SELECT count(*) FROM "FichaTecnica"']).saida.split('\n').pop()).toBe('0');
        expect(tenant('p2', `SELECT count(*) FROM "FichaTecnica" WHERE "parceiroId"='p1'`).saida.split('\n').pop()).toBe('0');
        expect(tenant('p2', inserir('furo', 'p1', 'f'.repeat(40), hash)).ok).toBe(false);
      }
      expect(await conferirMigracao(db)).toEqual([]);
      const check = sql(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='${CHECK_DO_ENVIO_DA_FICHA}'`);
      for (const def of ['', 'CHECK (true)', `${check} NOT VALID`]) {
        sql(`ALTER TABLE "FichaTecnica" DROP CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}"`);
        if (def) sql(`ALTER TABLE "FichaTecnica" ADD CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}" ${def}`);
        expect((await conferirEnvioDaFicha(db)).join('\n')).toContain(CHECK_DO_ENVIO_DA_FICHA);
        if (def) sql(`ALTER TABLE "FichaTecnica" DROP CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}"`);
        sql(`ALTER TABLE "FichaTecnica" ADD CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}" ${check}`);
      }
      sql('DROP INDEX "FichaTecnica_parceiroId_chaveEnvio_key"; CREATE UNIQUE INDEX "FichaTecnica_parceiroId_chaveEnvio_key" ON "FichaTecnica"("parceiroId","chaveEnvio") WHERE "chaveEnvio" IS NOT NULL');
      expect((await conferirEnvioDaFicha(db)).join('\n')).toMatch(/índice único/);
      sql('DROP INDEX "FichaTecnica_parceiroId_chaveEnvio_key"; CREATE UNIQUE INDEX "FichaTecnica_parceiroId_chaveEnvio_key" ON "FichaTecnica"("parceiroId","chaveEnvio")');
      sql('ALTER TABLE "FichaTecnica" DISABLE TRIGGER "FichaTecnica_envio_imutavel"');
      expect((await conferirEnvioDaFicha(db)).join('\n')).toMatch(/imutavel/);
      sql('ALTER TABLE "FichaTecnica" ENABLE TRIGGER "FichaTecnica_envio_imutavel"');
      sql(`ALTER TABLE "FichaTecnica" ALTER COLUMN "hashEnvio" SET DEFAULT '${hash}'`);
      expect((await conferirEnvioDaFicha(db)).join('\n')).toContain('hashEnvio');
      sql('ALTER TABLE "FichaTecnica" ALTER COLUMN "hashEnvio" DROP DEFAULT');
      expect(await conferirMigracao(db)).toEqual([]); expect(retrato()).toBe(antes);
      // Uma regex que aceita maiúsculas muda o contrato mesmo com tokens SQL parecidos.
      sql(`DELETE FROM "FichaTecnica" WHERE "chaveEnvio" IS NOT NULL; ALTER TABLE "FichaTecnica" DROP CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}"; ALTER TABLE "FichaTecnica" ADD CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}" ${check.replaceAll('[0-9a-f]', '[0-9A-F]')}`);
      expect((await conferirEnvioDaFicha(db)).join('\n')).toContain(CHECK_DO_ENVIO_DA_FICHA);
      sql(`ALTER TABLE "FichaTecnica" DROP CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}"; ALTER TABLE "FichaTecnica" ADD CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}" CHECK ("chaveEnvio" IS NULL AND ("hashEnvio" IS NULL OR ("chaveEnvio" IS NOT NULL AND "hashEnvio" IS NOT NULL AND "chaveEnvio" ~ '^[0-9a-f]{40}$' AND "hashEnvio" ~ '^[0-9a-f]{64}$')))`);
      expect((await conferirEnvioDaFicha(db)).join('\n')).toContain(CHECK_DO_ENVIO_DA_FICHA);
      sql(`ALTER TABLE "FichaTecnica" DROP CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}"; ALTER TABLE "FichaTecnica" ADD CONSTRAINT "${CHECK_DO_ENVIO_DA_FICHA}" ${check}`);
      expect(await conferirMigracao(db)).toEqual([]);
    } finally { await db.$disconnect(); }
  });
});
