/** INT-1.6: migration real em três bancos novos; nenhum dado de aplicação externo. */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { comPosseAnalytics } from '@/lib/integracoes/core/posse-analytics';
import { conferirMigracao } from '../scripts/erp-conferir-migracao';
import { executarPsqlDeTeste } from './erp-psql-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACAO = '20261123000000_erp_integracao_pipeline';
const RAIZ = join(process.cwd(), 'prisma/migrations');
const temPsql = spawnSync('psql', ['--version']).status === 0;
const PERFIS = [
  { nome: 'superusuário', papel: '', rls: true },
  { nome: 'dono com RLS forçada', papel: 'ff_dono', rls: true },
  { nome: 'dono sem RLS', papel: 'ff_semrls', rls: false },
] as const;
const TABELAS = ['IntegracaoExecucao', 'IntegracaoPayload', 'IntegracaoSnapshot', 'KpiIfoodDia'];

function urlDe(banco: string, papel = '') {
  const u = new URL(URL_TESTE!);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
  u.pathname = `/${banco}`;
  u.search = '';
  if (papel) { u.username = papel; u.password = papel; }
  return u.toString();
}
const psql = executarPsqlDeTeste;
const papelExiste = (papel: string) => !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `SELECT count(*) FROM pg_roles WHERE rolname='${papel}'`]).saida === '1';

describe.skipIf(!URL_TESTE || !temPsql)('INT-1.6 · migration, catálogo e SQL direto em três perfis', { timeout: 480_000 }, () => {
  const sufixo = randomUUID().replaceAll('-', '').slice(0, 10);
  const bancos: string[] = [];
  afterAll(() => {
    for (const nome of bancos) {
      expect(nome).toMatch(/^ff_mig_int16_[a-z0-9_]+$/);
      const r = psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`]);
      expect(r.ok, r.aviso).toBe(true);
    }
  }, 120_000);

  for (const perfil of PERFIS) {
    it.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(`${perfil.nome}: legado intacto, acesso/fence reais, tenant, valores e detector de deriva`, async () => {
      const banco = `ff_mig_int16_${perfil.papel || 'su'}_${sufixo}`;
      const administrador = urlDe(banco);
      const dono = urlDe(banco, perfil.papel);
      const criacao = psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`]);
      expect(criacao.ok, criacao.aviso).toBe(true);
      bancos.push(banco);
      if (perfil.papel) expect(psql(administrador, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]).ok).toBe(true);
      for (const anterior of readdirSync(RAIZ).filter(n => /^\d{14}_/.test(n) && n < MIGRACAO).sort()) {
        const r = psql(dono, ['-f', join(RAIZ, anterior, 'migration.sql')]);
        expect(r.ok, `${anterior}: ${r.aviso}`).toBe(true);
      }
      const db = new PrismaClient({ datasources: { db: { url: administrador } } });
      const contexto = (p: string, sql: string) => `SELECT set_config('app.parceiro_id','${p}',true)${perfil.rls ? ",set_config('role','erp_tenant',true)" : ''}; ${sql}`;
      const como = (p: string, sql: string) => psql(dono, ['-c', contexto(p, sql)]);
      const exigir = (r: ReturnType<typeof psql>) => { expect(r.ok, r.aviso).toBe(true); return r.saida; };
      try {
        expect(await conferirMigracao(db)).toEqual([]);
        exigir(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status,"homologacaoDeIntegracao") VALUES ('p1','Sintético A','qa-int16-a','ATIVO',true),('p2','Sintético B','qa-int16-b','ATIVO',true)`]));
        exigir(psql(dono, ['-c', `INSERT INTO "IntegracaoApp"(id,provedor,ambiente,nome,categoria,"clientId","nomeDoSegredo",modulos,"estadoHomologacao","criadoPorNome","atualizadoEm") VALUES ('app','IFOOD','TEST','App sintético','TEST','qa-int16','IFOOD_TEST_CLIENT_SECRET','{ANALYTICS}','NAO_SE_APLICA','QA',now())`]));
        for (const p of ['p1', 'p2']) {
          exigir(como(p, `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l-${p}','${p}','Loja sintética','loja');
            INSERT INTO "IntegracaoConexao"(id,"parceiroId","lojaId",provedor,ambiente,"idExterno","nomeExterno","criadoPorNome","atualizadoEm") VALUES ('c-${p}','${p}','l-${p}','IFOOD','TEST','${randomUUID()}','Fictícia','QA',now());
            INSERT INTO "IntegracaoConexaoModulo"(id,"parceiroId","conexaoId","appId",modulo,estado,"ativadoEm","ativadoPorNome","criadoPorNome","atualizadoEm") VALUES ('m-${p}','${p}','c-${p}','app','ANALYTICS','ATIVO',now(),'QA','QA',now());
            INSERT INTO "LiberacaoDeModulo"(id,"parceiroId",modulo,liberado,"mudadoPorNome") VALUES ('g-${p}','${p}','integracao',true,'QA')`));
        }
        const legado = async () => ({
          parceiros: await db.parceiroFlow.findMany({ orderBy: { id: 'asc' } }),
          lojas: await db.loja.findMany({ orderBy: { id: 'asc' } }),
          apps: await db.integracaoApp.findMany(),
          conexoes: await db.integracaoConexao.findMany({ orderBy: { id: 'asc' } }),
          modulos: await db.integracaoConexaoModulo.findMany({ orderBy: { id: 'asc' } }),
          liberacoes: await db.liberacaoDeModulo.findMany({ orderBy: { id: 'asc' } }),
        });
        const antes = await legado();
        const aplicada = psql(dono, ['-f', join(RAIZ, MIGRACAO, 'migration.sql')]);
        expect(aplicada.ok, aplicada.aviso).toBe(true);
        expect(aplicada.aviso).not.toContain('WARNING');
        expect(await legado()).toEqual(antes);
        expect(await conferirMigracao(db)).toEqual([]);
        expect(await db.integracaoControle.findMany()).toMatchObject([{ id: 'IFOOD_ANALYTICS', pausada: false, donoAtual: null, proximaChamadaEm: null, bloqueadaAte: null }]);
        const instantes = await db.$queryRaw<{ tabela: string; coluna: string; tipo: string }[]>`SELECT table_name AS tabela,column_name AS coluna,data_type AS tipo FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('IntegracaoControle','IntegracaoExecucao','IntegracaoPayload','IntegracaoSnapshot','KpiIfoodDia') AND data_type LIKE 'timestamp%'`;
        expect(instantes.length).toBeGreaterThanOrEqual(10);
        expect(instantes.every(c => c.tipo === 'timestamp with time zone')).toBe(true);
        const politicas = await db.$queryRaw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('IntegracaoExecucao','IntegracaoPayload','IntegracaoSnapshot','KpiIfoodDia') ORDER BY relname`;
        expect(politicas.map(p => [p.relname, p.relrowsecurity, p.relforcerowsecurity])).toEqual([...TABELAS].sort().map(t => [t, perfil.rls, perfil.rls]));
        expect((await db.$queryRaw<{ pode: boolean }[]>`SELECT has_table_privilege('erp_tenant','"IntegracaoControle"','SELECT') OR has_table_privilege('erp_tenant','"IntegracaoControle"','UPDATE') AS pode`)[0].pode).toBe(false);
        const novaJanela = (id: string, p = 'p1', modulo = 'm-p1', dia = '2026-10-19') => `INSERT INTO "IntegracaoExecucao"(id,"parceiroId","moduloId",dia,tipo,ciclo,prioridade,"atualizadoEm") VALUES ('${id}','${p}','${modulo}','${dia}','D1','2026-10-20',1,now())`;
        exigir(como('p1', novaJanela('e1')));
        expect(como('p1', novaJanela('duplicada')).aviso).toContain('IntegracaoExecucao_parceiroId_moduloId_dia_perfil_key');
        expect(como('p1', novaJanela('fk', 'p1', 'm-p2')).ok).toBe(false);
        expect(como('p1', `UPDATE "IntegracaoExecucao" SET "parceiroId"='p2' WHERE id='e1'`).ok).toBe(false);
        expect(como('p1', `UPDATE "IntegracaoExecucao" SET dia='2026-10-20' WHERE id='e1'`).aviso).toMatch(/identidade da janela/);
        expect(como('p1', `UPDATE "IntegracaoExecucao" SET estado='EXECUTANDO' WHERE id='e1'`).aviso).toContain('IntegracaoExecucao_lease');
        expect(como('p1', `SELECT erp_integracao_fence('p1','e1',NULL,NULL)`).saida.endsWith('f')).toBe(true);
        expect(como('p2', `SELECT erp_integracao_exigir_acesso('p1','m-p1',NULL)`).saida.endsWith('f')).toBe(true);
        if (perfil.rls) expect(como('p2', `SELECT count(*) FROM "IntegracaoExecucao"`).saida.endsWith('0')).toBe(true);

        const lider = await comPosseAnalytics(dono, async posse => {
          await db.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { donoAtual: posse.id } });
          exigir(como('p1', `UPDATE "IntegracaoExecucao" SET estado='EXECUTANDO',geracao=1,dono='${posse.id}',"leaseAte"=clock_timestamp()+interval '120 seconds' WHERE id='e1'`));
          const acessoReal = como('p1', `SELECT erp_integracao_exigir_acesso('p1','m-p1','${posse.id}'),erp_integracao_fence('p1','e1',1,'${posse.id}')`);
          const sessoes = await db.$queryRaw<{ pid: number; application_name: string; classid: string; objid: string; objsubid: number }[]>`SELECT a.pid,a.application_name,l.classid::text,l.objid::text,l.objsubid FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid AND l.database=a.datid WHERE a.datname=current_database() AND l.locktype='advisory' AND l.classid=1179009358::oid AND l.objid=1::oid AND l.granted`;
          const viva = await db.$queryRaw<{ viva: boolean }[]>`SELECT erp_integracao_posse_viva(${posse.id}) AS viva`;
          const diagnostico = JSON.stringify({ psql: acessoReal, dono: posse.id, confirmar: await posse.confirmar(), viva, sessoes });
          expect(acessoReal.ok, diagnostico).toBe(true);
          expect(acessoReal.saida.split('\n').at(-1), diagnostico).toBe('t|t');
          expect(como('p1', `SET LOCAL timezone='America/Sao_Paulo'; SELECT "leaseAte">clock_timestamp() AND "leaseAte"<clock_timestamp()+interval '2 minutes' FROM "IntegracaoExecucao" WHERE id='e1'`).saida.endsWith('t')).toBe(true);
          exigir(como('p1', `INSERT INTO "IntegracaoPayload"(id,"parceiroId","execucaoId",geracao,pagina,"corpoOriginal",sha256,resposta,http) VALUES ('raw','p1','e1',1,1,'{"marca":"açaí"}','${'d'.repeat(64)}','{"marca":"açaí"}',200)`));
          expect(como('p1', `UPDATE "IntegracaoPayload" SET "corpoOriginal"='{}',resposta='{}' WHERE id='raw'`).ok).toBe(false);
          expect(como('p1', `INSERT INTO "IntegracaoPayload"(id,"parceiroId","execucaoId",geracao,pagina,"corpoOriginal",sha256,resposta,http) VALUES ('raw-errado','p1','e1',1,2,'{"marca":"açaí"}','${'d'.repeat(64)}','{}',200)`).aviso).toContain('IntegracaoPayload_corpo');
          // Tabelas temporárias não substituem as globais nas funções SECURITY DEFINER.
          expect(como('p1', `CREATE TEMP TABLE "IntegracaoControle"(id text,pausada boolean,"donoAtual" text); INSERT INTO "IntegracaoControle" VALUES ('IFOOD_ANALYTICS',true,NULL); SELECT erp_integracao_exigir_acesso('p1','m-p1','${posse.id}')`).saida.endsWith('t')).toBe(true);
          const snapshot = (id: string, n: number, total: number) => `INSERT INTO "IntegracaoSnapshot"(id,"parceiroId","execucaoId",geracao,situacao,"vazioOficial",hash,pedidos,"numeroGrupos") VALUES ('${id}','p1','e1',1,'PUBLICADO',false,'${'a'.repeat(64)}',${total},${n})`;
          const linha = (id: string, snap: string, chave: string, valor = '9007199254740991') => `INSERT INTO "KpiIfoodDia"(id,"parceiroId","snapshotId","chaveGrupo","orderStatus","salesChannel","deliveredBy",category,pedidos,gmv,"refundedTotalValue") VALUES ('${id}','p1','${snap}','${chave.repeat(64)}','NOVO','APP',NULL,NULL,3,${valor},-1)`;
          expect(como('p1', `${snapshot('incompleto', 2, 6)}; ${linha('ki','incompleto','b')}`).aviso).toMatch(/todos os seus grupos/);
          expect(como('p1', `${snapshot('duplicado', 2, 6)}; ${linha('kd1','duplicado','b')}; ${linha('kd2','duplicado','c')}`).aviso).toContain('KpiIfoodDia_grao_semantico_key');
          expect(como('p1', `${snapshot('overflow', 1, 3)}; ${linha('ko','overflow','b','9007199254740992')}`).aviso).toContain('KpiIfoodDia_valores');
          exigir(como('p1', `${snapshot('valido', 1, 3)}; ${linha('kv','valido','b')}`));
          expect(como('p1', linha('tardia','valido','c')).aviso).toMatch(/mesma transação/);
          expect(como('p1', `UPDATE "IntegracaoSnapshot" SET pedidos=99 WHERE id='valido'`).ok).toBe(false);
          expect(como('p1', `DELETE FROM "KpiIfoodDia" WHERE id='kv'`).ok).toBe(false);
          const valores = await db.kpiIfoodDia.findUniqueOrThrow({ where: { id: 'kv' } });
          expect(valores).toMatchObject({ pedidos: 3n, gmv: 9007199254740991n, refundedTotalValue: -1n, netDeliveryFee: null });
          if (perfil.rls) {
            for (const tabela of TABELAS) expect(como('p2', `SELECT count(*) FROM "${tabela}"`).saida.endsWith('0'), tabela).toBe(true);
          }
          expect(como('p1', `SELECT erp_integracao_adiar('p2','e1',1,'${posse.id}','2099-01-02T03:04:05.678Z'::timestamptz,false)`).saida.endsWith('f')).toBe(true);
          expect(como('p1', `SET LOCAL timezone='America/Sao_Paulo'; SELECT erp_integracao_adiar('p1','e1',1,'${posse.id}','2099-01-02T03:04:05.678Z'::timestamptz,false)`).saida.endsWith('t')).toBe(true);
          expect((await db.integracaoControle.findUniqueOrThrow({ where: { id: 'IFOOD_ANALYTICS' } })).bloqueadaAte!.toISOString()).toBe('2099-01-02T03:04:05.678Z');
          expect(como('p1', `SELECT erp_integracao_exigir_acesso('p1','m-p1','${posse.id}'),erp_integracao_fence('p1','e1',1,'${posse.id}')`).saida.endsWith('f|t')).toBe(true);
          expect(como('p1', `SELECT erp_integracao_adiar('p1','e1',1,'${posse.id}','2098-01-01T00:00:00Z'::timestamptz,false)`).saida.endsWith('t')).toBe(true);
          expect((await db.integracaoControle.findUniqueOrThrow({ where: { id: 'IFOOD_ANALYTICS' } })).bloqueadaAte!.toISOString()).toBe('2099-01-02T03:04:05.678Z');
          expect(await db.auditLog.count({ where: { evento: 'integracao.analytics-retomada' } })).toBe(1);
          return posse.id;
        });
        expect(lider).toBeTruthy();
        expect(como('p1', `SELECT erp_integracao_fence('p1','e1',1,'${lider}')`).saida.endsWith('f')).toBe(true);

        // Cada sabotagem é desfeita antes da seguinte; o detector precisa ver proteção efetiva.
        const [indice] = await db.$queryRaw<{ definicao: string }[]>`SELECT pg_get_indexdef(indexrelid) AS definicao FROM pg_index WHERE indexrelid='"KpiIfoodDia_grao_semantico_key"'::regclass`;
        await db.$executeRawUnsafe('DROP INDEX "KpiIfoodDia_grao_semantico_key"');
        try { expect((await conferirMigracao(db)).join('\n')).toMatch(/KpiIfoodDia_grao_semantico_key/); }
        finally { await db.$executeRawUnsafe(indice.definicao); }
        await db.$executeRawUnsafe('ALTER TABLE "IntegracaoSnapshot" DISABLE TRIGGER "IntegracaoSnapshot_completude"');
        try { expect((await conferirMigracao(db)).join('\n')).toMatch(/IntegracaoSnapshot_completude/); }
        finally { await db.$executeRawUnsafe('ALTER TABLE "IntegracaoSnapshot" ENABLE TRIGGER "IntegracaoSnapshot_completude"'); }
        await db.$executeRawUnsafe('GRANT SELECT ON "IntegracaoControle" TO erp_tenant');
        try { expect((await conferirMigracao(db)).join('\n')).toMatch(/IntegracaoControle/); }
        finally { await db.$executeRawUnsafe('REVOKE SELECT ON "IntegracaoControle" FROM erp_tenant'); }
        if (perfil.rls) {
          await db.$executeRawUnsafe('ALTER TABLE "IntegracaoPayload" NO FORCE ROW LEVEL SECURITY');
          try { expect((await conferirMigracao(db)).join('\n')).toMatch(/IntegracaoPayload/); }
          finally { await db.$executeRawUnsafe('ALTER TABLE "IntegracaoPayload" FORCE ROW LEVEL SECURITY'); }
        }
        expect(await conferirMigracao(db)).toEqual([]);
      } finally { await db.$disconnect(); }
    });
  }
});
