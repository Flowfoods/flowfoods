/**
 * ERP 3.4 · a migration `20261110000000_erp_etiquetas` com DADO ANTIGO, como superusuário e como DONO NÃO-SUPERUSUÁRIO (com
 * RLS FORÇADA e sem RLS).
 *
 * Cria bancos descartáveis, leva cada um até a migration anterior, planta o que já existia (um lote concluído da 3.1 com
 * validade, um insumo comprado com prazo depois de aberto e uma "Etiqueta" da 0.1 que nenhum código gravava) e aplica a
 * migration:
 *  - nada some, não avisa; a etiqueta antiga fica; as três tabelas nascem (com RLS forçada onde as outras têm); os 4 CHECKs da
 *    "Etiqueta" validados; os índices e os gatilhos;
 *  - pelo papel do tenant: a abertura com a validade efetiva certa passa; validade inventada, prazo que não é o do insumo,
 *    mudar a abertura, lote de recebimento sem nota e pré-preparo são recusados; a emissão do lote copia a validade dele (outra
 *    é recusada) e não muda depois; o pedido de impressão muda uma vez só; o outro parceiro não enxerga;
 *  - o conferidor pós-deploy não lista pendência — e lista quando falta um índice, um gatilho ou a RLS de uma tabela da 3.4.
 * Nenhum passo da migration depende de SELECT sob RLS.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-etiquetas-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_3_4 = '20261110000000_erp_etiquetas';
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

// O lote concluído vale até 24/10 às 15:00 (UTC); a abertura é às 15:00 (UTC) de 23/10 com 3 dias de prazo refrigerado.
const VALIDADE_DO_LOTE = '2026-10-24 15:00:00';
const ABERTO = '2026-10-23 15:00:00';

describe.skipIf(!URL_TESTE || !temPsql)('ERP 3.4 · migration das etiquetas, com dado antigo (Postgres real)', { timeout: 420_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const criados: string[] = [];

  afterAll(() => {
    for (const b of criados) psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${b} WITH (FORCE)`]);
  });

  for (const perfil of PERFIS) {
    const rotulo = perfil.papel ?? 'su';
    describe.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(perfil.nome, () => {
      it('com dado antigo: nada some, sem aviso, tabelas, CHECKs, índices e gatilhos; as regras valem pelo papel do tenant; o conferidor não acha pendência', async () => {
        const banco = `ff_mig34_${rotulo}_${sufixo}`;
        const dono = urlDe(banco, perfil.papel);
        const superuser = urlDe(banco);
        expect(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]).ok, `criar ${banco}`).toBe(true);
        criados.push(banco);
        if (perfil.papel) expect(psql(superuser, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
        for (const m of antes(DA_3_4)) {
          const r = psql(dono, ['-f', join(MIGRACOES, m, 'migration.sql')]);
          expect(r.ok, `${m}: ${r.aviso.slice(0, 300)}`).toBe(true);
        }
        const comRls = psql(superuser, ['-c', `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'OrdemProducao'`]).saida === 't';
        expect(comRls, `RLS forçada esperada = ${perfil.rls}`).toBe(perfil.rls);
        const noContexto = (parceiro: string, sql: string) => (comRls ? `SELECT set_config('app.parceiro_id','${parceiro}',true), set_config('role','erp_tenant',true); ${sql}` : sql);

        // O conferidor no banco da fase anterior: limpo, sem cobrar o que ainda não veio.
        const db = new PrismaClient({ datasources: { db: { url: superuser } } });
        try {
          expect(await conferirMigracao(db)).toEqual([]);

          // O que já existia: o lote concluído da 3.1 (com validade), o insumo comprado com prazo e a etiqueta da 0.1.
          expect(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO'),('p2','P2','p2','ATIVO')`]).ok).toBe(true);
          const plantado = psql(dono, [
            '-c',
            noContexto(
              'p1',
              `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1');
               INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","atualizadoEm") VALUES
                 ('i1','p1','Molho','KG','PRE_PREPARO',1000,0,'REFRIGERADO',now());
               INSERT INTO "Insumo"(id,"parceiroId",nome,unidade,tipo,"conteudoMilesimos","precoEmbalagemCentavos","conservacao","validadeRefrigeradoMin","atualizadoEm") VALUES
                 ('i2','p1','Creme de leite','KG','INGREDIENTE',1000,1500,'REFRIGERADO',4320,now());
               INSERT INTO "FichaTecnica"(id,"parceiroId",nome,tipo,"rendimentoMilesimos","unidadeRendimento","insumoProduzidoId","atualizadoEm") VALUES
                 ('f1','p1','Molho','PRE_PREPARO',2000,'KG','i1',now());
               INSERT INTO "Requisicao"(id,"parceiroId","lojaId") VALUES ('r1','p1','l1');
               INSERT INTO "OrdemProducao"(id,"parceiroId","lojaId","fichaId","insumoProduzidoId","codigoLote",status,"dataPlanejada","planejadoMilesimos","fichaNomeSnapshot","requisicaoId","iniciadaEm","concluidaEm","produzidoMilesimos","custoTotalCentavos","concluidaPorNome","responsavelNomeSnapshot","responsavelUsuarioId","conservacaoSnapshot","validadeMinSnapshot","validadeEm") VALUES
                 ('o1','p1','l1','f1','i1','261021-03','CONCLUIDA','2026-10-21',5000,'Molho','r1','2026-10-21 12:00:00','2026-10-21 15:00:00',4600,11781,'Caio','Caio','u-caio','REFRIGERADO',4320,'${VALIDADE_DO_LOTE}');
               INSERT INTO "Etiqueta"(id,"parceiroId","lojaId",codigo,"insumoId","nomeSnapshot",conservacao,"validadeEm",formato) VALUES
                 ('e0','p1','l1','ANTIGA-1','i2','Creme de leite','REFRIGERADO','2026-10-30 12:00:00','E60X40');`,
            ),
          ]);
          expect(plantado.ok, plantado.aviso).toBe(true);
          const conta = () => psql(superuser, ['-c', `SELECT (SELECT count(*) FROM "Etiqueta")::text || '/' || (SELECT count(*) FROM "OrdemProducao")::text || '/' || (SELECT string_agg(codigo || ':' || coalesce("validadeEm"::text,'-'), ',' ORDER BY id) FROM "Etiqueta")`]).saida;
          const antesDaMigracao = conta();
          expect(antesDaMigracao).toBe('1/1/ANTIGA-1:2026-10-30 12:00:00');

          const r = psql(dono, ['-f', join(MIGRACOES, DA_3_4, 'migration.sql')]);
          expect(r.ok, r.aviso).toBe(true);
          expect(r.aviso).not.toContain('WARNING');
          expect(conta()).toBe(antesDaMigracao);
          // As três tabelas, com a RLS como as outras; os CHECKs da "Etiqueta" validados; índices e gatilhos.
          const rls = psql(superuser, ['-c', `SELECT string_agg(relname || ':' || relrowsecurity::text || relforcerowsecurity::text, ',' ORDER BY relname) FROM pg_class WHERE relkind = 'r' AND relname IN ('AberturaDeLote','EtiquetaImpressao','LoteDeInsumo')`]).saida;
          const esperado = perfil.rls ? 'truetrue' : 'falsefalse';
          expect(rls).toBe(`AberturaDeLote:${esperado},EtiquetaImpressao:${esperado},LoteDeInsumo:${esperado}`);
          expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_constraint WHERE conrelid = '"Etiqueta"'::regclass AND conname IN ('Etiqueta_origem_da_emissao','Etiqueta_validade_nunca_inventada','Etiqueta_quantas_faixa','Etiqueta_textos_curtos') AND convalidated`]).saida).toBe('4');
          expect(psql(superuser, ['-c', `SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('Etiqueta_origem_confere','EtiquetaImpressao_confere','LoteDeInsumo_confere','AberturaDeLote_confere','EtiquetaImpressao_parceiro_imutavel','LoteDeInsumo_parceiro_imutavel','AberturaDeLote_parceiro_imutavel')`]).saida).toBe('7');

          // Pelo papel do tenant (no contexto de p1).
          const comoP1 = (sql: string) => psql(dono, ['-c', noContexto('p1', sql)]);
          // A abertura com a validade efetiva certa: 3 dias de prazo, sem lote.
          const abrir = (id: string, extra: { validade?: string; prazo?: string; insumo?: string } = {}) =>
            comoP1(`INSERT INTO "AberturaDeLote"(id,"parceiroId","lojaId","insumoId","insumoNomeSnapshot","unidadeSnapshot",conservacao,"abertoEm","prazoAposAberturaMin","validadeEm","regraDaValidade","abertoPorNome","chaveEnvio") VALUES
              ('${id}','p1','l1','${extra.insumo ?? 'i2'}','Creme de leite','KG','REFRIGERADO','${ABERTO}',${extra.prazo ?? '4320'},${extra.validade ?? `'${ABERTO}'::timestamp + interval '3 days'`},'PRAZO_APOS_ABERTURA','Duda','env-${id}-abcdef')`);
          const a1 = abrir('a1');
          expect(a1.ok, a1.aviso).toBe(true);
          // Validade inventada (um dia a mais): o CHECK recusa.
          expect(abrir('a2', { validade: `'${ABERTO}'::timestamp + interval '4 days'` }).aviso).toMatch(/AberturaDeLote_(validade_efetiva|regra_confere)/);
          // Prazo que não é o do insumo naquela conservação: o gatilho recusa.
          expect(abrir('a3', { prazo: '5760', validade: `'${ABERTO}'::timestamp + interval '4 days'` }).aviso).toContain('AberturaDeLote_confere');
          // Pré-preparo não se abre.
          expect(abrir('a4', { insumo: 'i1' }).aviso).toContain('AberturaDeLote_confere');
          // A abertura não muda (o papel do tenant nem tem UPDATE nela; o dono sem RLS esbarra no gatilho).
          expect(comoP1(`UPDATE "AberturaDeLote" SET "abertoPorNome" = 'Outra' WHERE id = 'a1'`).aviso).toMatch(comRls ? /permission denied for table AberturaDeLote/ : /AberturaDeLote_imutavel/);
          // O lote do fornecedor: do recebimento sem nota lançada, recusado; lido na embalagem, passa.
          expect(comoP1(`INSERT INTO "LoteDeInsumo"(id,"parceiroId","lojaId","insumoId","notaId",origem,"insumoNomeSnapshot","unidadeSnapshot",codigo,"criadoPorNome") VALUES ('lt1','p1','l1','i2','nada','RECEBIMENTO','Creme de leite','KG','L1','Duda')`).aviso).toContain('LoteDeInsumo_confere');
          const lt2 = comoP1(`INSERT INTO "LoteDeInsumo"(id,"parceiroId","lojaId","insumoId",origem,"insumoNomeSnapshot","unidadeSnapshot",codigo,"vencimentoEm","criadoPorNome") VALUES ('lt2','p1','l1','i2','ABERTURA','Creme de leite','KG','L2','2026-12-01','Duda')`);
          expect(lt2.ok, lt2.aviso).toBe(true);
          expect(comoP1(`UPDATE "LoteDeInsumo" SET codigo = 'L3' WHERE id = 'lt2'`).aviso).toContain('LoteDeInsumo_imutavel');

          // A emissão do lote copia a validade dele; outra validade é recusada; depois não muda.
          // Rodada 1 (decisão 420): a manipulação = a conclusão e quem fez = o lote, conferidos pelo banco.
          const emitir = (id: string, validade: string, fabricado = '2026-10-21 15:00:00', quem = 'Caio') =>
            comoP1(`INSERT INTO "Etiqueta"(id,"parceiroId","lojaId",codigo,"insumoId","ordemProducaoId","nomeSnapshot","unidadeSnapshot",conservacao,"validadeEm","regraDaValidade","loteProduzido","lojaNomeSnapshot",quantas,"chaveEnvio","emitidaPorNome",formato,"fabricadoEm","responsavelNomeSnapshot","responsavelUsuarioId") VALUES
              ('${id}','p1','l1','E261023-000${id.slice(-1)}','i1','o1','Molho','KG','REFRIGERADO','${validade}','LOTE_PRODUZIDO','261021-03','Loja 1',2,'env-${id}-abcdef','Duda','E60X40','${fabricado}','${quem}','u-caio')`);
          const e1 = emitir('e1', VALIDADE_DO_LOTE);
          expect(e1.ok, e1.aviso).toBe(true);
          expect(emitir('e2', '2026-10-25 15:00:00').aviso).toContain('Etiqueta_origem_confere');
          expect(emitir('e3', VALIDADE_DO_LOTE, '2020-01-01 00:00:00').aviso).toContain('Etiqueta_origem_confere');
          expect(emitir('e4', VALIDADE_DO_LOTE, '2026-10-21 15:00:00', 'Forjado').aviso).toContain('Etiqueta_origem_confere');
          expect(comoP1(`UPDATE "Etiqueta" SET quantas = 3 WHERE id = 'e1'`).aviso).toContain('Etiqueta_imutavel');
          // A etiqueta antiga (sem regra) não é cobrada pelos gatilhos novos.
          expect(comoP1(`UPDATE "Etiqueta" SET "responsavelNomeSnapshot" = 'Equipe' WHERE id = 'e0'`).ok).toBe(true);

          // O pedido de impressão: preparada → enviada, uma vez só.
          const p1 = comoP1(`INSERT INTO "EtiquetaImpressao"(id,"parceiroId","lojaId","etiquetaId",sequencia,copias,transporte,"solicitadaPorNome","chaveEnvio") VALUES ('ip1','p1','l1','e1',1,2,'BROWSER_PRINT','Duda','env-ip1-abcdef')`);
          expect(p1.ok, p1.aviso).toBe(true);
          expect(comoP1(`UPDATE "EtiquetaImpressao" SET situacao = 'ENVIADA', "concluidaEm" = now() WHERE id = 'ip1'`).ok).toBe(true);
          expect(comoP1(`UPDATE "EtiquetaImpressao" SET situacao = 'FALHOU', erro = 'x', "concluidaEm" = now() WHERE id = 'ip1'`).aviso).toContain('EtiquetaImpressao_confere');
          // Rodada 1 (decisão 420): o pedido não some (com RLS, nem há DELETE; sem RLS, o gatilho recusa).
          expect(comoP1(`DELETE FROM "EtiquetaImpressao" WHERE id = 'ip1'`).aviso).toMatch(comRls ? /permission denied for table EtiquetaImpressao/ : /EtiquetaImpressao_imutavel/);
          expect(comoP1(`DELETE FROM "AberturaDeLote" WHERE id = 'a1'`).aviso).toMatch(comRls ? /permission denied for table AberturaDeLote/ : /AberturaDeLote_imutavel/);
          // Rodada 1 (decisão 418): "Já imprimi" uma vez, num pedido de arquivo; não muda o resultado.
          expect(comoP1(`INSERT INTO "EtiquetaImpressao"(id,"parceiroId","lojaId","etiquetaId",sequencia,copias,transporte,situacao,"concluidaEm","solicitadaPorNome","chaveEnvio") VALUES ('ip3','p1','l1','e1',3,1,'ARQUIVO_ZPL','EXPORTADA',now(),'Duda','env-ip3-abcdef')`).ok).toBe(true);
          expect(comoP1(`UPDATE "EtiquetaImpressao" SET "confirmadaEm" = now(), "confirmadaPorNome" = 'Duda' WHERE id = 'ip3'`).ok).toBe(true);
          expect(comoP1(`UPDATE "EtiquetaImpressao" SET "confirmadaEm" = now(), "confirmadaPorNome" = 'Outra' WHERE id = 'ip3'`).aviso).toContain('EtiquetaImpressao_confere');
          // Rodada final: não nasce confirmado; a confirmação não fica no futuro.
          expect(comoP1(`INSERT INTO "EtiquetaImpressao"(id,"parceiroId","lojaId","etiquetaId",sequencia,copias,transporte,situacao,"concluidaEm","solicitadaPorNome","chaveEnvio","confirmadaEm","confirmadaPorNome") VALUES ('ip4','p1','l1','e1',4,1,'PAPEL','EXPORTADA',now(),'Duda','env-ip4-abcdef',now(),'Duda')`).aviso).toMatch(/nasce sem o "Já imprimi"/);
          expect(comoP1(`INSERT INTO "EtiquetaImpressao"(id,"parceiroId","lojaId","etiquetaId",sequencia,copias,transporte,situacao,"concluidaEm","solicitadaPorNome","chaveEnvio") VALUES ('ip5','p1','l1','e1',5,1,'PAPEL','EXPORTADA',now(),'Duda','env-ip5-abcdef')`).ok).toBe(true);
          expect(comoP1(`UPDATE "EtiquetaImpressao" SET "confirmadaEm" = now() + interval '1 day', "confirmadaPorNome" = 'Duda' WHERE id = 'ip5'`).aviso).toMatch(/não fica no futuro/);
          // Arquivo não é "enviada": o CHECK recusa a combinação.
          expect(comoP1(`INSERT INTO "EtiquetaImpressao"(id,"parceiroId","lojaId","etiquetaId",sequencia,copias,transporte,situacao,"concluidaEm","solicitadaPorNome") VALUES ('ip2','p1','l1','e1',2,1,'ARQUIVO_ZPL','ENVIADA',now(),'Duda')`).aviso).toContain('EtiquetaImpressao_resultado');

          if (perfil.rls) {
            // O outro parceiro não enxerga nem muda.
            const deP2 = (t: string) => psql(dono, ['-c', noContexto('p2', `SELECT count(*) FROM "${t}"`)]).saida.split('\n').pop();
            for (const t of ['AberturaDeLote', 'LoteDeInsumo', 'EtiquetaImpressao', 'Etiqueta']) expect(deP2(t), t).toBe('0');
            psql(dono, ['-c', noContexto('p2', `DELETE FROM "LoteDeInsumo"`)]);
            expect(psql(superuser, ['-c', `SELECT count(*) FROM "LoteDeInsumo"`]).saida).toBe('1');
          }

          expect(await conferirMigracao(db)).toEqual([]);
          // O conferidor acusa o que faltar (e diz qual migration rodar).
          expect(psql(superuser, ['-c', `DROP INDEX "EtiquetaImpressao_parceiroId_etiquetaId_sequencia_key"`]).ok).toBe(true);
          expect(psql(superuser, ['-c', `DROP TRIGGER "AberturaDeLote_confere" ON "AberturaDeLote"`]).ok).toBe(true);
          const pend = await conferirMigracao(db);
          expect(pend).toEqual([
            expect.stringMatching(/Índice EtiquetaImpressao_parceiroId_etiquetaId_sequencia_key NÃO existe: a migration 20261110000000_erp_etiquetas/),
            expect.stringMatching(/Gatilho AberturaDeLote_confere NÃO existe: a migration 20261110000000_erp_etiquetas/),
          ]);
          if (perfil.rls) {
            expect(psql(superuser, ['-c', `ALTER TABLE "LoteDeInsumo" NO FORCE ROW LEVEL SECURITY`]).ok).toBe(true);
            expect((await conferirMigracao(db)).join('\n')).toMatch(/Tabela LoteDeInsumo sem RLS forçada/);
          }
        } finally {
          await db.$disconnect();
        }
      });
    });
  }
});
