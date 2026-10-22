/**
 * ERP F.1b · a migration `20261106000000_erp_documento_fiscal` com DADO ANTIGO, como superusuário e como DONO NÃO-SUPERUSUÁRIO
 * (com RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior (a F.1a), planta o que já existia (fornecedor, insumo, nota de
 * compra COM chave de acesso gravada, nota cancelada, estoque) e aplica a migration:
 *  - nada some e NADA muda (mesmas notas, mesmas chaves, mesmos itens e movimentos); sem aviso nenhum; as três tabelas nascem
 *    vazias e com RLS (quando o papel pode instalá-la);
 *  - a chave de acesso da NOTA deixa de ser única total e passa a ser única só entre as que valem: a cancelada libera a chave,
 *    duas ativas com a mesma chave continuam impossíveis;
 *  - pelo papel do tenant: o documento (conteúdo imutável, cancelado que não volta, conciliado quer nota), o item (só muda a
 *    resolução enquanto aguarda) e a memória (chave imutável) se comportam; o outro parceiro não enxerga;
 *  - `erp:conferir-migracao` fica limpo e acusa o que faltar (índice, gatilho, RLS).
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-documento-fiscal-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const ESTA = '20261106000000_erp_documento_fiscal';
const temPsql = spawnSync('psql', ['--version']).status === 0;
const CHAVE = '33261011222333000181550010000045211123456784';
const CHAVE2 = '33261011222333000181550010000045221123456785';
const SHA = 'a'.repeat(64);

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

describe.skipIf(!URL_TESTE || !temPsql)('ERP F.1b · migration do documento fiscal com dado antigo (Postgres real)', { timeout: 360_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  function prepararBanco(perfil: Perfil, nomeDoBanco: string) {
    const dono = urlDe(nomeDoBanco, perfil.papel);
    const superuser = urlDe(nomeDoBanco);
    expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${nomeDoBanco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${nomeDoBanco}`).toBe(true);
    criados.push(nomeDoBanco);
    if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
    for (const m of antes(ESTA)) {
      const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
      expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
    }
    const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'Fornecedor'`]).saida === 't';
    expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
    const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);

    expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
    const plantado = psql(dono, [
      '-c',
      noContexto(
        'p1',
        `INSERT INTO "Loja"(id,"parceiroId",nome,slug,cnpj) VALUES ('l1','p1','Loja 1','l1','11444777000161');
         INSERT INTO "Fornecedor"(id,"parceiroId",nome,documento,"atualizadoEm") VALUES ('f1','p1','Laticínios Rio','11222333000181',now());
         INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","atualizadoEm") VALUES
           ('i1','p1','Muçarela','KG','INGREDIENTE',1000,4000,'SECO',now());
         INSERT INTO "NotaEntrada"(id,"parceiroId","lojaId","fornecedorId","entradaEm","totalCentavos",status,"lancadaEm","atualizadoEm","chaveAcesso",numero) VALUES
           ('n1','p1','l1','f1','2026-10-01',8990,'LANCADA',now(),now(),'${CHAVE}','4521'),
           ('n2','p1','l1','f1','2026-10-02',1000,'LANCADA',now(),now(),NULL,'4522');`,
      ),
    ]);
    expect(plantado.ok, plantado.aviso).toBe(true);
    return { dono, superuser, comRls, noContexto };
  }

  const contagens = (superuser: string) =>
    psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "Fornecedor") || '/' || (SELECT count(*) FROM "NotaEntrada") || '/' || (SELECT count(*) FROM "NotaEntrada" WHERE "chaveAcesso" IS NOT NULL) || '/' || (SELECT count(*) FROM "Insumo")`]).saida;

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('nada some nem muda, sem aviso; as tabelas nascem vazias; a chave da nota passa a ser única só entre as que valem', () => {
        const { dono, superuser, comRls, noContexto } = prepararBanco(perfil, `ff_migf1b_${rotulo}_${sufixo}`);
        const contagem = contagens(superuser);
        expect(contagem).toBe('1/2/1/1');

        const r = psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]);
        expect(r.ok, r.aviso).toBe(true);
        expect(r.aviso).not.toContain('WARNING');
        expect(contagens(superuser)).toBe(contagem);
        expect(psql(superuser, ['-c', `SELECT "chaveAcesso" FROM "NotaEntrada" WHERE id = 'n1'`]).saida).toBe(CHAVE);
        for (const t of ['DocumentoFiscal', 'DocumentoFiscalItem', 'VinculoItemFornecedor']) {
          expect(psql(superuser, ['-c', `SELECT count(*) FROM "${t}"`]).saida, t).toBe('0');
          if (comRls) expect(psql(superuser, ['-c', `SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE relname = '${t}'`]).saida, `RLS em ${t}`).toBe('t');
        }
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE (conname LIKE 'DocumentoFiscal%' OR conname LIKE 'VinculoItemFornecedor%') AND NOT convalidated`]).saida).toBe('0');
        // O índice total antigo saiu; o parcial e o comum entraram.
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname = 'NotaEntrada_parceiroId_chaveAcesso_key'`]).saida).toBe('0');
        expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_indexes WHERE indexname IN ('NotaEntrada_chave_ativa_key', 'NotaEntrada_parceiroId_chaveAcesso_idx')`]).saida).toBe('2');

        // Pelo papel do tenant (ou o dono, sem RLS).
        const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
        // Duas notas ATIVAS com a mesma chave: não. Cancelada libera: sim.
        expect(comoP1(`UPDATE "NotaEntrada" SET "chaveAcesso" = '${CHAVE}' WHERE id = 'n2'`).aviso).toMatch(/NotaEntrada_chave_ativa_key|already exists/);
        expect(comoP1(`UPDATE "NotaEntrada" SET status = 'CANCELADA', "canceladaEm" = now(), "motivoCancelamento" = 'teste' WHERE id = 'n1'`).ok).toBe(true);
        expect(comoP1(`UPDATE "NotaEntrada" SET "chaveAcesso" = '${CHAVE}' WHERE id = 'n2'`).ok).toBe(true);
        expect(comoP1(`UPDATE "NotaEntrada" SET "chaveAcesso" = '${CHAVE2}' WHERE id = 'n2'`).ok).toBe(true);

        // O documento: nasce, o conteúdo não muda, o conciliado quer nota, o cancelado não volta.
        const doc = `INSERT INTO "DocumentoFiscal"(id,"parceiroId","chaveAcesso",serie,numero,"emitidaEm","emitenteDocumento","emitenteRazao","destinatarioDocumento","lojaId","fornecedorId","vProdCentavos","vDescCentavos","vFreteCentavos","vSegCentavos","vOutroCentavos","vIpiCentavos","vStCentavos","vNfCentavos","xmlSha256",xml,"atualizadoEm")
          VALUES ('d1','p1','${CHAVE}','1','4521','2026-10-21','11222333000181','Laticínios','11444777000161','l1','f1',100,0,0,0,0,0,0,100,'${SHA}','<x/>',now())`;
        expect(comoP1(doc).ok).toBe(true);
        expect(comoP1(`${doc.replace("'d1'", "'d2'").replace(/'4521','2026/, "'4521','2026")}`).aviso).toMatch(/DocumentoFiscal_parceiroId_chaveAcesso_key|already exists/); // a mesma chave, o mesmo parceiro
        expect(comoP1(`UPDATE "DocumentoFiscal" SET "vNfCentavos" = 1 WHERE id = 'd1'`).aviso).toContain('DocumentoFiscal_conteudo_imutavel');
        expect(comoP1(`UPDATE "DocumentoFiscal" SET "situacao" = 'CONCILIADO' WHERE id = 'd1'`).aviso).toContain('DocumentoFiscal_conciliado_tem_nota');
        expect(comoP1(`UPDATE "DocumentoFiscal" SET "situacao" = 'CONCILIADO', "notaEntradaId" = 'n2' WHERE id = 'd1'`).ok).toBe(true);
        expect(comoP1(`UPDATE "DocumentoFiscal" SET "situacao" = 'AGUARDANDO_CONFERENCIA', "notaEntradaId" = NULL WHERE id = 'd1'`).ok).toBe(true);
        expect(comoP1(`UPDATE "DocumentoFiscal" SET "situacao" = 'CANCELADO' WHERE id = 'd1'`).aviso).toContain('DocumentoFiscal_cancelado_tem_motivo');
        expect(comoP1(`UPDATE "DocumentoFiscal" SET "situacao" = 'CANCELADO', "canceladoEm" = now(), motivo = 'não é nossa' WHERE id = 'd1'`).ok).toBe(true);
        expect(comoP1(`UPDATE "DocumentoFiscal" SET "situacao" = 'AGUARDANDO_CONFERENCIA', "canceladoEm" = NULL, motivo = NULL WHERE id = 'd1'`).aviso).toContain('cancelado não muda');

        // O item: só nasce com documento que aguarda; a resolução é tudo-ou-nada; o que veio na nota não muda.
        expect(comoP1(`INSERT INTO "DocumentoFiscalItem"(id,"parceiroId","documentoId","nItem","codigoProduto",descricao,"unidadeComercial","qComTexto","qComMilesimos","vProdCentavos","vDescCentavos","vOutroCentavos","vSegCentavos","vIpiCentavos","vStCentavos","vFreteCentavos","liquidoCentavos") VALUES ('it1','p1','d1',1,'X','Item','PC','1.0000',1000,100,0,0,0,0,0,0,100)`).aviso).toContain('DocumentoFiscalItem_so_na_conferencia'); // d1 está cancelado
        expect(comoP1(doc.replace("'d1'", "'d3'").replace(`'${CHAVE}'`, `'${CHAVE2.slice(0, 43)}6'`)).ok).toBe(true);
        const item = (extra = '') => `INSERT INTO "DocumentoFiscalItem"(id,"parceiroId","documentoId","nItem","codigoProduto",descricao,"unidadeComercial","qComTexto","qComMilesimos","vProdCentavos","vDescCentavos","vOutroCentavos","vSegCentavos","vIpiCentavos","vStCentavos","vFreteCentavos","liquidoCentavos"${extra ? ',"insumoId","fatorMilesimos"' : ''}) VALUES ('it2','p1','d3',1,'X','Item','PC','1.0000',1000,100,0,0,0,0,0,0,100${extra})`;
        expect(comoP1(item(", 'i1', 0")).aviso).toContain('DocumentoFiscalItem_fator_faixa');
        expect(comoP1(item()).ok).toBe(true);
        expect(comoP1(`UPDATE "DocumentoFiscalItem" SET "qComMilesimos" = 5 WHERE id = 'it2'`).aviso).toContain('DocumentoFiscalItem_so_na_conferencia');
        expect(comoP1(`UPDATE "DocumentoFiscalItem" SET "insumoId" = 'i1' WHERE id = 'it2'`).aviso).toContain('DocumentoFiscalItem_resolucao_inteira');
        expect(comoP1(`UPDATE "DocumentoFiscalItem" SET "insumoId" = 'i1', "fatorMilesimos" = 1000 WHERE id = 'it2'`).ok).toBe(true);

        // A memória: única por fornecedor + código + unidade, e a chave dela não troca.
        const memoria = (id: string, extra = '') => `INSERT INTO "VinculoItemFornecedor"(id,"parceiroId","fornecedorId","codigoProduto","unidadeComercial","insumoId","fatorMilesimos"${extra}) VALUES ('${id}','p1','f1','X','PC','i1',1000)`;
        expect(comoP1(memoria('v1')).ok).toBe(true);
        expect(comoP1(memoria('v2')).aviso).toMatch(/already exists|VinculoItemFornecedor_parceiroId_fornecedorId_codigoProduto_key/);
        expect(comoP1(`UPDATE "VinculoItemFornecedor" SET "codigoProduto" = 'Y' WHERE id = 'v1'`).aviso).toContain('VinculoItemFornecedor_chave_imutavel');
        expect(comoP1(`UPDATE "VinculoItemFornecedor" SET "fatorMilesimos" = 12000 WHERE id = 'v1'`).ok).toBe(true);

        // O outro parceiro não enxerga; o mesmo documento (mesma chave) em OUTRO parceiro é outro mundo.
        if (comRls) {
          expect(psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "DocumentoFiscal"`)]).saida.split('\n').pop()).toBe('0');
          expect(psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "VinculoItemFornecedor"`)]).saida.split('\n').pop()).toBe('0');
        }
        expect(psql(dono, ['-c', noContexto('p2', `INSERT INTO "Loja"(id,"parceiroId",nome,slug,cnpj) VALUES ('l2','p2','Loja 2','l2','11444777000161'); INSERT INTO "DocumentoFiscal"(id,"parceiroId","chaveAcesso",serie,numero,"emitidaEm","emitenteDocumento","emitenteRazao","destinatarioDocumento","vProdCentavos","vDescCentavos","vFreteCentavos","vSegCentavos","vOutroCentavos","vIpiCentavos","vStCentavos","vNfCentavos","xmlSha256",xml,"atualizadoEm") VALUES ('e1','p2','${CHAVE}','1','4521','2026-10-21','11222333000181','Laticínios','11444777000161',100,0,0,0,0,0,0,100,'${SHA}','<x/>',now())`)]).ok).toBe(true);
      });

      it('o conferidor fica limpo e acusa o que faltar (gatilho, índice parcial, índice antigo de volta, RLS)', async () => {
        const { dono, superuser, comRls } = prepararBanco(perfil, `ff_migf1bc_${rotulo}_${sufixo}`);
        expect(psql(dono, ['-f', join(MIGRACOES, ESTA, 'migration.sql')]).ok).toBe(true);
        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);
          expect(psql(superuser, ['-c', `DROP TRIGGER "DocumentoFiscal_conteudo_imutavel" ON "DocumentoFiscal"`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/Gatilho DocumentoFiscal_conteudo_imutavel NÃO existe/);
          expect(psql(superuser, ['-c', `DROP INDEX "NotaEntrada_chave_ativa_key"`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/Índice NotaEntrada_chave_ativa_key NÃO existe: há duas notas ativas com a mesma chave/);
          expect(psql(superuser, ['-c', `CREATE UNIQUE INDEX "NotaEntrada_parceiroId_chaveAcesso_key" ON "NotaEntrada"("parceiroId", "chaveAcesso")`]).ok).toBe(true);
          expect((await conferirMigracao(db)).join('\n')).toMatch(/índice antigo NotaEntrada_parceiroId_chaveAcesso_key/);
          if (comRls) {
            expect(psql(superuser, ['-c', `ALTER TABLE "VinculoItemFornecedor" NO FORCE ROW LEVEL SECURITY`]).ok).toBe(true);
            expect((await conferirMigracao(db)).join('\n')).toMatch(/Tabela VinculoItemFornecedor sem RLS forçada/);
          }
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
