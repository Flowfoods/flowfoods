/** INT-1.8C: PostgreSQL descartável, posse real e recibos sintéticos; nenhum transporte. */
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const URL_TESTE = process.env.ERP_DB_TESTE;
vi.mock('@/lib/db', async () => {
  const { PrismaClient: P } = await import('@prisma/client');
  const real = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { prisma: real.travarTenant(new P({ datasources: { db: { url: process.env.ERP_DB_TESTE ?? 'postgresql://sem-banco/x' } } })) };
});
import { prisma } from '@/lib/db';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { travarParaEscrever } from '@/lib/erp/periodo-trava';
import { pausarAnalytics } from '@/lib/integracoes/core/controle-analytics';
import { mudarModulo } from '@/lib/integracoes/core/conexoes';
import { agendarJanela, criarRepositorioAnalytics } from '@/lib/integracoes/ifood/pipeline-repositorio';
import type { TarefaAnalytics } from '@/lib/integracoes/ifood/pipeline-tipos';
import { assumirPosseFinanceira, massaFinanceira, type MassaFinanceira } from './integracao-faturamento-apoio';
import { criarPeriodoFechadoDeTeste, reabrirPeriodoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const DIA = '2026-10-19', inventario = { parceiros: [] as string[], apps: [] as string[], autor: `QA pagamentos ${randomUUID()}` };
const raw = (valor: Record<string, number> | null = { PIX: 7, DINHEIRO: 2 }) => JSON.stringify({ data: [{ paymentMethod: valor === null ? null : { value: valor } }], currentPage: 1, size: 1, totalItems: 1, totalPages: 1 });
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
type Repo = ReturnType<typeof criarRepositorioAnalytics>;
function envolver(cliente: ClienteDoParceiro, etapa: (tx: ClienteDoParceiro, executar: Parameters<ClienteDoParceiro['transacao']>[0]) => Promise<unknown>): ClienteDoParceiro {
  return new Proxy({ ...cliente }, { get(alvo, prop) {
    if (prop === 'transacao') return (executar: Parameters<ClienteDoParceiro['transacao']>[0], opcoes: Parameters<ClienteDoParceiro['transacao']>[1]) => alvo.transacao(tx => etapa(tx, executar), opcoes);
    return Reflect.get(alvo, prop);
  } });
}

describe.skipIf(!URL_TESTE)('INT-1.8C · marginal persistida, replay e fronteira financeira', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco, lider: Awaited<ReturnType<typeof assumirPosseFinanceira>>, morta = false;
  const auditoriasAnteriores = new Set<string>();
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('DB precisa ser local e descartável.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } }); perfil = await perfilDoBanco(db);
    for (const a of await prisma.auditLog.findMany({ where: { evento: 'integracao.analytics-retomada' }, select: { id: true } })) auditoriasAnteriores.add(a.id);
  });
  beforeEach(async () => {
    morta = false;
    await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: null, proximaChamadaEm: null } });
    await pausarAnalytics(false, inventario.autor); lider = await assumirPosseFinanceira(URL_TESTE!);
  });
  afterEach(async () => { if (lider) { lider.liberar(); if (morta) await expect(lider.encerrada).rejects.toThrow(); else await lider.encerrada; } });
  afterAll(async () => {
    if (!db) return;
    try {
      await pausarAnalytics(false, inventario.autor);
      await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: null, proximaChamadaEm: null, donoAtual: null } });
      await limparParceiros(db, perfil, inventario.parceiros);
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"');
        await tx.$executeRawUnsafe('DELETE FROM "IntegracaoApp" WHERE id=ANY($1::text[])', inventario.apps);
        await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"');
      });
      await prisma.auditLog.deleteMany({ where: { evento: 'integracao.analytics-pausa', dados: { path: ['autor'], equals: inventario.autor } } });
      const novas = (await prisma.auditLog.findMany({ where: { evento: 'integracao.analytics-retomada' }, select: { id: true } })).filter(a => !auditoriasAnteriores.has(a.id));
      await prisma.auditLog.deleteMany({ where: { id: { in: novas.map(a => a.id) } } });
    } finally { await Promise.all([db.$disconnect(), prisma.$disconnect()]); }
  }, 360_000);
  const repo = (c: ClienteDoParceiro) => criarRepositorioAnalytics(c, lider.posse, () => true);
  async function adquirir(m: MassaFinanceira, ciclo = '2026-10-20', r = repo(m.cliente)) {
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, ciclo, tipo: 'D1', perfil: 'pagamentos', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const t = await r.adquirir(); if (!t || t.perfil !== 'pagamentos') throw new Error('A fixture adquiriu outra janela.');
    expect(t.identidade.fuso).toBe('America/Sao_Paulo'); expect(t.identidade.versaoContrato).toBe(1);
    return { r, t };
  }
  const salvar = (r: Repo, t: TarefaAnalytics, corpoOriginal = raw(), pagina = 1) => r.salvarPagina(t, { pagina, corpoOriginal, http: 200, requestId: 'qa-pagamento', versaoContrato: 1 });
  const fotos = (m: MassaFinanceira) => m.cliente.integracaoPagamentoSnapshot.findMany({ orderBy: { geracao: 'asc' } });
  async function semFinanceiro(m: MassaFinanceira) {
    expect(await Promise.all([m.cliente.integracaoSnapshot.count(), m.cliente.kpiIfoodDia.count(), m.cliente.integracaoFaturamentoDia.count(), m.cliente.integracaoFaturamentoFonte.count(), m.cliente.faturamentoLancamento.count()])).toEqual([0, 0, 0, 0, 0]);
  }
  it.each(['diario', 'acesso', 'pagamentos'] as const)('staging %s conserva chaves próprias de protótipo sem perder o JSON interpretado', async perfilDaTarefa => {
    const m = await massaFinanceira(db, inventario), r = repo(m.cliente);
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, ciclo: '2026-10-20',
      tipo: perfilDaTarefa === 'acesso' ? 'ACESSO' : 'D1', ...(perfilDaTarefa === 'acesso' ? {} : { perfil: perfilDaTarefa }),
      fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const t = await r.adquirir(); if (!t || t.perfil !== perfilDaTarefa) throw new Error('A fixture adquiriu outra janela.');
    const corpoOriginal = ' {"__proto__":{"marcador":"valor"},"lista":[{"__proto__":2,"constructor":0,"toString":3}],"grande":9007199254740991}\n';
    const pagina = { pagina: 1, http: 200, requestId: 'qa-chave-literal', corpoOriginal,
      ...(perfilDaTarefa === 'pagamentos' ? { versaoContrato: 1 as const } : {}) };
    await r.salvarPagina(t, pagina); await r.salvarPagina(t, pagina);
    expect(await m.cliente.integracaoPayload.count()).toBe(1);
    const [s] = await m.cliente.sql<{ igual: boolean; raiz: boolean; aninhada: string; grande: string; original: string; sha256: string }>`
      SELECT resposta = ${corpoOriginal}::jsonb AS igual, jsonb_exists(resposta, '__proto__') AS raiz,
        resposta->'lista'->0->>'__proto__' AS aninhada, resposta->>'grande' AS grande,
        "corpoOriginal" AS original, sha256 FROM "IntegracaoPayload"
      WHERE "parceiroId" = ${m.cliente.parceiroId} AND "execucaoId" = ${t.id}`;
    expect(s).toEqual({ igual: true, raiz: true, aninhada: '2', grande: '9007199254740991', original: corpoOriginal, sha256: hash(corpoOriginal) });
    await semFinanceiro(m);
  });
  it.each(['PRODUCAO', 'TEST'] as const)('%s publica só a marginal e conserva raw/versionamento sem efeitos financeiros', async ambiente => {
    const m = await massaFinanceira(db, inventario, { ambiente }), { r, t } = await adquirir(m);
    await salvar(r, t, raw({ PIX: 9007199254740991, CARTAO_NOVO: 3 }));
    expect(await r.publicarPagamentos(t)).toBe('publicada');
    const [s] = await fotos(m);
    expect(s).toMatchObject({ geracao: 1, versaoContrato: 1, paginaInicial: 1, situacao: 'PUBLICADO', parcelas: [{ metodo: 'CARTAO_NOVO', ocorrencias: '3' }, { metodo: 'PIX', ocorrencias: '9007199254740991' }] });
    expect(await m.cliente.integracaoPayload.findFirst()).toMatchObject({ versaoContrato: 1, corpoOriginal: raw({ PIX: 9007199254740991, CARTAO_NOVO: 3 }) });
    await semFinanceiro(m);
  });
  it.each([null, {}])('SQL NULL e mapa vazio permanecem distintos: %j', async valor => {
    const m = await massaFinanceira(db, inventario), { r, t } = await adquirir(m); await salvar(r, t, raw(valor));
    expect(await r.publicarPagamentos(t)).toBe('publicada');
    expect((await fotos(m))[0].parcelas).toEqual(valor === null ? null : []);
    const sql = await m.cliente.sql<{ nulo: boolean }>`SELECT parcelas IS NULL AS nulo FROM "IntegracaoPagamentoSnapshot" WHERE "parceiroId"=${m.cliente.parceiroId}`;
    expect(sql[0].nulo).toBe(valor === null); await semFinanceiro(m);
  });
  it('no-op conserva id/data e raw novo; alteração posterior cria outra versão', async () => {
    const m = await massaFinanceira(db, inventario); let { r, t } = await adquirir(m);
    await salvar(r, t); await r.publicarPagamentos(t); const anterior = await fotos(m);
    ({ r, t } = await adquirir(m, '2026-10-21')); await salvar(r, t, ` ${raw()}\n`);
    expect(await r.publicarPagamentos(t)).toBe('sem-mudanca'); expect(await fotos(m)).toEqual(anterior);
    expect(await m.cliente.integracaoPayload.count()).toBe(2);
    ({ r, t } = await adquirir(m, '2026-10-22')); await salvar(r, t, raw({ PIX: 8 }));
    expect(await r.publicarPagamentos(t)).toBe('publicada'); expect(await fotos(m)).toHaveLength(2); await semFinanceiro(m);
  });
  it('período fechado fica pendente; reabertura não reutiliza pendente como PUBLICADO anterior', async () => {
    const m = await massaFinanceira(db, inventario);
    const p = await m.cliente.transacao(tx => criarPeriodoFechadoDeTeste(tx, { nome: 'QA', inicio: '2026-10-01', fim: '2026-10-31' }));
    let { r, t } = await adquirir(m); await salvar(r, t); expect(await r.publicarPagamentos(t)).toBe('pendente-periodo');
    expect((await fotos(m))[0].situacao).toBe('PENDENTE_PERIODO');
    await reabrirPeriodoDeTeste(m.cliente, p.id);
    ({ r, t } = await adquirir(m, '2026-10-21')); await salvar(r, t); expect(await r.publicarPagamentos(t)).toBe('publicada');
    expect((await fotos(m)).map(s => s.situacao)).toEqual(['PENDENTE_PERIODO', 'PUBLICADO']);
  });
  it('revogação entre staging e publicação não altera o snapshot anterior', async () => {
    const m = await massaFinanceira(db, inventario); let { r, t } = await adquirir(m); await salvar(r, t); await r.publicarPagamentos(t);
    const anterior = await fotos(m); ({ r, t } = await adquirir(m, '2026-10-21')); await salvar(r, t, raw({ PIX: 99 }));
    expect(await mudarModulo(m.cliente, m.moduloId, 'pausar', inventario.autor)).toMatchObject({ ok: true });
    await expect(r.publicarPagamentos(t)).rejects.toMatchObject({ codigo: 'ACESSO' }); expect(await fotos(m)).toEqual(anterior);
  });
  it('recusa perfil, versão, fuso e recibo de outra geração antes de publicar', async () => {
    const m = await massaFinanceira(db, inventario), { r, t } = await adquirir(m);
    await expect(r.salvarPagina(t, { pagina: 1, http: 200, requestId: null, corpoOriginal: raw() })).rejects.toMatchObject({ codigo: 'CORPO' });
    await expect(salvar(r, { ...t, identidade: { ...t.identidade, fuso: 'UTC' } })).rejects.toMatchObject({ codigo: 'ENTRADA' });
    await salvar(r, t); await expect(r.publicar(t)).rejects.toMatchObject({ codigo: 'ENTRADA' });
    await expect(r.publicarPagamentos({ ...t, geracao: t.geracao + 1 })).rejects.toThrow(); expect(await fotos(m)).toEqual([]);
  });
  it('SQL revalida equivalência e não permite forjar sucesso por hash igual com raw diferente', async () => {
    const m = await massaFinanceira(db, inventario); let { r, t } = await adquirir(m); await salvar(r, t); await r.publicarPagamentos(t);
    const anterior = (await fotos(m))[0]; ({ r, t } = await adquirir(m, '2026-10-21')); await salvar(r, t, raw({ PIX: 999 }));
    await expect(m.cliente.transacao(async tx => {
      await travarParaEscrever(tx); await tx.integracaoExecucao.update({ where: { id: t.id }, data: { estado: 'SUCESSO', dono: null, leaseAte: null, ultimoHash: anterior.hash } });
    })).rejects.toThrow();
    expect(await fotos(m)).toEqual([anterior]); expect((await m.cliente.integracaoExecucao.findFirstOrThrow()).estado).toBe('EXECUTANDO');
  });
  it('append depois da leitura de preparação é detectado sob fence', async () => {
    const m = await massaFinanceira(db, inventario), { r, t } = await adquirir(m); await salvar(r, t);
    let entrou = false;
    const c = new Proxy({ ...m.cliente }, { get(alvo, prop) {
      if (prop === 'transacao') return async (executar: Parameters<ClienteDoParceiro['transacao']>[0], opcoes: Parameters<ClienteDoParceiro['transacao']>[1]) => {
        if (!entrou) { entrou = true; await salvar(r, t, raw(), 2); }
        return alvo.transacao(executar, opcoes);
      };
      return Reflect.get(alvo, prop);
    } });
    await expect(repo(c).publicarPagamentos(t)).rejects.toMatchObject({ codigo: 'CORPO' }); expect(await fotos(m)).toEqual([]);
  });
  it('append dentro da TX depois do snapshot também impede o COMMIT inteiro', async () => {
    const m = await massaFinanceira(db, inventario), { r, t } = await adquirir(m); await salvar(r, t);
    const c = envolver(m.cliente, async (tx, executar) => {
      const delegado = tx.integracaoPagamentoSnapshot;
      const proxy = new Proxy({ ...tx }, { get(alvo, prop) {
        if (prop === 'integracaoPagamentoSnapshot') return { ...delegado, create: async (...args: Parameters<typeof delegado.create>) => {
          const s = await delegado.create(...args);
          await tx.integracaoPayload.create({ data: { parceiroId: tx.parceiroId, execucaoId: t.id, geracao: t.geracao, pagina: 2, versaoContrato: 1, http: 200, corpoOriginal: raw(), resposta: JSON.parse(raw()), sha256: hash(raw()) } });
          return s;
        } };
        return Reflect.get(alvo, prop);
      } });
      return executar(proxy);
    });
    await expect(repo(c).publicarPagamentos(t)).rejects.toThrow();
    expect(await fotos(m)).toEqual([]); expect(await m.cliente.integracaoPayload.count()).toBe(1);
  });
  it.each([false, true])('sessão advisory morta antes do COMMIT recusa snapshot/no-op (%s)', async noop => {
    const m = await massaFinanceira(db, inventario); let { r, t } = await adquirir(m);
    if (noop) { await salvar(r, t); await r.publicarPagamentos(t); ({ r, t } = await adquirir(m, '2026-10-21')); }
    const antes = await fotos(m); await salvar(r, t);
    const c = envolver(m.cliente, async (tx, executar) => {
      const resultado = await executar(tx); morta = true; void lider.encerrada.catch(() => {});
      const morte = await db.$queryRaw<{ morto: boolean }[]>`SELECT pg_terminate_backend(pid) AS morto FROM pg_stat_activity WHERE datname=current_database() AND application_name=${`flowfoods-analytics:${lider.posse.id}`}`;
      expect(morte).toEqual([{ morto: true }]); return resultado;
    });
    await expect(repo(c).publicarPagamentos(t)).rejects.toThrow(); expect(await fotos(m)).toEqual(antes);
  });
  it('ordem de perfis sobrevive a novo repositório sem uma fila diária monopolizar a marginal', async () => {
    const m = await massaFinanceira(db, inventario);
    for (const tipo of ['acesso', 'diario', 'pagamentos'] as const) for (const dia of tipo === 'acesso' ? [DIA] : [DIA, '2026-10-18']) {
      await agendarJanela(m.cliente, { moduloId: m.moduloId, dia, ciclo: '2026-10-20', tipo: tipo === 'acesso' ? 'ACESSO' : 'D1', ...(tipo === 'acesso' ? {} : { perfil: tipo }), fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    }
    const perfis: string[] = [];
    for (let n = 0; n < 3; n++) {
      const r = repo(m.cliente), t = await r.adquirir(); expect(t).not.toBeNull(); perfis.push(t!.perfil);
      await r.falhar(t!, { codigo: 'contrato' });
    }
    expect(perfis).toEqual(['acesso', 'diario', 'pagamentos']);
  });
  it('429 marginal persiste cooldown global e impede adquirir outro perfil', async () => {
    const m = await massaFinanceira(db, inventario), { r, t } = await adquirir(m);
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, ciclo: '2026-10-20', tipo: 'D1', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const prazo = new Date(Date.now() + 600_000).toISOString();
    await r.falhar(t, { codigo: 'limite', http: 429, naoAntesDe: prazo, requestId: 'qa-pagamento-429' });
    expect((await prisma.integracaoControle.findUniqueOrThrow({ where: { id: 'IFOOD_ANALYTICS' } })).bloqueadaAte?.toISOString()).toBe(prazo);
    expect(await repo(m.cliente).adquirir()).toBeNull(); await semFinanceiro(m);
  });
  it('crash antes do commit preserva raw; resposta perdida depois do commit não duplica no ciclo seguinte', async () => {
    const m = await massaFinanceira(db, inventario), { r, t } = await adquirir(m); await salvar(r, t);
    const antes = envolver(m.cliente, async (tx, executar) => { await executar(tx); throw new Error('rollback sintético'); });
    await expect(repo(antes).publicarPagamentos(t)).rejects.toThrow('rollback sintético'); expect(await fotos(m)).toEqual([]);
    const depois = new Proxy({ ...m.cliente }, { get(alvo, prop) {
      if (prop === 'transacao') return async (executar: Parameters<ClienteDoParceiro['transacao']>[0], opcoes: Parameters<ClienteDoParceiro['transacao']>[1]) => { await alvo.transacao(executar, opcoes); throw new Error('resposta perdida'); };
      return Reflect.get(alvo, prop);
    } });
    await expect(repo(depois).publicarPagamentos(t)).rejects.toThrow('resposta perdida'); const salvo = await fotos(m); expect(salvo).toHaveLength(1);
    const seguinte = await adquirir(m, '2026-10-21'); await salvar(seguinte.r, seguinte.t); expect(await seguinte.r.publicarPagamentos(seguinte.t)).toBe('sem-mudanca'); expect(await fotos(m)).toEqual(salvo);
  });
});
