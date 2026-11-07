/** 3B: upgrade sem backfill e CHECK real nos três perfis de instalação. */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { executarPsqlDeTeste as psql } from './erp-psql-apoio';
import { conferirFaixasDeCmv, conferirMigracao, CHECK_DAS_FAIXAS_DE_CMV } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACAO = '20261121000000_erp_cmv_faixas';
const PASTA = join(process.cwd(), 'prisma', 'migrations');
const temPsql = spawnSync('psql', ['--version']).status === 0;
const perfis = [{ nome: 'superusuário', papel: '', rls: true }, { nome: 'dono com RLS', papel: 'ff_dono', rls: true }, { nome: 'dono sem RLS', papel: 'ff_semrls', rls: false }];
function urlDe(banco: string, papel = '') {
  const url = new URL(URL_TESTE!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
  url.pathname = `/${banco}`; url.search = '';
  if (papel) { url.username = papel; url.password = papel; }
  return url.toString();
}
const papelExiste = (papel: string) => !papel || (!!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `SELECT count(*) FROM pg_roles WHERE rolname='${papel}'`]).saida === '1');

describe.skipIf(!URL_TESTE || !temPsql)('3B · migration de faixas de CMV (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = crypto.randomUUID().replaceAll('-', '').slice(0, 8), criados: string[] = [];
  afterAll(() => {
    for (const banco of criados) { const r = psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`]); expect(r.ok, r.aviso).toBe(true); }
  }, 360_000);

  for (const perfil of perfis) it.skipIf(!papelExiste(perfil.papel))(`${perfil.nome}: legado intacto, conjunto completo/ordenado, teto e proteção tenant`, async () => {
    const banco = `ff_mig3b_${perfil.papel || 'su'}_${sufixo}`, su = urlDe(banco), dono = urlDe(banco, perfil.papel);
    const criado = psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]);
    expect(criado.ok, criado.aviso).toBe(true); criados.push(banco);
    if (perfil.papel) expect(psql(su, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
    for (const m of readdirSync(PASTA).filter(n => /^\d{14}_/.test(n) && n < MIGRACAO).sort()) {
      const r = psql(dono, ['-f', join(PASTA, m, 'migration.sql')]); expect(r.ok, `${m}: ${r.aviso}`).toBe(true);
    }
    const sql = (texto: string) => { const r = psql(su, ['-c', texto]); expect(r.ok, r.aviso).toBe(true); return r.saida; };
    const tenant = (parceiro: string, texto: string) => psql(dono, ['-c', perfil.rls ? `SELECT set_config('app.parceiro_id','${parceiro}',true),set_config('role','erp_tenant',true); ${texto}` : texto]);
    sql(`INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','Sintético 3B','p1','ATIVO'),('p2','Outro 3B','p2','ATIVO');
      INSERT INTO "CanalConfig"(id,"parceiroId",canal,"taxaConfigurada","taxaBp","taxaPagamentoBp","metaCmvPadraoBp","margemAlvoPadraoBp","atualizadoEm") VALUES
      ('c1','p1','LOJA',true,0,0,2500,5000,now()),('c2','p1','IFOOD',false,0,0,3000,NULL,now()),('c3','p2','IFOOD',true,1700,320,2800,5500,now());
      INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,"conteudoMilesimos","precoEmbalagemCentavos","atualizadoEm") VALUES ('i1','p1','Ingrediente legado','KG',1000,420,now());
      INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento","passosPreparo","atualizadoEm") VALUES ('f1','p1','Receita legada','PRATO',1000,'UN',ARRAY['Etapa original'],now());
      INSERT INTO "FichaItem"(id,"parceiroId","fichaId","insumoId","quantidadeMilesimos") VALUES ('fi1','p1','f1','i1',1000);
      INSERT INTO "ProdutoVenda"(id,"parceiroId","fichaId",nome) VALUES ('pv1','p1','f1','Receita legada');
      INSERT INTO "ProdutoCanal"(id,"parceiroId","produtoId",canal,"precoManualCentavos","atualizadoEm") VALUES ('pc1','p1','pv1','LOJA',1234,now());
      INSERT INTO "HistoricoAlteracao"(id,"parceiroId",entidade,"entidadeId",acao,depois,"autorNome") VALUES ('h1','p1','CanalConfig','c1','ALTEROU','{"metaCmv":"25%"}','Teste');`);
    const retrato = () => sql(`SELECT jsonb_build_object(
      'config',(SELECT jsonb_agg(to_jsonb(c)-'farolABp'-'farolBBp'-'farolCBp'-'farolDBp' ORDER BY id) FROM "CanalConfig" c),
      'receita',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM "FichaTecnica" f),'itens',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM "FichaItem" i),
      'precos',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM "ProdutoCanal" p),'historico',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM "HistoricoAlteracao" h))::text`);
    const antes = retrato();
    const db = new PrismaClient({ datasources: { db: { url: su } } });
    try {
      expect(await conferirFaixasDeCmv(db)).toEqual([]);
      const r = psql(dono, ['-f', join(PASTA, MIGRACAO, 'migration.sql')]); expect(r.ok, r.aviso).toBe(true);
      expect(retrato()).toBe(antes);
      expect(sql(`SELECT count(*) FROM "CanalConfig" WHERE "farolABp" IS NOT NULL OR "farolBBp" IS NOT NULL OR "farolCBp" IS NOT NULL OR "farolDBp" IS NOT NULL`)).toBe('0');
      expect(sql(`SELECT relrowsecurity||':'||relforcerowsecurity FROM pg_class WHERE oid='"CanalConfig"'::regclass`)).toBe(`${perfil.rls}:${perfil.rls}`);
      const campos = ['farolABp', 'farolBBp', 'farolCBp', 'farolDBp'];
      const atualizar = (valores: (number | null)[]) => `UPDATE "CanalConfig" SET ${campos.map((c, i) => `"${c}"=${valores[i] ?? 'NULL'}`).join(',')} WHERE id='c1'`;
      for (let mascara = 1; mascara < 15; mascara++) {
        const valores = [2000, 3000, 4000, 5000].map((valor, i) => mascara & (1 << i) ? valor : null);
        expect(tenant('p1', atualizar(valores)).ok, `Conjunto parcial ${mascara}`).toBe(false);
      }
      for (const valores of [[-1, 3000, 4000, 5000], [3000, 3000, 4000, 5000], [2000, 4000, 3000, 5000], [2000, 3000, 5000, 4000], [0, 10001, 15000, 2000000001]]) expect(tenant('p1', atualizar(valores)).ok, valores.join(',')).toBe(false);
      expect(tenant('p1', atualizar([0, 10001, 1999999999, 2000000000])).ok).toBe(true);
      expect(tenant('p1', atualizar([null, null, null, null])).ok).toBe(true);
      if (perfil.rls) {
        expect(psql(dono, ['-c', 'SET ROLE erp_tenant; SELECT count(*) FROM "CanalConfig"']).saida.split('\n').pop()).toBe('0');
        expect(tenant('p2', 'SELECT count(*) FROM "CanalConfig" WHERE "parceiroId"=\'p1\'').saida.split('\n').pop()).toBe('0');
        expect(tenant('p2', atualizar([2000, 3000, 4000, 5000])).ok).toBe(true);
        expect(sql('SELECT "farolABp" IS NULL FROM "CanalConfig" WHERE id=\'c1\'')).toBe('t');
        expect(tenant('p2', `INSERT INTO "CanalConfig"(id,"parceiroId",canal,"atualizadoEm") VALUES ('furo','p1','DELIVERY_PROPRIO',now())`).ok).toBe(false);
      }
      expect(await conferirMigracao(db)).toEqual([]);
      const definicao = sql(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='${CHECK_DAS_FAIXAS_DE_CMV}'`);
      for (const substituir of ['', `CHECK (true)`, `${definicao} NOT VALID`]) {
        sql(`ALTER TABLE "CanalConfig" DROP CONSTRAINT "${CHECK_DAS_FAIXAS_DE_CMV}"`);
        if (substituir) sql(`ALTER TABLE "CanalConfig" ADD CONSTRAINT "${CHECK_DAS_FAIXAS_DE_CMV}" ${substituir}`);
        expect((await conferirFaixasDeCmv(db)).join('\n')).toContain(CHECK_DAS_FAIXAS_DE_CMV);
        if (substituir) sql(`ALTER TABLE "CanalConfig" DROP CONSTRAINT "${CHECK_DAS_FAIXAS_DE_CMV}"`);
        sql(`ALTER TABLE "CanalConfig" ADD CONSTRAINT "${CHECK_DAS_FAIXAS_DE_CMV}" ${definicao}`);
      }
      sql('ALTER TABLE "CanalConfig" ALTER COLUMN "farolABp" SET DEFAULT 0');
      expect((await conferirFaixasDeCmv(db)).join('\n')).toContain('farolABp');
      sql('ALTER TABLE "CanalConfig" ALTER COLUMN "farolABp" DROP DEFAULT');
      expect(await conferirMigracao(db)).toEqual([]);
      expect(retrato()).toBe(antes);
    } finally { await db.$disconnect(); }
  });
});
