/**
 * INT-1.6: repositório real, duas conexões e dados exclusivamente sintéticos.
 * O transporte não é chamado. Cada líder segura uma sessão advisory real.
 * Após o handoff, um executor antigo mente em confirmar() para provar que a
 * proteção persistida não depende dessa resposta em memória.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_TESTE = process.env.ERP_DB_TESTE;
vi.mock('@/lib/db', async () => {
  const { PrismaClient: P } = await import('@prisma/client');
  const real = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { prisma: real.travarTenant(new P({ datasources: { db: { url: process.env.ERP_DB_TESTE ?? 'postgresql://sem-banco/x' } } })) };
});

import { prisma } from '@/lib/db';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import { registrarApp } from '@/lib/integracoes/core/apps';
import { desligarConexao, ligarConexao, mudarModulo, prepararModulo } from '@/lib/integracoes/core/conexoes';
import { pausarAnalytics, registrarDonoAnalytics } from '@/lib/integracoes/core/controle-analytics';
import { comPosseAnalytics, ErroDePosseAnalytics, type PosseAnalytics } from '@/lib/integracoes/core/posse-analytics';
import type { BucketAnalytics } from '@/lib/integracoes/ifood/analytics';
import { agendarJanela, criarRepositorioAnalytics, ultimoDiaAnalytics } from '@/lib/integracoes/ifood/pipeline-repositorio';
import type { JanelaAnalytics, PaginaDoTransporte, TarefaAnalytics } from '@/lib/integracoes/ifood/pipeline-tipos';
import { criarPeriodoFechadoDeTeste, cru, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const AUTOR = `QA sintético INT-1.6 ${randomUUID()}`;
const DIA = '2026-10-19';
const CICLO = '2026-10-20';
const FUSO = 'America/Sao_Paulo';
const hash = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex');

/** Oráculo monetário deliberadamente literal, independente do normalizador. */
function grupo(status = 'STATUS_NOVO', quantidade = 3): BucketAnalytics {
  return {
    groupByKey: { value: { orderStatus: status, salesChannel: 'CANAL_NOVO', deliveredBy: null, category: null }, count: quantidade },
    gmv: { sum: 21474836.48 }, gmvWithoutDelivery: { sum: 19.99 }, netDeliveryFee: null,
    paymentTotalValue: { sum: 0 }, benefitByTypePartnerTotalValue: { sum: null }, refundedTotalValue: { sum: -0.01 },
  };
}
function pagina(data = [grupo()], numero = 1, total = data.length, tamanho = data.length): PaginaDoTransporte {
  return {
    pagina: numero, http: 200, requestId: `qa-page-${numero}`,
    corpoOriginal: JSON.stringify({ data, currentPage: numero, size: tamanho, totalItems: total, totalPages: total === 0 ? 0 : Math.ceil(total / tamanho) }),
  };
}
function posse(confirmar = true): PosseAnalytics {
  return { id: randomUUID(), confirmar: vi.fn(async () => confirmar) };
}
type Repositorio = ReturnType<typeof criarRepositorioAnalytics>;
interface Massa {
  cliente: ClienteDoParceiro;
  outroCliente: ClienteDoParceiro;
  appId: string;
  conexaoId: string;
  moduloId: string;
  lojaId: string;
  merchantId: string;
  janela: JanelaAnalytics;
  repo: Repositorio;
}

describe.skipIf(!URL_TESTE)('INT-1.6 · publicação Analytics e isolamento no PostgreSQL', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let outraConexao: PrismaClient;
  let perfil: PerfilDoBanco;
  let dono: PosseAnalytics;
  const parceiros: string[] = [];
  const apps: string[] = [];
  const auditoriasDeRetomadaAnteriores = new Set<string>();
  const lideres = new Map<string, { liberar: () => void; encerrada: Promise<unknown> }>();
  const sessoesEncerradasPeloTeste = new Set<string>();
  const nomeOutraConexao = `qa-int16-other-${randomUUID()}`;

  function antesDoCommit(cliente: ClienteDoParceiro, conferir: (tx: ClienteDoParceiro) => Promise<void>): ClienteDoParceiro {
    return new Proxy({ ...cliente }, {
      get(alvo, propriedade) {
        if (propriedade === 'transacao') {
          return (executar: Parameters<ClienteDoParceiro['transacao']>[0], opcoes: Parameters<ClienteDoParceiro['transacao']>[1]) => alvo.transacao(async tx => {
            const retorno = await executar(tx);
            await conferir(tx);
            return retorno;
          }, opcoes);
        }
        return Reflect.get(alvo, propriedade);
      },
    });
  }
  async function esperarOutraConexaoBloqueada() {
    await vi.waitFor(async () => {
      const [r] = await db.$queryRaw<{ bloqueada: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name=${nomeOutraConexao} AND cardinality(pg_blocking_pids(pid))>0) AS bloqueada`;
      expect(r.bloqueada).toBe(true);
    }, { timeout: 10_000, interval: 20 });
  }

  async function assumirPosse(): Promise<PosseAnalytics> {
    let liberar!: () => void;
    let entregar!: (p: PosseAnalytics) => void;
    let recusar!: (e: unknown) => void;
    const fim = new Promise<void>((resolve) => { liberar = resolve; });
    const pronta = new Promise<PosseAnalytics>((resolve, reject) => { entregar = resolve; recusar = reject; });
    const encerrada = comPosseAnalytics(URL_TESTE!, async (p) => {
      entregar(p);
      await fim;
      return true;
    });
    // Se a sessão falhar antes do callback, o teste falha imediatamente, sem aguardar timeout.
    void encerrada.then((r) => { if (r === null) recusar(new Error('Outro líder inesperado no banco de teste.')); }, recusar);
    const p = await pronta;
    lideres.set(p.id, { liberar, encerrada });
    await registrarDonoAnalytics(p);
    return p;
  }
  async function encerrarPosse(id: string) {
    const p = lideres.get(id);
    if (!p) return;
    p.liberar();
    if (sessoesEncerradasPeloTeste.has(id)) await expect(p.encerrada).rejects.toBeInstanceOf(ErroDePosseAnalytics);
    else await p.encerrada;
    lideres.delete(id);
  }

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    const outraUrl = new URL(URL_TESTE!);
    outraUrl.searchParams.set('application_name', nomeOutraConexao);
    outraConexao = new PrismaClient({ datasources: { db: { url: outraUrl.toString() } } });
    perfil = await perfilDoBanco(db);
    for (const a of await prisma.auditLog.findMany({ where: { evento: 'integracao.analytics-retomada' }, select: { id: true } })) auditoriasDeRetomadaAnteriores.add(a.id);
  });

  beforeEach(async () => {
    // Estado global da fixture entre casos; não é uma operação disponível ao parceiro.
    await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: null, proximaChamadaEm: null } });
    await pausarAnalytics(false, AUTOR);
    dono = await assumirPosse();
  });

  afterEach(async () => {
    await Promise.all([...lideres.keys()].map(encerrarPosse));
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await pausarAnalytics(false, AUTOR);
      await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: null, proximaChamadaEm: null, donoAtual: null } });
      await limparParceiros(db, perfil, parceiros);
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"');
        await tx.$executeRawUnsafe('DELETE FROM "IntegracaoApp" WHERE id = ANY($1::text[])', apps);
        await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"');
      });
      await prisma.auditLog.deleteMany({ where: { evento: 'integracao.analytics-pausa', dados: { path: ['autor'], equals: AUTOR } } });
      // Esta suíte é serial e detém o único líder do cluster de testes. Preserve todo log anterior.
      const novas = (await prisma.auditLog.findMany({ where: { evento: 'integracao.analytics-retomada' }, select: { id: true } })).filter(a => !auditoriasDeRetomadaAnteriores.has(a.id));
      await prisma.auditLog.deleteMany({ where: { id: { in: novas.map(a => a.id) }, evento: 'integracao.analytics-retomada' } });
    } finally {
      await Promise.all([db.$disconnect(), outraConexao.$disconnect(), prisma.$disconnect()]);
    }
  }, 360_000);

  async function massa(ambiente: 'TEST' | 'PRODUCAO' = 'PRODUCAO', ativar = true): Promise<Massa> {
    const s = randomUUID();
    const parceiro = await db.parceiroFlow.create({ data: { nome: `Pipeline sintético ${s}`, slug: `pipeline-${s}`, status: 'ATIVO', homologacaoDeIntegracao: ambiente === 'TEST' } });
    parceiros.push(parceiro.id);
    const cliente = doParceiro(parceiro.id, db);
    const outroCliente = doParceiro(parceiro.id, outraConexao);
    const loja = await cadastrarLoja(cliente, { nome: 'Loja sintética Analytics' }, AUTOR);
    if (!loja.ok) throw new Error(JSON.stringify(loja));
    const app = await registrarApp({ provedor: 'IFOOD', ambiente, nome: `App QA ${s}`, categoria: ambiente === 'TEST' ? 'TEST' : 'BI', clientId: `qa-${s}`, nomeDoSegredo: ambiente === 'TEST' ? 'IFOOD_TEST_CLIENT_SECRET' : 'IFOOD_BI_CLIENT_SECRET', modulos: ['ANALYTICS'] }, AUTOR);
    if (!app.ok) throw new Error(JSON.stringify(app));
    apps.push(app.id);
    if (ambiente === 'PRODUCAO') await prisma.integracaoApp.update({ where: { id: app.id }, data: { estadoHomologacao: 'HOMOLOGADO' } });
    const merchantId = randomUUID();
    const conexao = await ligarConexao(cliente, { lojaId: loja.id, provedor: 'IFOOD', ambiente, idExterno: merchantId, nomeExterno: 'Loja fictícia' }, { nome: AUTOR });
    if (!conexao.ok) throw new Error(JSON.stringify(conexao));
    const modulo = await prepararModulo(cliente, conexao.id, app.id, 'ANALYTICS', AUTOR);
    if (!modulo.ok) throw new Error(JSON.stringify(modulo));
    if (ambiente === 'PRODUCAO') expect(await mudarModulo(cliente, modulo.id, 'solicitar', AUTOR)).toMatchObject({ ok: true });
    expect(await mudarModulo(cliente, modulo.id, 'autorizar', AUTOR)).toMatchObject({ ok: true });
    if (ativar) expect(await mudarModulo(cliente, modulo.id, 'ativar', AUTOR)).toMatchObject({ ok: true });
    expect(await mudarLiberacao(cliente, 'integracao', true, AUTOR)).toMatchObject({ ok: true });
    return {
      cliente, outroCliente, appId: app.id, conexaoId: conexao.id, moduloId: modulo.id, lojaId: loja.id, merchantId,
      janela: { moduloId: modulo.id, dia: DIA, ciclo: CICLO, tipo: 'D1', fuso: FUSO, unidade: 'REAL' },
      repo: criarRepositorioAnalytics(cliente, dono, () => true),
    };
  }
  async function adquirir(m: Massa, alteracoes: Partial<JanelaAnalytics> = {}): Promise<TarefaAnalytics> {
    await agendarJanela(m.cliente, { ...m.janela, ...alteracoes });
    const t = await m.repo.adquirir();
    expect(t).not.toBeNull();
    return t!;
  }
  async function publicar(m: Massa, p = pagina(), alteracoes: Partial<JanelaAnalytics> = {}) {
    const t = await adquirir(m, alteracoes);
    await m.repo.salvarPagina(t, p);
    expect(await m.repo.publicar(t)).toBe('publicada');
    return t;
  }
  const snapshots = (m: Massa) => m.cliente.integracaoSnapshot.findMany({ orderBy: { geracao: 'asc' }, include: { linhas: { orderBy: { orderStatus: 'asc' } } } });

  it('agendar D1 e revisão concorrentes cria uma janela; duas conexões não adquirem a mesma geração', async () => {
    const m = await massa();
    await Promise.all([
      agendarJanela(m.cliente, m.janela),
      agendarJanela(m.outroCliente, { ...m.janela, tipo: 'REVISAO' }),
      agendarJanela(m.cliente, m.janela),
    ]);
    expect(await m.cliente.integracaoExecucao.count()).toBe(1);
    const r2 = criarRepositorioAnalytics(m.outroCliente, dono, () => true);
    const recebidas = await Promise.all([m.repo.adquirir(), r2.adquirir()]);
    const tarefas = recebidas.filter((x): x is TarefaAnalytics => x !== null);
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0]).toMatchObject({ geracao: 1, dono: dono.id, identidade: { ambiente: 'PRODUCAO', merchantId: m.merchantId, dia: DIA, perfil: 'diario' } });
  });

  it('data/fuso inválidos não geram janela; dia civil, unidade e fuso válidos ficam imutáveis', async () => {
    const m = await massa();
    for (const alteracao of [{ dia: '2026-02-30' }, { ciclo: '2026-13-01' }, { fuso: 'FUSO_INEXISTENTE' }]) {
      await expect(agendarJanela(m.cliente, { ...m.janela, ...alteracao })).rejects.toMatchObject({ codigo: 'ENTRADA' });
    }
    expect(await m.cliente.integracaoExecucao.count()).toBe(0);
    await agendarJanela(m.cliente, m.janela);
    for (const alteracao of [{ fuso: 'UTC' }, { unidade: 'CENTAVO' as const }]) {
      await expect(agendarJanela(m.cliente, { ...m.janela, ...alteracao, ciclo: '2026-10-21' })).rejects.toMatchObject({ codigo: 'ENTRADA' });
    }
    const t = await m.repo.adquirir();
    expect(t).toMatchObject({ fuso: FUSO, unidade: { moeda: 'BRL', unidade: 'REAL' }, identidade: { dia: DIA } });
  });

  it('duas primeiras criações com fuso/unidade divergentes não confirmam silenciosamente o mesmo contrato', async () => {
    const m = await massa();
    const entradas: JanelaAnalytics[] = [m.janela, { ...m.janela, fuso: 'UTC', unidade: 'CENTAVO' }];
    const resultados = await Promise.allSettled([agendarJanela(m.cliente, entradas[0]), agendarJanela(m.outroCliente, entradas[1])]);
    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter(r => r.status === 'rejected')).toMatchObject([{ status: 'rejected', reason: { codigo: 'ENTRADA' } }]);
    const vencedora = entradas[resultados.findIndex(r => r.status === 'fulfilled')];
    expect(await m.cliente.integracaoExecucao.findMany()).toMatchObject([{ fuso: vencedora.fuso, unidade: vencedora.unidade }]);
  });

  it('mantém corpo UTF-8 original e hash dos mesmos bytes; JSON não é reserializado como evidência', async () => {
    const m = await massa();
    const t = await adquirir(m);
    const p = pagina();
    p.corpoOriginal = ` \n${JSON.stringify({ ...JSON.parse(p.corpoOriginal), observacaoSintetica: 'açaí 🍊' }, null, 2)}\n`;
    await m.repo.salvarPagina(t, p);
    const gravada = await m.cliente.integracaoPayload.findFirstOrThrow();
    expect(gravada).toMatchObject({ geracao: 1, pagina: 1, http: 200, requestId: 'qa-page-1', corpoOriginal: p.corpoOriginal, sha256: hash(p.corpoOriginal), resposta: JSON.parse(p.corpoOriginal) });
    expect(gravada.sha256).not.toBe(hash(JSON.stringify(gravada.resposta)));
  });

  it('reenvio da mesma página é idempotente; trocar seus bytes não sobrescreve a evidência', async () => {
    const m = await massa();
    const t = await adquirir(m);
    const p = pagina();
    await m.repo.salvarPagina(t, p);
    await m.repo.salvarPagina(t, p);
    expect(await m.cliente.integracaoPayload.count()).toBe(1);
    await expect(m.repo.salvarPagina(t, { ...p, corpoOriginal: `${p.corpoOriginal}\n` })).rejects.toThrow();
    expect(await m.cliente.integracaoPayload.findFirst()).toMatchObject({ corpoOriginal: p.corpoOriginal, sha256: hash(p.corpoOriginal) });
  });

  for (const corpoOriginal of [
    '{"valor":0.0100000000000000000001}',
    '{"valor":22.220000000000000000001}',
    '{"valor":9007199254740993}',
    '{"valor":1e-10000000}',
    '{"valor":1e10000000}',
    '{"valor":"\\u0000"}',
    '{"valor":"\\ud800"}',
  ]) {
    it(`recusa JSON que perde fidelidade ou não cabe no banco: ${corpoOriginal}`, async () => {
      const m = await massa();
      const t = await adquirir(m);
      await expect(m.repo.salvarPagina(t, { pagina: 1, http: 200, requestId: 'qa-json-inexato', corpoOriginal })).rejects.toMatchObject({ codigo: 'CORPO' });
      expect(await m.cliente.integracaoPayload.count()).toBe(0);
      expect(await snapshots(m)).toEqual([]);
    });
  }

  it('evidência acrescentada após normalizar e antes da transação invalida a publicação preparada', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await m.repo.salvarPagina(t, pagina());
    const outroRepo = criarRepositorioAnalytics(m.outroCliente, dono, () => true);
    let acrescentou = false;
    const cliente = new Proxy({ ...m.cliente }, {
      get(alvo, propriedade) {
        if (propriedade === 'transacao') {
          return async (executar: Parameters<ClienteDoParceiro['transacao']>[0], opcoes: Parameters<ClienteDoParceiro['transacao']>[1]) => {
            expect(acrescentou).toBe(false);
            await outroRepo.salvarPagina(t, pagina([grupo('PAGINA_TARDIA')], 2, 2, 1));
            acrescentou = true;
            return alvo.transacao(executar, opcoes);
          };
        }
        return Reflect.get(alvo, propriedade);
      },
    });
    await expect(criarRepositorioAnalytics(cliente, dono, () => true).publicar(t)).rejects.toMatchObject({ codigo: 'CORPO' });
    expect(acrescentou).toBe(true);
    expect(await m.cliente.integracaoPayload.count()).toBe(2);
    expect(await snapshots(m)).toEqual([]);
  });

  it('publica duas páginas completas: soma count, preserva enums, nulos, negativos e valores além de Int32', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await m.repo.salvarPagina(t, pagina([grupo('STATUS_NOVO', 3)], 1, 2, 1));
    await m.repo.salvarPagina(t, pagina([grupo('OUTRO_STATUS', 7)], 2, 2, 1));
    expect(await m.repo.publicar(t)).toBe('publicada');
    const [s] = await snapshots(m);
    expect(s).toMatchObject({ geracao: 1, situacao: 'PUBLICADO', vazioOficial: false, pedidos: 10n });
    expect(s.linhas).toHaveLength(2);
    for (const l of s.linhas) expect(l).toMatchObject({ salesChannel: 'CANAL_NOVO', deliveredBy: null, category: null, gmv: 2147483648n, gmvWithoutDelivery: 1999n, netDeliveryFee: null, paymentTotalValue: 0n, benefitByTypePartnerTotalValue: null, refundedTotalValue: -1n });
    expect(s.linhas.map((l) => l.orderStatus)).toEqual(['OUTRO_STATUS', 'STATUS_NOVO']);
    expect(await m.cliente.faturamentoLancamento.count()).toBe(0);
  });

  it('duas publicações da mesma geração produzem uma versão inteira, sem duplicata', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await m.repo.salvarPagina(t, pagina());
    const outroRepo = criarRepositorioAnalytics(m.outroCliente, dono, () => true);
    const resultados = await Promise.allSettled([m.repo.publicar(t), outroRepo.publicar(t)]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toEqual([{ status: 'fulfilled', value: 'publicada' }]);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await snapshots(m)).toMatchObject([{ pedidos: 3n, linhas: [{ pedidos: 3n }] }]);
    expect(await m.cliente.kpiIfoodDia.count()).toBe(1);
  });

  it('unidade CENTAVO declarada preserva inteiros seguros acima de Int32 sem multiplicar por 100', async () => {
    const m = await massa();
    const t = await adquirir(m, { unidade: 'CENTAVO' });
    await m.repo.salvarPagina(t, pagina([{ ...grupo(), gmv: { sum: Number.MAX_SAFE_INTEGER }, gmvWithoutDelivery: { sum: 1999 }, refundedTotalValue: { sum: -1 } }]));
    expect(await m.repo.publicar(t)).toBe('publicada');
    expect((await snapshots(m))[0].linhas[0]).toMatchObject({ gmv: 9007199254740991n, gmvWithoutDelivery: 1999n, refundedTotalValue: -1n });
  });

  it('só o vazio oficial gera snapshot zero; nenhuma página recebida não é zero', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await expect(m.repo.publicar(t)).rejects.toThrow();
    expect(await snapshots(m)).toEqual([]);
    await m.repo.salvarPagina(t, pagina([], 1, 0, 500));
    expect(await m.repo.publicar(t)).toBe('vazia');
    expect(await snapshots(m)).toMatchObject([{ vazioOficial: true, pedidos: 0n, linhas: [] }]);
  });

  it('ciclo terminal repetido não reabre; revisão idêntica em outro ciclo não duplica snapshot ou KPI', async () => {
    const m = await massa();
    const primeira = await publicar(m);
    const antes = await snapshots(m);
    await agendarJanela(m.cliente, { ...m.janela, tipo: 'REVISAO' });
    expect(await m.repo.adquirir()).toBeNull();
    const revisao = await adquirir(m, { tipo: 'REVISAO', ciclo: '2026-10-21' });
    expect(revisao).toMatchObject({ id: primeira.id, geracao: 2 });
    await m.repo.salvarPagina(revisao, pagina());
    expect(await m.repo.publicar(revisao)).toBe('sem-mudanca');
    expect(await snapshots(m)).toEqual(antes);
    expect(await m.cliente.integracaoPayload.count()).toBe(2);
  });

  it('revisão diferente acrescenta versão imutável e mantém o snapshot anterior', async () => {
    const m = await massa();
    await publicar(m);
    const [antes] = await snapshots(m);
    await publicar(m, pagina([grupo('STATUS_NOVO', 8)]), { tipo: 'REVISAO', ciclo: '2026-10-21' });
    const depois = await snapshots(m);
    expect(depois).toHaveLength(2);
    expect(depois[0]).toEqual(antes);
    expect(depois[1]).toMatchObject({ geracao: 2, pedidos: 8n, situacao: 'PUBLICADO' });
    await expect(m.cliente.integracaoSnapshot.update({ where: { id: antes.id }, data: { pedidos: 99n } })).rejects.toThrow();
    await expect(m.cliente.kpiIfoodDia.update({ where: { id: antes.linhas[0].id }, data: { gmv: 1n } })).rejects.toThrow();
  });

  it('falha SQL tardia após snapshot e duas linhas desfaz toda a publicação, sem apagar raw nem a versão válida', async () => {
    const m = await massa();
    await publicar(m);
    const antes = await snapshots(m);
    const t = await adquirir(m, { tipo: 'REVISAO', ciclo: '2026-10-21' });
    await m.repo.salvarPagina(t, pagina([grupo('PRIMEIRA'), grupo('SEGUNDA')]));
    const execucaoAntes = await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id } });
    const rawAntes = await m.cliente.integracaoPayload.findMany({ orderBy: { geracao: 'asc' } });
    const nome = `qa_pipeline_${randomUUID().replaceAll('-', '')}`;
    // O nome é gerado localmente; o id usado no SQL vem do Prisma, nunca de entrada externa.
    expect(m.cliente.parceiroId).toMatch(/^[a-z0-9]+$/);
    await db.$executeRawUnsafe(`CREATE FUNCTION public.${nome}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."parceiroId" = '${m.cliente.parceiroId}' AND NEW."orderStatus" = 'SEGUNDA' THEN
          IF (SELECT count(*) FROM "KpiIfoodDia" WHERE "snapshotId"=NEW."snapshotId") <> 2
            OR NOT EXISTS (SELECT 1 FROM "IntegracaoSnapshot" WHERE id=NEW."snapshotId" AND geracao=2) THEN
            RAISE EXCEPTION 'QA estágio intermediário não atingido';
          END IF;
          RAISE EXCEPTION 'QA rollback após snapshot e duas linhas' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE CONSTRAINT TRIGGER ${nome} AFTER INSERT ON "KpiIfoodDia" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.${nome}()`);
      await expect(m.repo.publicar(t)).rejects.toThrow(/QA rollback após snapshot e duas linhas/);
      expect(await snapshots(m)).toEqual(antes);
      expect(await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id } })).toEqual(execucaoAntes);
      expect(await m.cliente.integracaoPayload.findMany({ orderBy: { geracao: 'asc' } })).toEqual(rawAntes);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${nome} ON "KpiIfoodDia"`);
      await db.$executeRawUnsafe(`DROP FUNCTION public.${nome}()`);
    }
  });

  it('perder a sessão advisory depois dos INSERTs e antes do COMMIT impede a publicação inteira', async () => {
    const m = await massa();
    await publicar(m);
    const antes = await snapshots(m);
    const t = await adquirir(m, { tipo: 'REVISAO', ciclo: '2026-10-21' });
    await m.repo.salvarPagina(t, pagina([grupo('PRIMEIRA'), grupo('SEGUNDA')]));
    const execucaoAntes = await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id } });
    const cliente = antesDoCommit(m.cliente, async tx => {
      const novo = await tx.integracaoSnapshot.findFirstOrThrow({ where: { execucaoId: t.id, geracao: 2 } });
      expect(await tx.kpiIfoodDia.count({ where: { snapshotId: novo.id } })).toBe(2);
      const nome = `flowfoods-analytics:${dono.id}`;
      const sessoes = await outraConexao.$queryRaw<{ pid: number; inicio: string }[]>`SELECT pid,backend_start::text AS inicio FROM pg_stat_activity WHERE datname=current_database() AND application_name=${nome}`;
      expect(sessoes).toHaveLength(1);
      const s = sessoes[0];
      const encerrada = await outraConexao.$queryRaw<{ encerrou: boolean }[]>`SELECT pg_terminate_backend(pid) AS encerrou FROM pg_stat_activity WHERE datname=current_database() AND application_name=${nome} AND pid=${s.pid} AND backend_start::text=${s.inicio} AND pid<>pg_backend_pid()`;
      expect(encerrada).toEqual([{ encerrou: true }]);
      sessoesEncerradasPeloTeste.add(dono.id);
      expect(await dono.confirmar()).toBe(false);
    });
    await expect(criarRepositorioAnalytics(cliente, dono, () => true).publicar(t)).rejects.toThrow();
    expect(await snapshots(m)).toEqual(antes);
    expect(await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id } })).toEqual(execucaoAntes);
    expect(await m.cliente.integracaoPayload.count()).toBe(2);
    expect(await dono.confirmar()).toBe(false);
  });

  it('revogação concorrente espera a publicação já travada e passa a bloquear novos efeitos após o commit', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await m.repo.salvarPagina(t, pagina());
    let revogar: ReturnType<typeof mudarLiberacao> | undefined;
    const cliente = antesDoCommit(m.cliente, async tx => {
      expect(await tx.integracaoSnapshot.count()).toBe(1);
      revogar = mudarLiberacao(m.outroCliente, 'integracao', false, AUTOR);
      await esperarOutraConexaoBloqueada();
    });
    expect(await criarRepositorioAnalytics(cliente, dono, () => true).publicar(t)).toBe('publicada');
    expect(await revogar).toMatchObject({ ok: true, liberado: false });
    await expect(agendarJanela(m.cliente, { ...m.janela, ciclo: '2026-10-21' })).rejects.toMatchObject({ codigo: 'ACESSO' });
    expect(await snapshots(m)).toMatchObject([{ situacao: 'PUBLICADO', pedidos: 3n }]);
  });

  it('403 concorrente à publicação não causa upgrade deadlock nem altera módulo após perder a geração', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await m.repo.salvarPagina(t, pagina());
    let recusa: Promise<{ erro: unknown }> | undefined;
    const outroRepo = criarRepositorioAnalytics(m.outroCliente, dono, () => true);
    const cliente = antesDoCommit(m.cliente, async tx => {
      expect(await tx.integracaoSnapshot.count()).toBe(1);
      recusa = outroRepo.falhar(t, { codigo: 'sem-permissao', http: 403 }).then(() => ({ erro: null }), erro => ({ erro }));
      await esperarOutraConexaoBloqueada();
    });
    expect(await criarRepositorioAnalytics(cliente, dono, () => true).publicar(t)).toBe('publicada');
    expect(await recusa).toMatchObject({ erro: { codigo: 'POSSE' } });
    expect(await m.cliente.integracaoConexaoModulo.findUnique({ where: { id: m.moduloId } })).toMatchObject({ estado: 'ATIVO' });
    expect(await snapshots(m)).toMatchObject([{ situacao: 'PUBLICADO', pedidos: 3n }]);
  });

  it('período fechado recebe versão pendente, preserva a última publicada e o DRE fechado', async () => {
    const m = await massa();
    await publicar(m);
    const [anterior] = await snapshots(m);
    const periodo = await m.cliente.transacao((tx) => criarPeriodoFechadoDeTeste(tx, { nome: 'Período sintético', inicio: '2026-10-01', fim: '2026-10-31' }));
    const dre = await m.cliente.dreFotografia.findMany();
    const t = await adquirir(m, { tipo: 'REVISAO', ciclo: '2026-10-21' });
    await m.repo.salvarPagina(t, pagina([grupo('STATUS_NOVO', 8)]));
    expect(await m.repo.publicar(t)).toBe('pendente-periodo');
    const depois = await snapshots(m);
    expect(depois).toHaveLength(2);
    expect(depois[0]).toEqual(anterior);
    expect(depois[1]).toMatchObject({ geracao: 2, situacao: 'PENDENTE_PERIODO', pedidos: 8n });
    expect(await m.cliente.dreFotografia.findMany()).toEqual(dre);
    expect(await m.cliente.periodoApuracao.findUnique({ where: { id: periodo.id } })).toMatchObject({ status: 'FECHADO' });
  });

  it('lease vencido não autoriza a mesma posse a roubar sua própria tarefa pendurada', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await cru(db, perfil, m.cliente.parceiroId, 'UPDATE "IntegracaoExecucao" SET "leaseAte"=now()-interval \'1 second\' WHERE id=$1', t.id);
    expect(await m.repo.adquirir()).toBeNull();
    await expect(m.repo.renovar(t)).rejects.toMatchObject({ codigo: 'POSSE' });
    expect(await m.cliente.integracaoExecucao.findUnique({ where: { id: t.id } })).toMatchObject({ geracao: 1, dono: dono.id });
  });

  it('novo líder retoma lease vencido, cerca o executor antigo e não mistura páginas de gerações', async () => {
    const m = await massa();
    const antiga = await adquirir(m);
    await m.repo.salvarPagina(antiga, pagina([grupo('ANTIGO')]));
    await encerrarPosse(dono.id);
    const novo = await assumirPosse();
    const repoNovo = criarRepositorioAnalytics(m.outroCliente, novo, () => true);
    const repoAntigoMentindo = criarRepositorioAnalytics(m.cliente, { id: dono.id, confirmar: async () => true }, () => true);
    expect(await repoNovo.adquirir()).toBeNull();
    await cru(db, perfil, m.cliente.parceiroId, 'UPDATE "IntegracaoExecucao" SET "leaseAte"=now()-interval \'1 second\' WHERE id=$1', antiga.id);
    const atual = await repoNovo.adquirir();
    expect(atual).toMatchObject({ id: antiga.id, geracao: 2, dono: novo.id });
    for (const efeito of [() => repoAntigoMentindo.renovar(antiga), () => repoAntigoMentindo.salvarPagina(antiga, pagina([grupo('INTRUSO')], 2, 2, 1)), () => repoAntigoMentindo.publicar(antiga), () => repoAntigoMentindo.falhar(antiga, { codigo: 'indisponivel', http: 503 })]) {
      await expect(efeito()).rejects.toMatchObject({ codigo: expect.stringMatching(/^(POSSE|ACESSO)$/) });
    }
    expect(await dono.confirmar()).toBe(false);
    await expect(repoNovo.publicar(atual!)).rejects.toThrow();
    await repoNovo.salvarPagina(atual!, pagina([grupo('NOVO', 11)]));
    expect(await repoNovo.publicar(atual!)).toBe('publicada');
    expect(await snapshots(m)).toMatchObject([{ geracao: 2, pedidos: 11n, linhas: [{ orderStatus: 'NOVO' }] }]);
    expect(await m.cliente.integracaoPayload.count()).toBe(2);
  });

  it('trocar dono global impede publicação mesmo antes de vencer o lease da linha', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await m.repo.salvarPagina(t, pagina());
    await encerrarPosse(dono.id);
    await assumirPosse();
    m.repo = criarRepositorioAnalytics(m.cliente, { id: dono.id, confirmar: async () => true }, () => true);
    await expect(m.repo.publicar(t)).rejects.toMatchObject({ codigo: expect.stringMatching(/^(POSSE|ACESSO)$/) });
    expect(await snapshots(m)).toEqual([]);
  });

  it('posse não confirmada não se registra nem substitui o líder válido', async () => {
    const m = await massa();
    await expect(registrarDonoAnalytics(posse(false))).rejects.toThrow();
    const t = await adquirir(m);
    expect(t.dono).toBe(dono.id);
  });

  it('posse forjada sem advisory real não adquire nem grava, apesar de confirmar true', async () => {
    const m = await massa();
    await agendarJanela(m.cliente, m.janela);
    const falso = criarRepositorioAnalytics(m.cliente, posse(), () => true);
    expect(await falso.adquirir()).toBeNull();
    const t = await m.repo.adquirir();
    expect(t).not.toBeNull();
    await expect(falso.salvarPagina(t!, pagina())).rejects.toThrow();
    expect(await m.cliente.integracaoPayload.count()).toBe(0);
  });

  for (const falha of [
    ['página parcial', pagina([grupo()], 1, 2, 1)],
    ['métrica ausente', { ...pagina(), corpoOriginal: JSON.stringify({ ...JSON.parse(pagina().corpoOriginal), data: [{ groupByKey: grupo().groupByKey, gmv: { sum: 1 } }] }) }],
    ['subcentavo', pagina([{ ...grupo(), gmv: { sum: 0.001 } }])],
    ['REAL inseguro', pagina([{ ...grupo(), gmv: { sum: 2 ** 45 } }])],
  ] as const) {
    it(`recusa ${falha[0]} sem substituir a última versão válida`, async () => {
      const m = await massa();
      await publicar(m);
      const antes = await snapshots(m);
      const t = await adquirir(m, { tipo: 'REVISAO', ciclo: '2026-10-21' });
      await m.repo.salvarPagina(t, falha[1]);
      await expect(m.repo.publicar(t)).rejects.toThrow();
      expect(await snapshots(m)).toEqual(antes);
    });
  }

  it('TEST oficial preservado como raw continua incompleto/incompatível e não produz KPI', async () => {
    const m = await massa('TEST');
    const t = await adquirir(m);
    const corpoOriginal = readFileSync(join(process.cwd(), 'tests/fixtures/ifood-analytics-test-oficial-20261107.json'), 'utf8');
    expect(hash(corpoOriginal.trim())).toBe('3c78c4a9bd91d55b14c17de9c6ee3817c93940a0938fee950a62a122ca46f067');
    await m.repo.salvarPagina(t, { pagina: 1, http: 200, requestId: 'qa-oficial-test', corpoOriginal });
    await expect(m.repo.publicar(t)).rejects.toThrow();
    expect(await m.cliente.integracaoPayload.findFirst()).toMatchObject({ corpoOriginal, sha256: hash(corpoOriginal) });
    expect(await snapshots(m)).toEqual([]);
    expect(await m.cliente.kpiIfoodDia.count()).toBe(0);
  });

  it('TEST sintético compatível publica somente no parceiro de homologação e mantém a identidade TEST', async () => {
    const teste = await massa('TEST');
    const producao = await massa();
    const t = await publicar(teste);
    expect(t.identidade).toEqual({ ambiente: 'TEST', merchantId: teste.merchantId, dia: DIA, perfil: 'diario' });
    expect(await teste.cliente.kpiIfoodDia.count()).toBe(1);
    expect(await producao.cliente.kpiIfoodDia.count()).toBe(0);
    expect(await teste.cliente.faturamentoLancamento.count()).toBe(0);
    expect(await teste.cliente.dreFotografia.count()).toBe(0);
  });

  it('mesmo grão com category null repetido em páginas diferentes não duplica pedidos', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await m.repo.salvarPagina(t, pagina([grupo()], 1, 2, 1));
    await m.repo.salvarPagina(t, pagina([grupo()], 2, 2, 1));
    await expect(m.repo.publicar(t)).rejects.toThrow();
    expect(await snapshots(m)).toEqual([]);
  });

  it('totais alterados entre páginas não formam conjunto completo', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await m.repo.salvarPagina(t, pagina([grupo('A')], 1, 2, 1));
    await m.repo.salvarPagina(t, pagina([grupo('B')], 2, 3, 1));
    await expect(m.repo.publicar(t)).rejects.toThrow();
    expect(await snapshots(m)).toEqual([]);
  });

  for (const revogacao of ['liberação', 'módulo', 'app', 'conexão', 'parceiro', 'pausa global', 'chave geral'] as const) {
    it(`revogar ${revogacao} entre leitura e publicação preserva o snapshot anterior`, async () => {
      const m = await massa();
      await publicar(m);
      const antes = await snapshots(m);
      const t = await adquirir(m, { tipo: 'REVISAO', ciclo: '2026-10-21' });
      await m.repo.salvarPagina(t, pagina([grupo('REVISADO')]));
      if (revogacao === 'liberação') expect(await mudarLiberacao(m.cliente, 'integracao', false, AUTOR)).toMatchObject({ ok: true });
      if (revogacao === 'módulo') expect(await mudarModulo(m.cliente, m.moduloId, 'pausar', AUTOR)).toMatchObject({ ok: true });
      if (revogacao === 'app') await prisma.integracaoApp.update({ where: { id: m.appId }, data: { estadoHomologacao: 'RECUSADO' } });
      if (revogacao === 'conexão') expect(await desligarConexao(m.cliente, m.conexaoId, AUTOR)).toMatchObject({ ok: true });
      if (revogacao === 'parceiro') await db.parceiroFlow.update({ where: { id: m.cliente.parceiroId }, data: { status: 'SUSPENSO' } });
      if (revogacao === 'pausa global') await pausarAnalytics(true, AUTOR);
      if (revogacao === 'chave geral') m.repo = criarRepositorioAnalytics(m.cliente, dono, () => false);
      await expect(m.repo.renovar(t)).rejects.toThrow();
      await expect(m.repo.salvarPagina(t, pagina([grupo('EXTRA')], 2, 2, 1))).rejects.toThrow();
      await expect(m.repo.publicar(t)).rejects.toThrow();
      expect(await snapshots(m)).toEqual(antes);
    });
  }

  it('403 persiste recusa e módulo ERRO_PERMISSAO, sem fallback nem aquisição automática', async () => {
    const m = await massa();
    await publicar(m);
    const anterior = (await ultimoDiaAnalytics(m.cliente, m.moduloId, DIA))!.snapshot;
    const t = await adquirir(m, { tipo: 'REVISAO', ciclo: '2026-10-21' });
    await m.repo.falhar(t, { codigo: 'sem-permissao', http: 403, requestId: 'qa-403' });
    expect(await m.cliente.integracaoExecucao.findUnique({ where: { id: t.id } })).toMatchObject({ ultimoErro: 'sem-permissao', ultimoHttp: 403, ultimoRequestId: 'qa-403' });
    expect(await m.cliente.integracaoConexaoModulo.findUnique({ where: { id: m.moduloId } })).toMatchObject({ estado: 'ERRO_PERMISSAO' });
    expect(await m.repo.adquirir()).toBeNull();
    const leitura = await ultimoDiaAnalytics(m.cliente, m.moduloId, DIA);
    expect(leitura).toMatchObject({ estado: 'FALHA', erro: 'sem-permissao', snapshot: anterior });
    expect(leitura!.snapshot!.pedidos).toBe(3n);
  });

  it('429 guarda prazo distante exato, sobrevive a outro executor e não antecipa retomada', async () => {
    const m = await massa();
    await agendarJanela(m.cliente, m.janela);
    await agendarJanela(m.cliente, { ...m.janela, dia: '2026-10-18' });
    const t = await adquirir(m);
    expect(t.identidade.dia).toBe(DIA);
    const naoAntesDe = '2099-01-02T03:04:05.678Z';
    await m.repo.falhar(t, { codigo: 'limite', http: 429, requestId: 'qa-429', naoAntesDe });
    const linha = await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id } });
    expect(linha).toMatchObject({ ultimoErro: 'limite', ultimoHttp: 429, ultimoRequestId: 'qa-429' });
    expect(linha.naoAntesDe.toISOString()).toBe(naoAntesDe);
    expect((await prisma.integracaoControle.findUniqueOrThrow({ where: { id: 'IFOOD_ANALYTICS' } })).bloqueadaAte!.toISOString()).toBe(naoAntesDe);
    await encerrarPosse(dono.id);
    const novo = await assumirPosse();
    const repoNovo = criarRepositorioAnalytics(m.outroCliente, novo, () => true);
    expect(await repoNovo.adquirir()).toBeNull();
    // Expira só o relógio global na fixture: a janela A mantém seu Retry-After próprio.
    await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: new Date(Date.now() - 1000) } });
    const outraJanela = await repoNovo.adquirir();
    expect(outraJanela).toMatchObject({ identidade: { dia: '2026-10-18' } });
    expect(outraJanela!.id).not.toBe(t.id);
    expect((await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id } })).naoAntesDe.toISOString()).toBe(naoAntesDe);
  });

  it('429 sem Retry-After usa espera conservadora de quatro horas na janela e no controle global', async () => {
    const m = await massa();
    await agendarJanela(m.cliente, m.janela);
    await agendarJanela(m.cliente, { ...m.janela, dia: '2026-10-18' });
    const t = await adquirir(m);
    const antes = Date.now();
    await m.repo.falhar(t, { codigo: 'limite', http: 429, requestId: 'qa-429-sem-header' });
    const depois = Date.now();
    const e = await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id } });
    const c = await prisma.integracaoControle.findUniqueOrThrow({ where: { id: 'IFOOD_ANALYTICS' } });
    expect(e).toMatchObject({ estado: 'AGUARDANDO', ultimoErro: 'limite' });
    expect(e.naoAntesDe.getTime()).toBeGreaterThanOrEqual(antes + 4 * 60 * 60 * 1000);
    expect(e.naoAntesDe.getTime()).toBeLessThanOrEqual(depois + 4 * 60 * 60 * 1000);
    expect(c.bloqueadaAte).toEqual(e.naoAntesDe);
    expect(c.pausada).toBe(false);
    expect(await m.repo.adquirir()).toBeNull();
  });

  it('parceiro suspenso não modifica o cooldown global por função SQL chamada como leitura', async () => {
    const m = await massa();
    const t = await adquirir(m);
    await db.parceiroFlow.update({ where: { id: m.cliente.parceiroId }, data: { status: 'SUSPENSO' } });
    const negada = await m.cliente.transacao(tx => tx.sql<{ ok: boolean }>`SELECT erp_integracao_adiar(${tx.parceiroId},${t.id},${t.geracao}::int,${t.dono},${'2099-01-02T03:04:05.678Z'}::timestamptz,false) AS ok`);
    expect(negada).toEqual([{ ok: false }]);
    expect(await prisma.integracaoControle.findUnique({ where: { id: 'IFOOD_ANALYTICS' } })).toMatchObject({ bloqueadaAte: null, pausada: false });
    expect(await m.cliente.integracaoExecucao.findUnique({ where: { id: t.id } })).toMatchObject({ estado: 'EXECUTANDO', ultimoErro: null });
  });

  for (const mudanca of ['parceiro suspenso', 'lease expirado'] as const) {
    it(`429 recebido pelo líder é durável mesmo se a fila recusar depois por ${mudanca}`, async () => {
      const m = await massa();
      const t = await adquirir(m);
      if (mudanca === 'parceiro suspenso') await db.parceiroFlow.update({ where: { id: m.cliente.parceiroId }, data: { status: 'SUSPENSO' } });
      else await cru(db, perfil, m.cliente.parceiroId, 'UPDATE "IntegracaoExecucao" SET "leaseAte"=clock_timestamp()-interval \'1 second\' WHERE id=$1', t.id);
      const antes = await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id } });
      const naoAntesDe = '2099-01-02T03:04:05.678Z';
      await expect(m.repo.falhar(t, { codigo: 'limite', http: 429, requestId: 'qa-429-duravel', naoAntesDe })).rejects.toThrow();
      expect((await prisma.integracaoControle.findUniqueOrThrow({ where: { id: 'IFOOD_ANALYTICS' } })).bloqueadaAte!.toISOString()).toBe(naoAntesDe);
      expect(await m.cliente.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id } })).toEqual(antes);
      expect(await snapshots(m)).toEqual([]);
    });
  }

  for (const prazo of [
    { codigo: 'limite' as const, naoAntesDe: '+010000-01-01T00:00:00.000Z' },
    { codigo: 'prazo-invalido' as const },
  ]) {
    it(`prazo não armazenável (${prazo.codigo}) é recusa durável, inclusive em outro ciclo`, async () => {
      const m = await massa();
      const t = await adquirir(m);
      await m.repo.falhar(t, { ...prazo, http: 429, requestId: 'qa-prazo-invalido' });
      expect(await m.cliente.integracaoExecucao.findUnique({ where: { id: t.id } })).toMatchObject({ estado: 'FALHA', ultimoErro: 'prazo-invalido', ultimoHttp: 429 });
      expect(await prisma.integracaoControle.findUnique({ where: { id: 'IFOOD_ANALYTICS' } })).toMatchObject({ pausada: true });
      await expect(agendarJanela(m.cliente, { ...m.janela, tipo: 'REVISAO', ciclo: '2026-10-21' })).rejects.toMatchObject({ codigo: 'ACESSO' });
      await pausarAnalytics(false, AUTOR);
      await agendarJanela(m.cliente, { ...m.janela, tipo: 'REVISAO', ciclo: '2026-10-21' });
      expect(await m.repo.adquirir()).toBeNull();
      expect(await m.cliente.integracaoExecucao.findUnique({ where: { id: t.id } })).toMatchObject({ estado: 'FALHA', ultimoErro: 'prazo-invalido', geracao: 1 });
    });
  }

  it('ACESSO possui janela separada e HTTP200 não é publicação financeira', async () => {
    const m = await massa('TEST');
    const t = await adquirir(m, { tipo: 'ACESSO' });
    expect(t.perfil).toBe('acesso');
    await m.repo.salvarPagina(t, pagina());
    await expect(m.repo.publicar(t)).rejects.toMatchObject({ codigo: 'ENTRADA' });
    await m.repo.verificarAcesso(t);
    expect(await m.cliente.integracaoConexaoModulo.findUnique({ where: { id: m.moduloId } })).toMatchObject({ verificadoEm: expect.any(Date) });
    expect(await m.cliente.kpiIfoodDia.count()).toBe(0);
    expect(await snapshots(m)).toEqual([]);
    await agendarJanela(m.cliente, m.janela);
    expect(await m.cliente.integracaoExecucao.count()).toBe(2);
  });

  it('AUTORIZADO permite somente verificar acesso; não ativa o módulo nem agenda coleta diária', async () => {
    const m = await massa('TEST', false);
    await expect(agendarJanela(m.cliente, m.janela)).rejects.toMatchObject({ codigo: 'ACESSO' });
    const t = await adquirir(m, { tipo: 'ACESSO' });
    await m.repo.salvarPagina(t, pagina());
    await m.repo.verificarAcesso(t);
    expect(await m.cliente.integracaoConexaoModulo.findUnique({ where: { id: m.moduloId } })).toMatchObject({ estado: 'AUTORIZADO', verificadoEm: expect.any(Date) });
    await expect(agendarJanela(m.cliente, { ...m.janela, ciclo: '2026-10-21' })).rejects.toMatchObject({ codigo: 'ACESSO' });
    expect(await snapshots(m)).toEqual([]);
    expect(await m.cliente.kpiIfoodDia.count()).toBe(0);
  });

  it('outro tenant não lê as quatro tabelas nem publica tarefa forjada do parceiro original', async () => {
    const a = await massa();
    const b = await massa();
    const t = await publicar(a);
    expect(await Promise.all([
      b.cliente.integracaoExecucao.count(), b.cliente.integracaoPayload.count(),
      b.cliente.integracaoSnapshot.count(), b.cliente.kpiIfoodDia.count(),
    ])).toEqual([0, 0, 0, 0]);
    await expect(b.repo.publicar({ ...t, parceiroId: b.cliente.parceiroId })).rejects.toThrow();
    if (perfil.rls) {
      const contagens = await b.cliente.transacao((tx) => tx.sql<{ execucoes: number; payloads: number; snapshots: number; kpis: number }>`SELECT (SELECT count(*) FROM "IntegracaoExecucao")::int AS execucoes, (SELECT count(*) FROM "IntegracaoPayload")::int AS payloads, (SELECT count(*) FROM "IntegracaoSnapshot")::int AS snapshots, (SELECT count(*) FROM "KpiIfoodDia")::int AS kpis`);
      expect(contagens).toEqual([{ execucoes: 0, payloads: 0, snapshots: 0, kpis: 0 }]);
    }
    expect((await snapshots(a))[0]).toMatchObject({ situacao: 'PUBLICADO', pedidos: 3n });
  });

  it('outra conexão da mesma empresa não pode substituir a identidade persistida da tarefa', async () => {
    const m = await massa();
    const t = await adquirir(m);
    const loja = await cadastrarLoja(m.cliente, { nome: 'Segunda loja sintética' }, AUTOR);
    if (!loja.ok) throw new Error(JSON.stringify(loja));
    const merchantId = randomUUID();
    const c = await ligarConexao(m.cliente, { lojaId: loja.id, provedor: 'IFOOD', ambiente: 'PRODUCAO', idExterno: merchantId, nomeExterno: 'Segunda fictícia' }, { nome: AUTOR });
    if (!c.ok) throw new Error(JSON.stringify(c));
    const mod = await prepararModulo(m.cliente, c.id, m.appId, 'ANALYTICS', AUTOR);
    if (!mod.ok) throw new Error(JSON.stringify(mod));
    for (const acao of ['solicitar', 'autorizar', 'ativar'] as const) expect(await mudarModulo(m.cliente, mod.id, acao, AUTOR)).toMatchObject({ ok: true });
    const alteracoes: Partial<TarefaAnalytics>[] = [
      { moduloId: mod.id }, { lojaId: loja.id }, { appId: randomUUID() },
      { identidade: { ...t.identidade, merchantId } }, { fuso: 'UTC' }, { unidade: { moeda: 'BRL', unidade: 'CENTAVO' } },
    ];
    for (const alteracao of alteracoes) {
      await expect(m.repo.salvarPagina({ ...t, ...alteracao }, pagina())).rejects.toMatchObject({ codigo: 'ENTRADA' });
    }
    expect(await m.cliente.integracaoPayload.count()).toBe(0);
    await m.repo.salvarPagina(t, pagina());
    await expect(m.repo.publicar({ ...t, identidade: { ...t.identidade, merchantId } })).rejects.toMatchObject({ codigo: 'ENTRADA' });
    expect(await snapshots(m)).toEqual([]);
  });
});
