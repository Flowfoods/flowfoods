/** INT-1.8D: aplica 58 sobre legado real em três perfis; somente bancos sintéticos locais. */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { comPosseAnalytics } from '@/lib/integracoes/core/posse-analytics';
import { conferirMigracao, conferirComplementaresAnalytics } from '../scripts/erp-conferir-migracao';
import { executarPsqlDeTeste } from './erp-psql-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACAO = '20261127000000_erp_integracao_complementares';
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
const envelope = (orderCreationHour: unknown, customerFirstOrderInMerchant: unknown) => JSON.stringify({ currentPage: 1, size: 1, totalItems: 1, totalPages: 1, data: [{ orderCreationHour, customerFirstOrderInMerchant }] });
const HORAS_RAW = { value: { 2: 4, 10: 6, 23: 0, ['__proto__']: 5 }, cardinality: null };
const PRIMEIROS_RAW = { value: { true: 2, false: 3, constructor: 0, NOVO: 5 }, cardinality: 0 };
const RAW = envelope(HORAS_RAW, PRIMEIROS_RAW);
const HORARIOS = [{ termo: '2', ocorrencias: '4' }, { termo: '10', ocorrencias: '6' }, { termo: '23', ocorrencias: '0' }, { termo: '__proto__', ocorrencias: '5' }];
const PRIMEIROS = [{ termo: 'true', ocorrencias: '2' }, { termo: 'false', ocorrencias: '3' }, { termo: 'constructor', ocorrencias: '0' }, { termo: 'NOVO', ocorrencias: '5' }];

function urlDe(banco: string, papel = '') {
  const u = new URL(URL_TESTE!);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
  u.pathname = `/${banco}`; u.search = '';
  if (papel) { u.username = papel; u.password = papel; }
  return u.toString();
}
const papelExiste = (papel: string) => !!URL_TESTE && temPsql && psql(urlDe('postgres'), ['-c', `SELECT count(*) FROM pg_roles WHERE rolname=${literal(papel)}`]).saida === '1';
function janela(id: string, dono: string, dia = '2026-10-23', perfil = 'complementares') {
  return `INSERT INTO "IntegracaoExecucao"(id,"parceiroId","moduloId",dia,perfil,tipo,ciclo,prioridade,"atualizadoEm") VALUES (${literal(id)},'p1','m1',${literal(dia)},${literal(perfil)},'D1','2026-10-21',1,now());
    UPDATE "IntegracaoExecucao" SET estado='EXECUTANDO',geracao=1,dono=${literal(dono)},"leaseAte"=clock_timestamp()+interval '120 seconds',"iniciadaEm"=clock_timestamp() WHERE id=${literal(id)}`;
}
function recibo(id: string, raw: string, versao: number | null = 1, geracao = 1, pagina = 1) {
  const hash = createHash('sha256').update(raw).digest('hex');
  return `INSERT INTO "IntegracaoPayload"(id,"parceiroId","execucaoId",geracao,pagina,sha256,"corpoOriginal",resposta,http,"versaoContrato")
    VALUES (${literal(`${id}-g${geracao}-p${pagina}`)},'p1',${literal(id)},${geracao},${pagina},${literal(hash)},${literal(raw)},${literal(raw)}::jsonb,200,${versao ?? 'NULL'})`;
}
function fotografia(id: string, horarios: unknown, primeiros: unknown, situacao = 'PUBLICADO', hash = HASH) {
  const json = (valor: unknown) => valor === null ? 'NULL' : `${literal(JSON.stringify(valor))}::jsonb`;
  return `INSERT INTO "IntegracaoDistribuicaoSnapshot"(id,"parceiroId","execucaoId",geracao,"versaoContrato",situacao,horarios,"primeirosPedidos",hash)
    VALUES (${literal(`s-${id}`)},'p1',${literal(id)},1,1,${literal(situacao)},${json(horarios)},${json(primeiros)},${literal(hash)})`;
}
function concluir(id: string, estado = 'SUCESSO', hash = HASH) {
  return `UPDATE "IntegracaoExecucao" SET estado=${literal(estado)},"ultimoHash"=${literal(hash)},dono=NULL,"leaseAte"=NULL,"concluidaEm"=clock_timestamp() WHERE id=${literal(id)}`;
}

describe.skipIf(!URL_TESTE || !temPsql)('INT-1.8D · migration marginal e catálogo', { timeout: 480_000 }, () => {
  const sufixo = randomUUID().replaceAll('-', '').slice(0, 10), bancos: string[] = [];
  afterAll(() => {
    for (const banco of bancos) {
      expect(banco).toMatch(/^ff_mig_complementares_[a-z0-9_]+$/);
      const r = psql(urlDe('postgres'), ['-c', `DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`]);
      expect(r.ok, r.aviso).toBe(true);
    }
  }, 360_000);

  for (const perfil of PERFIS) it.skipIf(!!perfil.papel && !papelExiste(perfil.papel))(`${perfil.nome}: legado, raw exato, publicação, isolamento e sabotagens`, async () => {
    const banco = `ff_mig_complementares_${perfil.papel || 'su'}_${sufixo}`;
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
      expect(await conferirComplementaresAnalytics(db)).toEqual([]);
      expect(await conferirMigracao(db)).toEqual([]);
      // Uma função reservada isolada já é instalação parcial, nunca legado silencioso.
      const parcial = new Error('rollback da instalação parcial sintética');
      await expect(db.$transaction(async tx => {
        await tx.$executeRawUnsafe('CREATE FUNCTION erp_integracao_complementares_termos(jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN RETURN $1; END $$');
        expect((await conferirComplementaresAnalytics(tx)).join('\n')).toContain('IntegracaoDistribuicaoSnapshot');
        expect((await conferirMigracao(tx)).join('\n')).toContain('IntegracaoExecucao_perfil_tipo');
        throw parcial;
      })).rejects.toBe(parcial);
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
        // Recibo e fotografia diários criados ANTES de 58; nenhum backfill é permitido.
        const rawLegado = '{"data":[]}';
        exigir(como('p1', `${janela('legado', posse.id, '2026-10-19', 'diario')};
          INSERT INTO "IntegracaoPayload"(id,"parceiroId","execucaoId",geracao,pagina,sha256,"corpoOriginal",resposta,http) VALUES ('raw-legado','p1','legado',1,1,'${createHash('sha256').update(rawLegado).digest('hex')}',${literal(rawLegado)},${literal(rawLegado)}::jsonb,200);
          INSERT INTO "IntegracaoSnapshot"(id,"parceiroId","execucaoId",geracao,situacao,"vazioOficial",hash,pedidos,"numeroGrupos") VALUES ('s-legado','p1','legado',1,'PUBLICADO',true,'${HASH}',0,0)`));
        const legado = () => db.$queryRaw`SELECT id,"parceiroId","execucaoId",geracao,pagina,sha256,"corpoOriginal",resposta,http,"recebidoEm" FROM "IntegracaoPayload" WHERE id='raw-legado'`;
        const snapshots = () => db.$queryRaw`SELECT * FROM "IntegracaoSnapshot" ORDER BY id`;
        const pagamentoRaw = JSON.stringify({ currentPage: 1, size: 1, totalItems: 1, totalPages: 1, data: [{ paymentMethod: { value: { PIX: 3, ['__proto__']: 2 } } }] });
        const pagamentoSql = (id: string, dia: string) => `${PREFIXO}; ${janela(id, posse.id, dia, 'pagamentos')}; ${recibo(id, pagamentoRaw)};
          INSERT INTO "IntegracaoPagamentoSnapshot"(id,"parceiroId","execucaoId",geracao,"versaoContrato",situacao,parcelas,hash)
          VALUES (${literal(`s-${id}`)},'p1',${literal(id)},1,1,'PUBLICADO','[{"metodo":"PIX","ocorrencias":"3"},{"metodo":"__proto__","ocorrencias":"2"}]'::jsonb,'${HASH}'); ${concluir(id)}`;
        exigir(como('p1', pagamentoSql('pagamento-legado', '2026-10-18')));
        const pagamentos = () => db.$queryRaw`SELECT * FROM "IntegracaoPagamentoSnapshot" WHERE "execucaoId"='pagamento-legado'`;
        const brutoAntes = await legado(), diarioAntes = await snapshots(), pagamentosAntes = await pagamentos();
        const aplicada = psql(dono, ['-f', join(RAIZ, MIGRACAO, 'migration.sql')]);
        expect(aplicada.ok, aplicada.aviso).toBe(true); expect(aplicada.aviso).not.toContain('WARNING');
        const catalogo = await db.$queryRaw`SELECT c.conname,pg_get_expr(c.conbin,c.conrelid) AS expressao FROM pg_constraint c WHERE c.conname IN ('ICompSnapshot_identidade','ICompSnapshot_estado','ICompSnapshot_horarios','ICompSnapshot_primeiros_pedidos','IntegracaoPayload_versao_contrato','IntegracaoExecucao_perfil_tipo') ORDER BY c.conname`;
        const triggers = await db.$queryRaw`SELECT tgname,pg_get_triggerdef(oid,false) AS definicao FROM pg_trigger WHERE tgname='ICompExec_completude'`;
        expect(await conferirMigracao(db), JSON.stringify({ catalogo, triggers })).toEqual([]);
        expect(await legado()).toEqual(brutoAntes); expect(await snapshots()).toEqual(diarioAntes); expect(await pagamentos()).toEqual(pagamentosAntes);
        expect(await db.$queryRaw`SELECT "versaoContrato" FROM "IntegracaoPayload" WHERE id='raw-legado'`).toEqual([{ versaoContrato: null }]);
        const publicar = (id: string, dia: string, raw: string, horarios: unknown, primeiros: unknown) => `${PREFIXO}; ${janela(id, posse.id, dia)}; ${recibo(id, raw)}; ${fotografia(id, horarios, primeiros)}; ${concluir(id)}`;
        exigir(como('p1', publicar('mapa', '2026-10-20', RAW, HORARIOS, PRIMEIROS)));
        const estados = [
          { hora: null, primeiro: null, h: null, p: null },
          { hora: { value: {} }, primeiro: { value: {} }, h: [], p: [] },
          { hora: { value: { 2: 0 } }, primeiro: { value: { true: 0 } }, h: [{ termo: '2', ocorrencias: '0' }], p: [{ termo: 'true', ocorrencias: '0' }] },
        ];
        for (let h = 0; h < estados.length; h++) for (let p = 0; p < estados.length; p++) {
          const id = `comb-${h}-${p}`, dia = `2026-10-${String(1 + h * 3 + p).padStart(2, '0')}`;
          exigir(como('p1', publicar(id, dia, envelope(estados[h].hora, estados[p].primeiro), estados[h].h, estados[p].p)));
          expect(await db.$queryRaw`SELECT horarios,"primeirosPedidos",horarios IS NULL AS "horaNula","primeirosPedidos" IS NULL AS "primeiroNulo" FROM "IntegracaoDistribuicaoSnapshot" WHERE id=${`s-${id}`}`).toEqual([
            { horarios: estados[h].h, primeirosPedidos: estados[p].p, horaNula: h === 0, primeiroNulo: p === 0 },
          ]);
        }
        expect(await db.$queryRaw`SELECT horarios,"primeirosPedidos" FROM "IntegracaoDistribuicaoSnapshot" WHERE id='s-mapa'`).toEqual([{ horarios: HORARIOS, primeirosPedidos: PRIMEIROS }]);
        exigir(como('p1', publicar('maximo', '2026-10-21', envelope({ value: { 2: Number.MAX_SAFE_INTEGER } }, { value: { true: 0 } }), [{ termo: '2', ocorrencias: '9007199254740991' }], [{ termo: 'true', ocorrencias: '0' }])));
        expect(await db.$queryRaw`SELECT horarios->0->>'ocorrencias' AS valor FROM "IntegracaoDistribuicaoSnapshot" WHERE id='s-maximo'`).toEqual([{ valor: '9007199254740991' }]);
        exigir(como('p1', pagamentoSql('pagamento-depois', '2026-10-17')));
        expect(await pagamentos()).toEqual(pagamentosAntes);
        expect(await snapshots()).toEqual(diarioAntes); expect(await financeiro()).toEqual(financeiroAntes);
        expect(await db.integracaoFaturamentoDia.count()).toBe(0);
        if (perfil.rls) {
          expect(exigir(como('p2', 'SELECT count(*) FROM "IntegracaoDistribuicaoSnapshot"')).split('\n').at(-1)).toBe('0');
          expect(exigir(psql(dono, ['-c', 'SET ROLE erp_tenant; SELECT count(*) FROM "IntegracaoDistribuicaoSnapshot"'])).split('\n').at(-1)).toBe('0');
        }
        for (const sql of ['UPDATE "IntegracaoDistribuicaoSnapshot" SET horarios=\'[]\'::jsonb', 'UPDATE "IntegracaoDistribuicaoSnapshot" SET "primeirosPedidos"=NULL', 'DELETE FROM "IntegracaoDistribuicaoSnapshot"', 'TRUNCATE "IntegracaoDistribuicaoSnapshot"']) recusar(sql, /permission denied|imutável/);
        recusar("SELECT erp_integracao_complementares_normalizar('{}')", /permission denied/, true);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW, null)}`, /Versão incompatível/);
        recusar(`${PREFIXO}; ${recibo('legado', rawLegado, 1, 1, 2)}`, /Versão incompatível/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${fotografia('erro', [...HORARIOS, { termo: '2', ocorrencias: '4' }], PRIMEIROS)}; ${concluir('erro')}`, /não correspondem/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${fotografia('erro', HORARIOS, [{ termo: 'true', ocorrencias: '999' }])}; ${concluir('erro')}`, /não correspondem/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${fotografia('erro', HORARIOS, PRIMEIROS)}; ${concluir('erro', 'SUCESSO', OUTRO_HASH)}`, /não corresponde|conclusão atômica/);
        for (const [h, p] of [[[], null], [null, []]]) {
          recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', envelope(null, null))}; ${fotografia('erro', h, p)}; ${concluir('erro')}`, /não correspondem/);
        }
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', envelope(null, null))}; ${fotografia('erro', null, null).replace(',NULL,NULL,', ",'null'::jsonb,NULL,")}; ${concluir('erro')}`, /Termos inválidos|ICompSnapshot_horarios/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', envelope({ value: {} }, { value: {} }))}; ${fotografia('erro', null, [])}; ${concluir('erro')}`, /não correspondem/);
        const duplicado = RAW.replace('"2":4', '"2":4,"\\u0032":4');
        for (const invalido of [duplicado, RAW.replace('"2":4', '"2":4.000000000000000000001'), envelope(HORAS_RAW, undefined), envelope(HORAS_RAW, { value: { true: -1 } }), envelope({ value: { 2: Number.MAX_SAFE_INTEGER + 1 } }, PRIMEIROS_RAW)]) {
          recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', invalido)}; ${fotografia('erro', HORARIOS, PRIMEIROS)}; ${concluir('erro')}`, /Envelope complementar|dois termos|Contagem complementar/);
        }
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${fotografia('erro', HORARIOS, PRIMEIROS)}`, /conclusão atômica/);
        recusar(`${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${concluir('erro')}`, /trava do período/);
        recusar(`${PREFIXO}; ${janela('erro', posse.id)}; ${recibo('erro', RAW)}; ${concluir('erro')}`, /não corresponde à fotografia/);
        expect(como('p2', fotografia('mapa', HORARIOS, PRIMEIROS).replace("'s-mapa'", "'s-forjado'")).ok).toBe(false);
        expect(await db.$queryRaw`SELECT count(*)::int AS n FROM "IntegracaoDistribuicaoSnapshot" WHERE id='s-forjado'`).toEqual([{ n: 0 }]);
        expect(await db.$queryRaw`SELECT count(*)::int AS n FROM "IntegracaoExecucao" WHERE id='erro'`).toEqual([{ n: 0 }]);
        expect(await db.$queryRaw`SELECT count(*)::int AS n FROM "IntegracaoDistribuicaoSnapshot"`).toEqual([{ n: 11 }]);
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
          expect((await conferirComplementaresAnalytics(tx)).join('\n')).toContain(nome);
          throw desfazer;
        })).rejects.toBe(desfazer);
        expect(await conferirMigracao(db)).toEqual([]);
      }
      await sabotagem('ALTER TABLE "IntegracaoDistribuicaoSnapshot" DISABLE TRIGGER "ICompSnapshot_completude"', 'ICompSnapshot_completude');
      await sabotagem('ALTER TABLE "IntegracaoExecucao" DISABLE TRIGGER "ICompExec_guard"', 'ICompExec_guard');
      await sabotagem('GRANT UPDATE ON "IntegracaoDistribuicaoSnapshot" TO erp_tenant', 'IntegracaoDistribuicaoSnapshot');
      await sabotagem('GRANT SELECT ON "IntegracaoDistribuicaoSnapshot" TO PUBLIC', 'IntegracaoDistribuicaoSnapshot');
      await sabotagem('GRANT EXECUTE ON FUNCTION erp_integracao_complementares_conferir_corpo(text,text,int,jsonb,jsonb) TO erp_tenant', 'erp_integracao_complementares_conferir_corpo');
      await sabotagem('ALTER FUNCTION erp_integracao_complementares_final() RESET search_path', 'erp_integracao_complementares_final');
      await sabotagem('ALTER FUNCTION erp_integracao_complementares_normalizar(text) VOLATILE', 'erp_integracao_complementares_normalizar');
      await sabotagem('ALTER TABLE "IntegracaoPayload" ALTER COLUMN "versaoContrato" SET DEFAULT 1', 'IntegracaoPayload.versaoContrato');
      await sabotagem(['ALTER TABLE "IntegracaoDistribuicaoSnapshot" DROP CONSTRAINT "ICompSnapshot_identidade"', 'ALTER TABLE "IntegracaoDistribuicaoSnapshot" ADD CONSTRAINT "ICompSnapshot_identidade" CHECK(true)'], 'ICompSnapshot_identidade');
      await sabotagem(['ALTER TABLE "IntegracaoDistribuicaoSnapshot" DROP CONSTRAINT "ICompSnapshot_primeiros_pedidos"', 'ALTER TABLE "IntegracaoDistribuicaoSnapshot" ADD CONSTRAINT "ICompSnapshot_primeiros_pedidos" CHECK(true)'], 'ICompSnapshot_primeiros_pedidos');
      await sabotagem(['ALTER TABLE "IntegracaoExecucao" DROP CONSTRAINT "IntegracaoExecucao_perfil_tipo"', `ALTER TABLE "IntegracaoExecucao" ADD CONSTRAINT "IntegracaoExecucao_perfil_tipo" CHECK(perfil IN ('diario','pagamentos','complementares','inventado') OR perfil='acesso')`], 'IntegracaoExecucao_perfil_tipo');
      await sabotagem(['ALTER TABLE "IntegracaoDistribuicaoSnapshot" DROP CONSTRAINT "ICompSnapshot_identidade"', `ALTER TABLE "IntegracaoDistribuicaoSnapshot" ADD CONSTRAINT "ICompSnapshot_identidade" CHECK(geracao>0 AND "paginaInicial"=1 AND "versaoContrato"=1 AND hash ~ '^[0-9A-F]{64}$')`], 'ICompSnapshot_identidade');
      await sabotagem(['ALTER TABLE "IntegracaoDistribuicaoSnapshot" DROP CONSTRAINT "ICompSnapshot_estado"', `ALTER TABLE "IntegracaoDistribuicaoSnapshot" ADD CONSTRAINT "ICompSnapshot_estado" CHECK(situacao IN ('PUBLICADO','PENDENTE_PERIODO')) NOT VALID`], 'ICompSnapshot_estado');
      await sabotagem(['DROP INDEX "ICompSnapshot_exec_estado_geracao_idx"', 'CREATE INDEX "ICompSnapshot_exec_estado_geracao_idx" ON "IntegracaoDistribuicaoSnapshot"("parceiroId","execucaoId",situacao,geracao DESC) WHERE geracao > 0'], 'ICompSnapshot_exec_estado_geracao_idx', true);
      await sabotagem(['DROP INDEX "IExec_perfil_ultimo_inicio_idx"', 'CREATE INDEX "IExec_perfil_ultimo_inicio_idx" ON "IntegracaoExecucao"("parceiroId",perfil,"iniciadaEm" ASC)'], 'IExec_perfil_ultimo_inicio_idx');
      await sabotagem(['ALTER TABLE "IntegracaoDistribuicaoSnapshot" DROP CONSTRAINT "ICompSnapshot_payload_fkey"', 'ALTER TABLE "IntegracaoDistribuicaoSnapshot" ADD CONSTRAINT "ICompSnapshot_payload_fkey" FOREIGN KEY("parceiroId") REFERENCES "ParceiroFlow"(id) ON DELETE RESTRICT ON UPDATE CASCADE'], 'ICompSnapshot_payload_fkey');
      await sabotagem(['DROP TRIGGER "ICompExec_completude" ON "IntegracaoExecucao"', 'CREATE CONSTRAINT TRIGGER "ICompExec_completude" AFTER UPDATE ON "IntegracaoExecucao" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(false) EXECUTE FUNCTION erp_integracao_complementares_final()'], 'ICompExec_completude');
      await sabotagem('DROP TABLE "IntegracaoDistribuicaoSnapshot" CASCADE', 'IntegracaoDistribuicaoSnapshot');
      if (perfil.rls) {
        await sabotagem('ALTER TABLE "IntegracaoDistribuicaoSnapshot" NO FORCE ROW LEVEL SECURITY', 'IntegracaoDistribuicaoSnapshot');
        await sabotagem('CREATE POLICY mais_acesso ON "IntegracaoDistribuicaoSnapshot" FOR ALL TO erp_tenant USING(true) WITH CHECK(true)', 'ICompSnapshot_do_parceiro');
      }
      expect(await financeiro()).toEqual(financeiroAntes);
    } finally { await db.$disconnect(); }
  });
});
