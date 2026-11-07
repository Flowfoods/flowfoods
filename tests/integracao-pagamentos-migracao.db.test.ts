/** INT-1.8C: aplica 57 sobre legado real em três perfis; somente bancos sintéticos locais. */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { comPosseAnalytics } from '@/lib/integracoes/core/posse-analytics';
import { conferirMigracao, conferirPagamentosAnalytics } from '../scripts/erp-conferir-migracao';
import { executarPsqlDeTeste } from './erp-psql-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACAO = '20261126000000_erp_integracao_pagamentos';
const RAIZ = join(process.cwd(), 'prisma/migrations');
const temPsql = spawnSync('psql', ['--version']).status === 0;
const psql = executarPsqlDeTeste;
const PERFIS = [
  { nome: 'superusuário', papel: '', rls: true },
  { nome: 'dono com RLS forçada', papel: 'ff_dono', rls: true },
  { nome: 'dono sem RLS', papel: 'ff_semrls', rls: false },
] as const;
const HASH = '1'.repeat(64), OUTRO_HASH = '2'.repeat(64);
const PREFIXO = `SELECT pg_advisory_xact_lock_shared(hashtextextended('erp-faturamento:p1',0))`;
// Literal SQL de massa sintética fechada; não recebe entrada do aplicativo.
const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;
const envelope = (paymentMethod: unknown) => JSON.stringify({ currentPage: 1, size: 1, totalItems: 1, totalPages: 1, data: [{ paymentMethod }] });
const RAW = envelope({ value: { PIX: 2, VOUCHER: 0, null: 3, constructor: 4, ['__proto__']: 5 }, cardinality: 5 });
const PARCELAS = [{ metodo: 'PIX', ocorrencias: '2' }, { metodo: 'VOUCHER', ocorrencias: '0' }, { metodo: 'null', ocorrencias: '3' }, { metodo: 'constructor', ocorrencias: '4' }, { metodo: '__proto__', ocorrencias: '5' }];

function urlDe(banco: string, papel = '') {
  const u = new URL(URL_TESTE!);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
  u.pathname = `/${banco}`; u.search = '';
  if (papel) { u.username = papel; u.password = papel; }
  return u.toString();
}
const papelExiste = (papel: string) => !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `SELECT count(*) FROM pg_roles WHERE rolname=${literal(papel)}`]).saida === '1';
function janela(id: string, dono: string, dia = '2026-10-23', perfil = 'pagamentos') {
  return `INSERT INTO "IntegracaoExecucao"(id,"parceiroId","moduloId",dia,perfil,tipo,ciclo,prioridade,"atualizadoEm") VALUES (${literal(id)},'p1','m1',${literal(dia)},${literal(perfil)},'D1','2026-10-21',1,now());
    UPDATE "IntegracaoExecucao" SET estado='EXECUTANDO',geracao=1,dono=${literal(dono)},"leaseAte"=clock_timestamp()+interval '120 seconds',"iniciadaEm"=clock_timestamp() WHERE id=${literal(id)}`;
}
function recibo(id: string, raw: string, versao: number | null = 1, geracao = 1, pagina = 1) {
  const hash = createHash('sha256').update(raw).digest('hex');
  return `INSERT INTO "IntegracaoPayload"(id,"parceiroId","execucaoId",geracao,pagina,sha256,"corpoOriginal",resposta,http,"versaoContrato")
    VALUES (${literal(`${id}-g${geracao}-p${pagina}`)},'p1',${literal(id)},${geracao},${pagina},${literal(hash)},${literal(raw)},${literal(raw)}::jsonb,200,${versao ?? 'NULL'})`;
}
function fotografia(id: string, parcelas: unknown, situacao = 'PUBLICADO', hash = HASH) {
  return `INSERT INTO "IntegracaoPagamentoSnapshot"(id,"parceiroId","execucaoId",geracao,"versaoContrato",situacao,parcelas,hash)
    VALUES (${literal(`s-${id}`)},'p1',${literal(id)},1,1,${literal(situacao)},${parcelas === null ? 'NULL' : `${literal(JSON.stringify(parcelas))}::jsonb`},${literal(hash)})`;
}
function concluir(id: string, estado = 'SUCESSO', hash = HASH) {
  return `UPDATE "IntegracaoExecucao" SET estado=${literal(estado)},"ultimoHash"=${literal(hash)},dono=NULL,"leaseAte"=NULL,"concluidaEm"=clock_timestamp() WHERE id=${literal(id)}`;
}

describe.skipIf(!URL_TESTE || !temPsql)('INT-1.8C · migration marginal e catálogo', { timeout: 480_000 }, () => {
  const sufixo = randomUUID().replaceAll('-', '').slice(0, 10), bancos: string[] = [];
  afterAll(() => {
    for (const banco of bancos) {
      expect(banco).toMatch(/^ff_mig_pagamentos_[a-z0-9_]+$/);
      const r = psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`]);
      expect(r.ok, r.aviso).toBe(true);
    }
  }, 360_000);

  for (const perfil of PERFIS) it.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(`${perfil.nome}: legado, raw exato, publicação, isolamento e sabotagens`, async () => {
    const banco = `ff_mig_pagamentos_${perfil.papel || 'su'}_${sufixo}`;
    const administrador = urlDe(banco), dono = urlDe(banco, perfil.papel);
    const exigir = (r: ReturnType<typeof psql>) => { expect(r.ok, r.aviso).toBe(true); return r.saida; };
    exigir(psql(urlDe('postgres'), ['-c', `CREATE DATABASE ${banco}${perfil.papel ? ` OWNER ${perfil.papel}` : ''}`])); bancos.push(banco);
    if (perfil.papel) exigir(psql(administrador, ['-c', `ALTER SCHEMA public OWNER TO ${perfil.papel}`]));
    for (const anterior of readdirSync(RAIZ).filter(n => /^\d{14}_/.test(n) && n < MIGRACAO).sort()) {
      const r = psql(dono, ['-f', join(RAIZ, anterior, 'migration.sql')]);
      expect(r.ok, `${anterior}: ${r.aviso}`).toBe(true);
    }
    const como = (parceiro: string, sql: string, papel = perfil.rls) => psql(dono, ['-c', `SELECT set_config('app.parceiro_id',${literal(parceiro)},true)${papel ? ",set_config('role','erp_tenant',true)" : ''}; ${sql}`]);
    const recusar = (sql: string, trecho: string | RegExp, papel = perfil.rls) => {
      const r = como('p1', sql, papel); expect(r.ok, r.saida).toBe(false); expect(r.aviso).toMatch(trecho);
    };
    const db = new PrismaClient({ datasources: { db: { url: administrador } } });
    try {
      expect(await conferirPagamentosAnalytics(db)).toEqual([]);
      expect(await conferirMigracao(db)).toEqual([]);
      exigir(psql(dono, ['-c', `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','Sintético A','qa-pagamentos-a','ATIVO'),('p2','Sintético B','qa-pagamentos-b','ATIVO');
        INSERT INTO "IntegracaoApp"(id,provedor,ambiente,nome,categoria,"clientId","nomeDoSegredo",modulos,"estadoHomologacao","criadoPorNome","atualizadoEm")
          VALUES ('app','IFOOD','PRODUCAO','App sintético','BI','qa-pagamentos','IFOOD_BI_CLIENT_SECRET','{ANALYTICS}','HOMOLOGADO','QA',now())`]));
      for (const p of ['p1', 'p2']) exigir(como(p, `INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l-${p}','${p}','Loja sintética','loja')`));
      exigir(como('p1', `INSERT INTO "IntegracaoConexao"(id,"parceiroId","lojaId",provedor,ambiente,"idExterno","nomeExterno","criadoPorNome","atualizadoEm") VALUES ('c1','p1','l-p1','IFOOD','PRODUCAO','11111111-1111-4111-8111-111111111111','Fictícia','QA',now());
        INSERT INTO "IntegracaoConexaoModulo"(id,"parceiroId","conexaoId","appId",modulo,estado,"ativadoEm","ativadoPorNome","criadoPorNome","atualizadoEm") VALUES ('m1','p1','c1','app','ANALYTICS','ATIVO',now(),'QA','QA',now());
        INSERT INTO "LiberacaoDeModulo"(id,"parceiroId",modulo,liberado,"mudadoPorNome") VALUES ('g1','p1','integracao',true,'QA');
        INSERT INTO "FaturamentoLancamento"(id,"parceiroId","lojaId",canal,data,"valorCentavos",pedidos,clientes,origem,"chaveIdempotencia","atualizadoEm") VALUES ('humano','p1','l-p1','IFOOD','2026-11-01',1200,4,2,'MANUAL','manual:humano',now())`));
      const financeiro = () => db.$queryRaw`SELECT * FROM "FaturamentoLancamento" ORDER BY id`;
      const financeiroAntes = await financeiro();
      const resultado = await comPosseAnalytics(dono, async posse => {
        await db.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { donoAtual: posse.id } });
        // Recibo e fotografia diários criados ANTES de 57; nenhum backfill é permitido.
        const rawLegado = '{"data":[]}';
        exigir(como('p1', `${janela('legado', posse.id, '2026-10-19', 'diario')};
          INSERT INTO "IntegracaoPayload"(id,"parceiroId","execucaoId",geracao,pagina,sha256,"corpoOriginal",resposta,http) VALUES ('raw-legado','p1','legado',1,1,'${createHash('sha256').update(rawLegado).digest('hex')}',${literal(rawLegado)},${literal(rawLegado)}::jsonb,200);
          INSERT INTO "IntegracaoSnapshot"(id,"parceiroId","execucaoId",geracao,situacao,"vazioOficial",hash,pedidos,"numeroGrupos") VALUES ('s-legado','p1','legado',1,'PUBLICADO',true,'${HASH}',0,0)`));
        const legado = () => db.$queryRaw`SELECT id,"parceiroId","execucaoId",geracao,pagina,sha256,"corpoOriginal",resposta,http,"recebidoEm" FROM "IntegracaoPayload" WHERE id='raw-legado'`;
        const snapshots = () => db.$queryRaw`SELECT * FROM "IntegracaoSnapshot" ORDER BY id`;
        const brutoAntes = await legado(), diarioAntes = await snapshots();
        const aplicada = psql(dono, ['-f', join(RAIZ, MIGRACAO, 'migration.sql')]);
        expect(aplicada.ok, aplicada.aviso).toBe(true); expect(aplicada.aviso).not.toContain('WARNING');
        const catalogo = await db.$queryRaw`SELECT c.conname,pg_get_expr(c.conbin,c.conrelid) AS expressao FROM pg_constraint c WHERE c.conname IN ('IPagSnapshot_identidade','IPagSnapshot_estado','IPagSnapshot_parcelas','IntegracaoPayload_versao_contrato','IntegracaoExecucao_perfil_tipo') ORDER BY c.conname`;
        const triggers = await db.$queryRaw`SELECT tgname,pg_get_triggerdef(oid,false) AS definicao FROM pg_trigger WHERE tgname='IPagExec_completude'`;
        expect(await conferirMigracao(db), JSON.stringify({ catalogo, triggers })).toEqual([]);
        expect(await legado()).toEqual(brutoAntes); expect(await snapshots()).toEqual(diarioAntes);
        expect(await db.$queryRaw`SELECT "versaoContrato" FROM "IntegracaoPayload" WHERE id='raw-legado'`).toEqual([{ versaoContrato: null }]);
        const publicar = (id: string, dia: string, raw: string, parcelas: unknown) => `${PREFIXO}; ${janela(id, posse.id, dia)}; ${recibo(id, raw)}; ${fotografia(id, parcelas)}; ${concluir(id)}`;
        exigir(como('p1', publicar('mapa', '2026-10-20', RAW, PARCELAS)));
        exigir(como('p1', publicar('ausente', '2026-10-21', envelope(null), null)));
        exigir(como('p1', publicar('vazio', '2026-10-22', envelope({ value: {} }), [])));
        const lidas = await db.$queryRaw<{ id: string; parcelas: unknown; nulo: boolean }[]>`SELECT id,parcelas,parcelas IS NULL AS nulo FROM "IntegracaoPagamentoSnapshot" ORDER BY id`;
        expect(lidas).toEqual([
          { id: 's-ausente', parcelas: null, nulo: true },
          { id: 's-mapa', parcelas: PARCELAS, nulo: false },
          { id: 's-vazio', parcelas: [], nulo: false },
        ]);
        expect(await snapshots()).toEqual(diarioAntes); expect(await financeiro()).toEqual(financeiroAntes);
        expect(await db.integracaoFaturamentoDia.count()).toBe(0);
        if (perfil.rls) {
          expect(exigir(como('p2', 'SELECT count(*) FROM "IntegracaoPagamentoSnapshot"')).split('\n').at(-1)).toBe('0');
          expect(exigir(psql(dono, ['-c', 'SET ROLE erp_tenant; SELECT count(*) FROM "IntegracaoPagamentoSnapshot"'])).split('\n').at(-1)).toBe('0');
        }
        for (const sql of ['UPDATE "IntegracaoPagamentoSnapshot" SET parcelas=\'[]\'::jsonb', 'DELETE FROM "IntegracaoPagamentoSnapshot"', 'TRUNCATE "IntegracaoPagamentoSnapshot"']) recusar(sql, /permission denied|imutável/);
        recusar("SELECT erp_integracao_pagamento_normalizar('{}')", /permission denied/, true);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW, null)}`, /Versão incompatível/);
        recusar(`${PREFIXO}; ${recibo('legado', rawLegado, 1, 1, 2)}`, /Versão incompatível/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${fotografia('erro', [...PARCELAS, { metodo: 'PIX', ocorrencias: '2' }])}; ${concluir('erro')}`, /não correspondem/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${fotografia('erro', PARCELAS)}; ${concluir('erro', 'SUCESSO', OUTRO_HASH)}`, /não corresponde|conclusão atômica/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', envelope(null))}; ${fotografia('erro', [])}; ${concluir('erro')}`, /não correspondem/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', envelope(null))}; ${fotografia('erro', null).replace(',NULL,', ",'null'::jsonb,")}; ${concluir('erro')}`, /Parcelas inválidas|IPagSnapshot_parcelas/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', envelope({ value: {} }))}; ${fotografia('erro', null)}; ${concluir('erro')}`, /não correspondem/);
        const duplicado = '{"currentPage":1,"size":1,"totalItems":1,"totalPages":1,"data":[{"paymentMethod":{"value":{"PIX":1,"P\\u0049X":2}}}]}';
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', duplicado)}; ${fotografia('erro', [{ metodo: 'PIX', ocorrencias: '2' }])}; ${concluir('erro')}`, /Envelope marginal/);
        const fracionario = RAW.replace('"PIX":2', '"PIX":2.000000000000000000001');
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', fracionario)}; ${fotografia('erro', PARCELAS)}; ${concluir('erro')}`, /Envelope marginal/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${fotografia('erro', PARCELAS)}`, /conclusão atômica/);
        recusar(`${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${concluir('erro')}`, /trava do período/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${concluir('erro')}`, /não corresponde à fotografia/);
        expect(como('p2', fotografia('mapa', PARCELAS)).ok).toBe(false);
        expect(await db.$queryRaw`SELECT count(*)::int AS n FROM "IntegracaoExecucao" WHERE id='erro'`).toEqual([{ n: 0 }]);
        expect(await db.$queryRaw`SELECT count(*)::int AS n FROM "IntegracaoPagamentoSnapshot"`).toEqual([{ n: 3 }]);
        expect(await legado()).toEqual(brutoAntes); expect(await snapshots()).toEqual(diarioAntes);
        return true;
      });
      expect(resultado).toBe(true);

      // Catálogo alterado e revertido na mesma transação; assertas anteriores provaram os guards executando.
      const desfazer = new Error('rollback sintético');
      async function sabotagem(sql: string | string[], nome: string, indiceParcial = false) {
        await expect(db.$transaction(async tx => {
          for (const comando of typeof sql === 'string' ? [sql] : sql) await tx.$executeRawUnsafe(comando);
          if (indiceParcial) {
            const [indice] = await tx.$queryRaw<{ parcial: boolean; predicado: string }[]>`SELECT i.indpred IS NOT NULL AS parcial,
              pg_get_expr(i.indpred,i.indrelid) AS predicado FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
              JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=${nome}`;
            expect(indice).toEqual({ parcial: true, predicado: '(geracao > 0)' });
          }
          expect((await conferirPagamentosAnalytics(tx)).join('\n')).toContain(nome);
          throw desfazer;
        })).rejects.toBe(desfazer);
        expect(await conferirMigracao(db)).toEqual([]);
      }
      await sabotagem('ALTER TABLE "IntegracaoPagamentoSnapshot" DISABLE TRIGGER "IPagSnapshot_completude"', 'IPagSnapshot_completude');
      await sabotagem('ALTER TABLE "IntegracaoExecucao" DISABLE TRIGGER "IPagExec_guard"', 'IPagExec_guard');
      await sabotagem('GRANT UPDATE ON "IntegracaoPagamentoSnapshot" TO erp_tenant', 'IntegracaoPagamentoSnapshot');
      await sabotagem('GRANT SELECT ON "IntegracaoPagamentoSnapshot" TO PUBLIC', 'IntegracaoPagamentoSnapshot');
      await sabotagem('GRANT EXECUTE ON FUNCTION erp_integracao_pagamento_conferir_corpo(text,text,int,jsonb) TO erp_tenant', 'erp_integracao_pagamento_conferir_corpo');
      await sabotagem('ALTER FUNCTION erp_integracao_pagamento_final() RESET search_path', 'erp_integracao_pagamento_final');
      await sabotagem('ALTER FUNCTION erp_integracao_pagamento_normalizar(text) VOLATILE', 'erp_integracao_pagamento_normalizar');
      await sabotagem('ALTER TABLE "IntegracaoPayload" ALTER COLUMN "versaoContrato" SET DEFAULT 1', 'IntegracaoPayload.versaoContrato');
      await sabotagem(['ALTER TABLE "IntegracaoPagamentoSnapshot" DROP CONSTRAINT "IPagSnapshot_identidade"', 'ALTER TABLE "IntegracaoPagamentoSnapshot" ADD CONSTRAINT "IPagSnapshot_identidade" CHECK(true)'], 'IPagSnapshot_identidade');
      await sabotagem(['ALTER TABLE "IntegracaoPagamentoSnapshot" DROP CONSTRAINT "IPagSnapshot_identidade"', `ALTER TABLE "IntegracaoPagamentoSnapshot" ADD CONSTRAINT "IPagSnapshot_identidade" CHECK(geracao>0 AND "paginaInicial"=1 AND "versaoContrato"=1 AND hash ~ '^[0-9A-F]{64}$')`], 'IPagSnapshot_identidade');
      await sabotagem(['ALTER TABLE "IntegracaoPagamentoSnapshot" DROP CONSTRAINT "IPagSnapshot_estado"', `ALTER TABLE "IntegracaoPagamentoSnapshot" ADD CONSTRAINT "IPagSnapshot_estado" CHECK(situacao IN ('PUBLICADO','PENDENTE_PERIODO')) NOT VALID`], 'IPagSnapshot_estado');
      await sabotagem(['DROP INDEX "IPagSnapshot_exec_estado_geracao_idx"', 'CREATE INDEX "IPagSnapshot_exec_estado_geracao_idx" ON "IntegracaoPagamentoSnapshot"("parceiroId","execucaoId",situacao,geracao DESC) WHERE geracao > 0'], 'IPagSnapshot_exec_estado_geracao_idx', true);
      await sabotagem(['DROP INDEX "IExec_perfil_ultimo_inicio_idx"', 'CREATE INDEX "IExec_perfil_ultimo_inicio_idx" ON "IntegracaoExecucao"("parceiroId",perfil,"iniciadaEm" ASC)'], 'IExec_perfil_ultimo_inicio_idx');
      await sabotagem(['ALTER TABLE "IntegracaoPagamentoSnapshot" DROP CONSTRAINT "IPagSnapshot_payload_fkey"', 'ALTER TABLE "IntegracaoPagamentoSnapshot" ADD CONSTRAINT "IPagSnapshot_payload_fkey" FOREIGN KEY("parceiroId") REFERENCES "ParceiroFlow"(id) ON DELETE RESTRICT ON UPDATE CASCADE'], 'IPagSnapshot_payload_fkey');
      await sabotagem(['DROP TRIGGER "IPagExec_completude" ON "IntegracaoExecucao"', 'CREATE CONSTRAINT TRIGGER "IPagExec_completude" AFTER UPDATE ON "IntegracaoExecucao" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(false) EXECUTE FUNCTION erp_integracao_pagamento_final()'], 'IPagExec_completude');
      await sabotagem('DROP TABLE "IntegracaoPagamentoSnapshot" CASCADE', 'IntegracaoPagamentoSnapshot');
      if (perfil.rls) {
        await sabotagem('ALTER TABLE "IntegracaoPagamentoSnapshot" NO FORCE ROW LEVEL SECURITY', 'IntegracaoPagamentoSnapshot');
        await sabotagem('CREATE POLICY mais_acesso ON "IntegracaoPagamentoSnapshot" FOR ALL TO erp_tenant USING(true) WITH CHECK(true)', 'IPagSnapshot_do_parceiro');
      }
      expect(await financeiro()).toEqual(financeiroAntes);
    } finally { await db.$disconnect(); }
  });
});
