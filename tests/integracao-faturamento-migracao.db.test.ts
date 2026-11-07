/** INT-1.7B: catálogo e protocolo SQL reais; três bancos exclusivamente sintéticos. */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { comPosseAnalytics } from '@/lib/integracoes/core/posse-analytics';
import { conferirMigracao, conferirPonteAnalytics } from '../scripts/erp-conferir-migracao';
import { executarPsqlDeTeste } from './erp-psql-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACAO = '20261125000000_erp_integracao_faturamento';
const RAIZ = join(process.cwd(), 'prisma/migrations');
const temPsql = spawnSync('psql', ['--version']).status === 0;
const PERFIS = [
  { nome: 'superusuário', papel: '', rls: true },
  { nome: 'dono com RLS forçada', papel: 'ff_dono', rls: true },
  { nome: 'dono sem RLS', papel: 'ff_semrls', rls: false },
] as const;
const psql = executarPsqlDeTeste;
const MERCHANT = '11111111-1111-4111-8111-111111111111';
const DIA = '2026-10-19';
const HASH = 'a'.repeat(64);

function urlDe(banco: string, papel = '') {
  const u = new URL(URL_TESTE!);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
  u.pathname = `/${banco}`; u.search = '';
  if (papel) { u.username = papel; u.password = papel; }
  return u.toString();
}
const papelExiste = (papel: string) => !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `SELECT count(*) FROM pg_roles WHERE rolname='${papel}'`]).saida === '1';
// SQL fechado, dados fixos do teste; nenhuma entrada externa é interpolada.
function lancamento(id: string, origem: 'MANUAL' | 'IMPORTACAO' | 'INTEGRACAO', data = '2026-11-01', analytics = false) {
  const chave = analytics ? `ifood-analytics:dia:${MERCHANT}:${data}` : origem === 'INTEGRACAO' ? `fixture:dia:${id}` : `manual:${id}`;
  return `INSERT INTO "FaturamentoLancamento"(id,"parceiroId","lojaId",canal,data,"valorCentavos",pedidos,clientes,origem,"chaveIdempotencia","origemRef","atualizadoEm")
    VALUES ('${id}','p1','l-p1','IFOOD','${data}',600,3,${analytics ? 'NULL' : '2'},'${origem}','${chave}','${analytics ? 'ifood-analytics:s1' : 'fixture:' + id}',now())`;
}

describe.skipIf(!URL_TESTE || !temPsql)('INT-1.7B · migration e protocolo financeiro nos três perfis', { timeout: 480_000 }, () => {
  const sufixo = randomUUID().replaceAll('-', '').slice(0, 10);
  const bancos: string[] = [];
  afterAll(() => {
    for (const banco of bancos) {
      expect(banco).toMatch(/^ff_mig_ponte_[a-z0-9_]+$/);
      const r = psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`]);
      expect(r.ok, r.aviso).toBe(true);
    }
  }, 360_000);

  for (const perfil of PERFIS) {
    it.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(`${perfil.nome}: legado, posse, marker, fontes, namespace, tenant e sabotagens`, async () => {
      const banco = `ff_mig_ponte_${perfil.papel || 'su'}_${sufixo}`;
      const administrador = urlDe(banco), dono = urlDe(banco, perfil.papel);
      const exigir = (r: ReturnType<typeof psql>) => { expect(r.ok, r.aviso).toBe(true); return r.saida; };
      exigir(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]));
      bancos.push(banco);
      if (perfil.papel) exigir(psql(administrador, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]));
      for (const anterior of readdirSync(RAIZ).filter(n => /^\d{14}_/.test(n) && n < MIGRACAO).sort()) {
        const r = psql(dono, ['-f', join(RAIZ, anterior, 'migration.sql')]);
        expect(r.ok, `${anterior}: ${r.aviso}`).toBe(true);
      }
      const como = (p: string, sql: string, papel = perfil.rls) => psql(dono, ['-c', `SELECT set_config('app.parceiro_id','${p}',true)${papel ? ",set_config('role','erp_tenant',true)" : ''}; ${sql}`]);
      const recusar = (sql: string, trecho: string | RegExp, papel = perfil.rls) => {
        const r = como('p1', sql, papel); expect(r.ok, r.saida).toBe(false); expect(r.aviso).toMatch(trecho);
      };
      const db = new PrismaClient({ datasources: { db: { url: administrador } } });
      try {
        expect(await conferirPonteAnalytics(db)).toEqual([]);
        expect(await conferirMigracao(db)).toEqual([]);
        exigir(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','Sintético A','qa-ponte-a','ATIVO'),('p2','Sintético B','qa-ponte-b','ATIVO');
          INSERT INTO "IntegracaoApp"(id,provedor,ambiente,nome,categoria,"clientId","nomeDoSegredo",modulos,"estadoHomologacao","criadoPorNome","atualizadoEm")
          VALUES ('app','IFOOD','PRODUCAO','App sintético','BI','qa-ponte','IFOOD_BI_CLIENT_SECRET','{ANALYTICS}','HOMOLOGADO','QA',now())` ]));
        for (const p of ['p1', 'p2']) exigir(como(p, `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l-${p}','${p}','Loja sintética','loja')`));
        exigir(como('p1', `INSERT INTO "IntegracaoConexao"(id,"parceiroId","lojaId",provedor,ambiente,"idExterno","nomeExterno","criadoPorNome","atualizadoEm") VALUES ('c1','p1','l-p1','IFOOD','PRODUCAO','${MERCHANT}','Fictícia','QA',now());
          INSERT INTO "IntegracaoConexaoModulo"(id,"parceiroId","conexaoId","appId",modulo,estado,"ativadoEm","ativadoPorNome","criadoPorNome","atualizadoEm") VALUES ('m1','p1','c1','app','ANALYTICS','ATIVO',now(),'QA','QA',now());
          INSERT INTO "LiberacaoDeModulo"(id,"parceiroId",modulo,liberado,"mudadoPorNome") VALUES ('g1','p1','integracao',true,'QA');
          ${lancamento('manual', 'MANUAL')}; ${lancamento('csv', 'IMPORTACAO', '2026-11-02')}; ${lancamento('outra', 'INTEGRACAO')}`));
        const legado = () => db.$queryRaw`SELECT * FROM "FaturamentoLancamento" WHERE id IN ('manual','csv','outra') ORDER BY id`;
        const antigos = await legado();
        const aplicada = psql(dono, ['-f', join(RAIZ, MIGRACAO, 'migration.sql')]);
        expect(aplicada.ok, aplicada.aviso).toBe(true); expect(aplicada.aviso).not.toContain('WARNING');
        expect(await legado()).toEqual(antigos);
        const catalogo = await db.$queryRaw`SELECT c.conname,pg_get_expr(c.conbin,c.conrelid) AS expressao FROM pg_constraint c WHERE c.conrelid IN ('"IntegracaoFaturamentoDia"'::regclass,'"IntegracaoFaturamentoFonte"'::regclass) AND c.contype='c' ORDER BY c.conname`;
        expect(await conferirMigracao(db), JSON.stringify(catalogo)).toEqual([]);
        const meta = await db.$queryRaw<{ tabela: string; ativa: boolean; forcada: boolean }[]>`SELECT relname AS tabela,relrowsecurity AS ativa,relforcerowsecurity AS forcada FROM pg_class WHERE relname IN ('IntegracaoFaturamentoDia','IntegracaoFaturamentoFonte') ORDER BY relname`;
        expect(meta).toEqual(['IntegracaoFaturamentoDia', 'IntegracaoFaturamentoFonte'].map(tabela => ({ tabela, ativa: perfil.rls, forcada: perfil.rls })));
        const [acl] = await db.$queryRaw<{ escrita: boolean; privada: boolean }[]>`SELECT has_table_privilege('erp_tenant','"IntegracaoFaturamentoDia"','INSERT') OR has_table_privilege('erp_tenant','"IntegracaoFaturamentoDia"','UPDATE') OR has_table_privilege('erp_tenant','"IntegracaoFaturamentoDia"','DELETE') AS escrita,
          has_function_privilege('erp_tenant','erp_integracao_faturamento_validar(text,text)','EXECUTE') AS privada`;
        expect(acl).toEqual({ escrita: false, privada: false });
        recusar(lancamento('forjado', 'INTEGRACAO', DIA, true), /preparação financeira/);
        expect(como('p2', `SELECT erp_integracao_travar_cobertura('p1','l-p1')`).ok).toBe(false);
        // Legado de outra integração continua permitido onde a ponte não ocupa o grão.
        exigir(como('p1', lancamento('outra-depois', 'INTEGRACAO', '2026-11-03')));

        const resultado = await comPosseAnalytics(dono, async posse => {
          await db.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { donoAtual: posse.id } });
          exigir(como('p1', `INSERT INTO "IntegracaoExecucao"(id,"parceiroId","moduloId",dia,tipo,ciclo,prioridade,"atualizadoEm") VALUES ('e1','p1','m1','${DIA}','D1','2026-10-20',1,now());
            UPDATE "IntegracaoExecucao" SET estado='EXECUTANDO',geracao=1,dono='${posse.id}',"leaseAte"=clock_timestamp()+interval '120 seconds' WHERE id='e1';
            INSERT INTO "IntegracaoSnapshot"(id,"parceiroId","execucaoId",geracao,situacao,"vazioOficial",hash,pedidos,"numeroGrupos") VALUES ('s1','p1','e1',1,'PUBLICADO',false,'${HASH}',3,1);
            INSERT INTO "KpiIfoodDia"(id,"parceiroId","snapshotId","chaveGrupo","orderStatus","salesChannel","deliveredBy",category,pedidos,"gmvWithoutDelivery") VALUES ('k1','p1','s1','${'b'.repeat(64)}','CONCLUDED','IFOOD','MERCHANT_DELIVERY','FOOD',3,600);
            SELECT erp_integracao_faturamento_sinalizar('p1','s1','${posse.id}')`));
          const [recibo] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "IntegracaoFaturamentoDia" WHERE "parceiroId"='p1'`;
          expect(recibo.id).toBeTruthy();
          const preparar = `SELECT erp_integracao_faturamento_preparar('p1','l-p1','${DIA}','${posse.id}')`;
          const concluir = (igual = false) => `SELECT erp_integracao_faturamento_concluir('p1','${recibo.id}','${posse.id}','${HASH}',1,${igual})`;
          const fonte = `INSERT INTO "IntegracaoFaturamentoFonte"(id,"parceiroId","reciboId",dia,"merchantId","conexaoId","moduloId","snapshotId","lancamentoId","atualizadoEm") VALUES ('f1','p1','${recibo.id}','${DIA}','${MERCHANT}','c1','m1','s1','analytics',now())`;
          // Prova também no fallback dono sem papel: uma escrita normal não cria
          // marker sem prefixo. DDL/desativar triggers pelo owner não é ameaça coberta.
          recusar(`UPDATE "IntegracaoFaturamentoDia" SET "transacaoAplicacao"=txid_current(),"donoAplicacao"='${posse.id}' WHERE id='${recibo.id}'`, /prefixo de locks/, false);
          recusar(`UPDATE "IntegracaoFaturamentoDia" SET "hashAplicado"='${HASH}',"versaoMapaAplicada"=1,"aplicadoEm"=now(),estado='APLICADO' WHERE id='${recibo.id}'`, /preparação/, false);
          recusar(`UPDATE "IntegracaoFaturamentoDia" SET "transacaoAplicacao"=txid_current(),"donoAplicacao"='${posse.id}' WHERE id='${recibo.id}'`, /permission denied/, true);
          recusar(fonte, /preparação financeira/);
          if (perfil.rls) expect(exigir(como('p2', 'SELECT count(*) FROM "IntegracaoFaturamentoDia"')).split('\n').at(-1)).toBe('0');
          recusar(`${preparar}; ${lancamento('sem-fonte', 'INTEGRACAO', DIA, true)}; ${concluir()}`, /incompleto|sem fonte/);
          expect(await db.faturamentoLancamento.count({ where: { id: 'sem-fonte' } })).toBe(0);
          exigir(como('p1', `${preparar}; ${lancamento('analytics', 'INTEGRACAO', DIA, true)}; ${fonte}; ${concluir()}`));
          const antesReplay = await db.integracaoFaturamentoDia.findUniqueOrThrow({ where: { id: recibo.id } });
          expect(antesReplay).toMatchObject({ estado: 'APLICADO', hashAplicado: HASH, versaoMapaAplicada: 1, revisaoSolicitada: 1n, revisaoConferida: 1n });
          expect(await db.faturamentoLancamento.findUniqueOrThrow({ where: { id: 'analytics' } })).toMatchObject({ valorCentavos: 600, pedidos: 3, clientes: null });
          exigir(como('p1', `${preparar}; ${concluir(true)}`));
          expect((await db.integracaoFaturamentoDia.findUniqueOrThrow({ where: { id: recibo.id } })).aplicadoEm).toEqual(antesReplay.aplicadoEm);
          recusar(`${preparar}; UPDATE "FaturamentoLancamento" SET "valorCentavos"=601 WHERE id='analytics'; ${concluir()}`, /diverge/);
          recusar(`${preparar}; UPDATE "FaturamentoLancamento" SET "valorCentavos"=601 WHERE id='analytics'; SELECT erp_integracao_faturamento_pendencia('p1','${recibo.id}','${posse.id}','ACESSO')`, /não foi concluída/);
          recusar(`UPDATE "FaturamentoLancamento" SET "valorCentavos"=601 WHERE id='analytics'`, /preparação financeira/);
          recusar(`DELETE FROM "FaturamentoLancamento" WHERE id='analytics'`, /não pode ser removido/);
          recusar(`DELETE FROM "IntegracaoFaturamentoFonte" WHERE id='f1'`, perfil.rls ? /permission denied/ : /não pode ser removida/);
          recusar(`${preparar}; UPDATE "IntegracaoFaturamentoFonte" SET "merchantId"='22222222-2222-4222-8222-222222222222' WHERE id='f1'`, /imutáveis/);
          recusar(lancamento('colisao', 'INTEGRACAO', DIA), /Outra integração/);
          exigir(como('p1', `UPDATE "IntegracaoConexaoModulo" SET estado='ERRO_PERMISSAO',"ultimoErro"='403 sintético da prova de revogação',"ultimoErroEm"=clock_timestamp() WHERE id='m1'`));
          const p = exigir(como('p1', `${preparar}; SELECT erp_integracao_faturamento_pendencia('p1','${recibo.id}','${posse.id}','ACESSO')`));
          expect(p).toContain('"motivo": "ACESSO"');
          expect(await db.integracaoFaturamentoDia.findUniqueOrThrow({ where: { id: recibo.id } })).toMatchObject({ estado: 'PENDENTE_ACESSO', motivo: 'ACESSO', hashAplicado: HASH, aplicadoEm: antesReplay.aplicadoEm });
          expect(await db.faturamentoLancamento.findUniqueOrThrow({ where: { id: 'analytics' } })).toMatchObject({ valorCentavos: 600, pedidos: 3, clientes: null });
          return recibo.id;
        });
        expect(resultado).toBeTruthy();
        expect(await legado()).toEqual(antigos);

        // Cada sabotagem é revertida na mesma TX; o checker deve apontar o
        // contrato quebrado e o catálogo deve voltar integralmente ao GREEN.
        const desfazer = new Error('rollback sintético');
        async function sabotagem(sql: string | string[], nome: string) {
          await expect(db.$transaction(async tx => {
            for (const comando of typeof sql === 'string' ? [sql] : sql) await tx.$executeRawUnsafe(comando);
            expect((await conferirPonteAnalytics(tx)).join('\n')).toContain(nome);
            throw desfazer;
          })).rejects.toBe(desfazer);
          expect(await conferirMigracao(db)).toEqual([]);
        }
        await sabotagem('ALTER TABLE "IntegracaoFaturamentoDia" DISABLE TRIGGER "IFFDia_completo"', 'IFFDia_completo');
        await sabotagem('GRANT UPDATE ON "IntegracaoFaturamentoDia" TO erp_tenant', 'IntegracaoFaturamentoDia');
        await sabotagem('GRANT EXECUTE ON FUNCTION erp_integracao_faturamento_preparar(text,text,date,text) TO PUBLIC', 'erp_integracao_faturamento_preparar');
        await sabotagem('ALTER FUNCTION erp_integracao_faturamento_preparar(text,text,date,text) RESET search_path', 'erp_integracao_faturamento_preparar');
        await sabotagem('DROP INDEX "IFFFonte_merchant_dia_key"', 'IFFFonte_merchant_dia_key');
        await sabotagem('ALTER TABLE "IntegracaoFaturamentoFonte" DROP CONSTRAINT "IFFFonte_modulo_fkey"', 'IFFFonte_modulo_fkey');
        await sabotagem('ALTER TABLE "IntegracaoFaturamentoDia" DROP CONSTRAINT "IFFDia_preparacao"', 'IFFDia_preparacao');
        await sabotagem(['ALTER TABLE "IntegracaoFaturamentoDia" DROP CONSTRAINT "IFFDia_preparacao"', 'ALTER TABLE "IntegracaoFaturamentoDia" ADD CONSTRAINT "IFFDia_preparacao" CHECK(true)'], 'IFFDia_preparacao');
        await sabotagem(['ALTER TABLE "IntegracaoFaturamentoFonte" DROP CONSTRAINT "IFFFonte_merchant"', `ALTER TABLE "IntegracaoFaturamentoFonte" ADD CONSTRAINT "IFFFonte_merchant" CHECK("merchantId" ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$')`], 'IFFFonte_merchant');
        if (perfil.rls) await sabotagem('ALTER TABLE "IntegracaoFaturamentoFonte" NO FORCE ROW LEVEL SECURITY', 'IntegracaoFaturamentoFonte');
        expect(await legado()).toEqual(antigos);
      } finally { await db.$disconnect(); }
    });
  }
});
