/** INT-1.7B: concorrência real em PostgreSQL descartável, sem transporte ou API. */
import { randomUUID } from 'node:crypto';
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
import { aplicarFaturamentoAnalytics } from '@/lib/erp/faturamento-integracao';
import { chaveHumana } from '@/lib/erp/faturamento-campos';
import { fecharPeriodo, situacaoDoFechamento } from '@/lib/erp/dre-fechamento';
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { pausarAnalytics } from '@/lib/integracoes/core/controle-analytics';
import { ErroDePosseAnalytics, type PosseAnalytics } from '@/lib/integracoes/core/posse-analytics';
import { agendarJanela, criarRepositorioAnalytics } from '@/lib/integracoes/ifood/pipeline-repositorio';
import {
  assumirPosseFinanceira, bucketFinanceiro, DIA_FINANCEIRO as DIA, massaFinanceira,
  publicarFinanceiro, type MassaFinanceira,
} from './integracao-faturamento-apoio';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const AUTOR = `QA concorrência financeira ${randomUUID()}`;
const data = (d: string) => new Date(`${d}T00:00:00Z`);

/** A operação e todas as queries são reais; só a devolução do callback da TX é retida. */
function reterAntesDoCommit<T>(cliente: ClienteDoParceiro, operacao: (c: ClienteDoParceiro) => Promise<T>) {
  let liberar!: () => void;
  let entregar!: (r: { tx: ClienteDoParceiro; pid: number }) => void;
  let recusar!: (e: unknown) => void;
  const solta = new Promise<void>(r => { liberar = r; });
  const pronta = new Promise<{ tx: ClienteDoParceiro; pid: number }>((r, e) => { entregar = r; recusar = e; });
  const adaptado = new Proxy({ ...cliente }, {
    get(alvo, propriedade) {
      if (propriedade === 'transacao') return (executar: Parameters<ClienteDoParceiro['transacao']>[0], opcoes: Parameters<ClienteDoParceiro['transacao']>[1]) => alvo.transacao(async tx => {
        const resultado = await executar(tx);
        const [p] = await tx.sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`;
        entregar({ tx, pid: p.pid });
        await solta;
        return resultado;
      }, { timeout: 30_000, ...opcoes });
      return Reflect.get(alvo, propriedade);
    },
  });
  const terminada = operacao(adaptado);
  // A falha anterior à barreira rejeita pronta; nunca depende de timeout para o diagnóstico.
  void terminada.catch(recusar);
  return { pronta, liberar, terminada };
}

describe.skipIf(!URL_TESTE)('INT-1.7B · cobertura, acesso, posse e fechamento concorrentes', { timeout: 120_000 }, () => {
  let db: PrismaClient, concorrente: PrismaClient;
  let perfil: PerfilDoBanco;
  let lider: Awaited<ReturnType<typeof assumirPosseFinanceira>>;
  let posseMorta = false;
  const inventario = { parceiros: [] as string[], apps: [] as string[], autor: AUTOR };
  const nomeConcorrente = `qa-fin-concorrente-${randomUUID()}`;
  const outro = (m: MassaFinanceira) => doParceiro(m.cliente.parceiroId, concorrente);
  const aplicar = (m: MassaFinanceira, c = m.cliente, p: PosseAnalytics = lider.posse) => aplicarFaturamentoAnalytics(c, p, { lojaId: m.lojaId, dia: DIA }, () => true);

  async function bloqueadaPor(pid: number) {
    await vi.waitFor(async () => {
      const [r] = await db.$queryRaw<{ bloqueada: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity a WHERE a.datname=current_database() AND a.application_name=${nomeConcorrente}
          AND ${pid}::int=ANY(pg_blocking_pids(a.pid))) AS bloqueada`;
      expect(r.bloqueada, 'a conexão concorrente precisa esperar o backend que reteve a TX').toBe(true);
    }, { timeout: 10_000, interval: 20 });
  }

  async function financeiro(c: ClienteDoParceiro) {
    return {
      lancamentos: await c.faturamentoLancamento.findMany({ orderBy: { id: 'asc' } }),
      fontes: await c.integracaoFaturamentoFonte.findMany({ orderBy: { id: 'asc' } }),
      historico: await c.historicoAlteracao.findMany({ where: { entidade: 'FaturamentoLancamento' }, orderBy: { id: 'asc' } }),
    };
  }
  async function massaAplicada() {
    const m = await massaFinanceira(db, inventario);
    await publicarFinanceiro(m, lider.posse);
    expect(await aplicar(m)).toMatchObject({ estado: 'aplicado', fontes: 1 });
    return m;
  }
  async function revisao(m: MassaFinanceira) {
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(34.99, 5)], { ciclo: '2026-10-21' });
  }
  async function prepararRecusa(m: MassaFinanceira, tipo: 'revogação' | '403') {
    if (tipo === 'revogação') return async (c: ClienteDoParceiro) => {
      expect(await mudarLiberacao(c, 'integracao', false, AUTOR)).toMatchObject({ ok: true });
    };
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, ciclo: '2026-10-22', tipo: 'REVISAO', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const t = await criarRepositorioAnalytics(m.cliente, lider.posse, () => true).adquirir();
    if (!t || t.moduloId !== m.moduloId) throw new Error('A fixture 403 não adquiriu sua revisão.');
    return (c: ClienteDoParceiro) => criarRepositorioAnalytics(c, lider.posse, () => true).falhar(t, { codigo: 'sem-permissao', http: 403, requestId: 'qa-financeiro-403' });
  }

  beforeAll(async () => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Somente PostgreSQL local descartável.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    const url = new URL(URL_TESTE!);
    url.searchParams.set('application_name', nomeConcorrente);
    url.searchParams.set('connection_limit', '1');
    concorrente = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    perfil = await perfilDoBanco(db);
  });
  beforeEach(async () => {
    await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: null, proximaChamadaEm: null } });
    await pausarAnalytics(false, AUTOR);
    posseMorta = false;
    lider = await assumirPosseFinanceira(URL_TESTE!);
  });
  afterEach(async () => {
    if (lider) {
      lider.liberar();
      if (posseMorta) await expect(lider.encerrada).rejects.toBeInstanceOf(ErroDePosseAnalytics);
      else await lider.encerrada;
    }
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { pausada: false, bloqueadaAte: null, proximaChamadaEm: null, donoAtual: null } });
      await limparParceiros(db, perfil, inventario.parceiros);
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" DISABLE TRIGGER "IntegracaoApp_nao_apaga"');
        await tx.$executeRawUnsafe('DELETE FROM "IntegracaoApp" WHERE id=ANY($1::text[])', inventario.apps);
        await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoApp" ENABLE TRIGGER "IntegracaoApp_nao_apaga"');
      });
      await prisma.auditLog.deleteMany({ where: { evento: 'integracao.analytics-pausa', dados: { path: ['autor'], equals: AUTOR } } });
    } finally { await Promise.all([db.$disconnect(), concorrente.$disconnect(), prisma.$disconnect()]); }
  }, 360_000);

  it('dois consumidores do mesmo grão serializam: um aplica, outro confirma igual sem duplicar fonte ou histórico', async () => {
    const m = await massaFinanceira(db, inventario);
    await publicarFinanceiro(m, lider.posse);
    const primeira = reterAntesDoCommit(m.cliente, c => aplicar(m, c));
    let segunda: ReturnType<typeof aplicar> | undefined;
    try {
      const { pid, tx } = await primeira.pronta;
      expect(await tx.faturamentoLancamento.count()).toBe(1);
      segunda = aplicar(m, outro(m));
      await bloqueadaPor(pid);
      primeira.liberar();
      const a = await primeira.terminada, b = await segunda;
      expect(a).toMatchObject({ estado: 'aplicado', fontes: 1 });
      expect(b).toEqual({ estado: 'igual', fontes: 1, reciboId: a.reciboId });
    } finally { primeira.liberar(); await Promise.allSettled([primeira.terminada, ...(segunda ? [segunda] : [])]); }
    const f = await financeiro(m.cliente);
    expect(f.lancamentos).toHaveLength(1);
    expect(f.lancamentos[0]).toMatchObject({ valorCentavos: 1999, pedidos: 3, clientes: null });
    expect(f.fontes).toHaveLength(1); expect(f.historico).toHaveLength(1);
  });

  it.each(['mesma loja', 'outra loja'] as const)('INSERT de conexão em %s espera o conjunto completo, depois sinaliza nova pendência', async onde => {
    const m = await massaFinanceira(db, inventario);
    await publicarFinanceiro(m, lider.posse);
    let lojaId = m.lojaId;
    if (onde === 'outra loja') {
      const l = await cadastrarLoja(m.cliente, { nome: 'Outra loja sintética' }, AUTOR);
      if (!l.ok) throw new Error('Não criou a outra loja.');
      lojaId = l.id;
    }
    const primeira = reterAntesDoCommit(m.cliente, c => aplicar(m, c));
    let inclusao: Promise<unknown> | undefined;
    try {
      const { pid } = await primeira.pronta;
      // SQL via portão: a linha nova ainda não existia quando o writer enumerou o conjunto.
      // Na outra loja, um vínculo histórico desligado reproduz a identidade ambígua sem violar o UNIQUE ativo.
      inclusao = outro(m).integracaoConexao.create({ data: { parceiroId: m.cliente.parceiroId, lojaId,
        provedor: 'IFOOD', ambiente: 'PRODUCAO', idExterno: onde === 'outra loja' ? m.merchantId : randomUUID(),
        nomeExterno: 'Inclusão concorrente sintética', criadoPorNome: AUTOR, estado: onde === 'outra loja' ? 'DESLIGADA' : 'ATIVA',
        ...(onde === 'outra loja' ? { desligadaEm: new Date(), desligadaPorNome: AUTOR } : {}) } });
      await bloqueadaPor(pid);
      expect(await m.cliente.integracaoConexao.count()).toBe(1);
      primeira.liberar();
      expect(await primeira.terminada).toMatchObject({ estado: 'aplicado', fontes: 1 });
      await inclusao;
    } finally { primeira.liberar(); await Promise.allSettled([primeira.terminada, ...(inclusao ? [inclusao] : [])]); }
    const anterior = await financeiro(m.cliente);
    const recibo = await m.cliente.integracaoFaturamentoDia.findFirst();
    expect(recibo?.estado).toBe('PENDENTE');
    expect(recibo!.revisaoSolicitada).toBeGreaterThan(recibo!.revisaoConferida);
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: onde === 'outra loja' ? 'VINCULO_AMBIGUO' : 'ACESSO' });
    expect(await financeiro(m.cliente)).toEqual(anterior);
    expect(anterior.lancamentos[0]).toMatchObject({ valorCentavos: 1999, pedidos: 3 });
  });

  it('inclusão ainda não confirmada vence a cobertura; consumidor espera e não publica somente o merchant antigo', async () => {
    const m = await massaFinanceira(db, inventario);
    await publicarFinanceiro(m, lider.posse);
    const inclusao = reterAntesDoCommit(m.cliente, c => c.transacao(tx => tx.integracaoConexao.create({ data: {
      parceiroId: tx.parceiroId, lojaId: m.lojaId, provedor: 'IFOOD', ambiente: 'PRODUCAO', idExterno: randomUUID(),
      nomeExterno: 'Segundo merchant sem snapshot', criadoPorNome: AUTOR,
    } })));
    let consumo: ReturnType<typeof aplicar> | undefined;
    try {
      const { pid } = await inclusao.pronta;
      consumo = aplicar(m, outro(m));
      await bloqueadaPor(pid);
      inclusao.liberar(); await inclusao.terminada;
      expect(await consumo).toMatchObject({ estado: 'pendente', motivo: 'ACESSO' });
    } finally { inclusao.liberar(); await Promise.allSettled([inclusao.terminada, ...(consumo ? [consumo] : [])]); }
    expect(await financeiro(m.cliente)).toEqual({ lancamentos: [], fontes: [], historico: [] });
  });

  it.each(['revogação', '403'] as const)('%s anterior ao consumer é observada depois do bloqueio, preservando a aplicação anterior', async tipo => {
    const m = await massaAplicada();
    const anterior = await financeiro(m.cliente);
    await revisao(m);
    const recusar = await prepararRecusa(m, tipo);
    const recusa = reterAntesDoCommit(m.cliente, recusar);
    let consumo: ReturnType<typeof aplicar> | undefined;
    try {
      const { pid } = await recusa.pronta;
      consumo = aplicar(m, outro(m));
      await bloqueadaPor(pid);
      recusa.liberar(); await recusa.terminada;
      expect(await consumo).toMatchObject({ estado: 'pendente', motivo: 'ACESSO' });
    } finally { recusa.liberar(); await Promise.allSettled([recusa.terminada, ...(consumo ? [consumo] : [])]); }
    expect(await financeiro(m.cliente)).toEqual(anterior);
    if (tipo === '403') expect(await m.cliente.integracaoExecucao.findFirst()).toMatchObject({ estado: 'FALHA', ultimoHttp: 403, ultimoErro: 'sem-permissao' });
  });

  it.each(['revogação', '403'] as const)('%s que chega após o consumer espera sua transação, sem deadlock e sem apagar o último valor válido', async tipo => {
    const m = await massaAplicada();
    await revisao(m);
    const recusar = await prepararRecusa(m, tipo);
    const consumo = reterAntesDoCommit(m.cliente, c => aplicar(m, c));
    let recusa: Promise<void> | undefined;
    try {
      const { pid } = await consumo.pronta;
      recusa = recusar(outro(m));
      await bloqueadaPor(pid);
      consumo.liberar();
      expect(await consumo.terminada).toMatchObject({ estado: 'aplicado', fontes: 1 });
      await recusa;
    } finally { consumo.liberar(); await Promise.allSettled([consumo.terminada, ...(recusa ? [recusa] : [])]); }
    const aplicado = await financeiro(m.cliente);
    expect(aplicado.lancamentos).toHaveLength(1);
    expect(aplicado.lancamentos[0]).toMatchObject({ valorCentavos: 3499, pedidos: 5, clientes: null });
    expect(aplicado.historico).toHaveLength(2);
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: 'ACESSO' });
    expect(await financeiro(m.cliente)).toEqual(aplicado);
  });

  it('outra integração concorrente espera e é recusada após a aplicação, sem surgir contribuição extra no grão', async () => {
    const m = await massaFinanceira(db, inventario);
    await publicarFinanceiro(m, lider.posse);
    const consumo = reterAntesDoCommit(m.cliente, c => aplicar(m, c));
    let inclusao: Promise<{ erro: unknown }> | undefined;
    try {
      const { pid } = await consumo.pronta;
      inclusao = outro(m).faturamentoLancamento.create({ data: { parceiroId: m.cliente.parceiroId, lojaId: m.lojaId,
        canal: 'IFOOD', data: data(DIA), origem: 'INTEGRACAO', chaveIdempotencia: `outra:${randomUUID()}`, origemRef: 'fixture-outra-integracao',
        valorCentavos: 777, pedidos: 1, clientes: null } }).then(() => ({ erro: null }), erro => ({ erro }));
      await bloqueadaPor(pid);
      consumo.liberar(); await consumo.terminada;
      const r = await inclusao;
      expect(r.erro).toBeInstanceOf(Error);
      expect(String(r.erro)).toContain('Outra integração já ocupa o conjunto Analytics');
    } finally { consumo.liberar(); await Promise.allSettled([consumo.terminada, ...(inclusao ? [inclusao] : [])]); }
    expect((await financeiro(m.cliente)).lancamentos).toMatchObject([{ valorCentavos: 1999, pedidos: 3 }]);
  });

  it('UPDATE de integração alheia existente disputa linha → cobertura sem deadlock; consumer recusa sem tocar esse ledger', async () => {
    const m = await massaFinanceira(db, inventario);
    await publicarFinanceiro(m, lider.posse);
    const alheia = await m.cliente.faturamentoLancamento.create({ data: { parceiroId: m.cliente.parceiroId,
      lojaId: m.lojaId, canal: 'IFOOD', data: data(DIA), origem: 'INTEGRACAO',
      chaveIdempotencia: `outra:${randomUUID()}`, origemRef: 'fixture-integracao-ja-existente',
      valorCentavos: 777, pedidos: 1, clientes: null } });
    const consumo = reterAntesDoCommit(m.cliente, c => aplicar(m, c));
    let mudanca: Promise<unknown> | undefined;
    try {
      const { pid, tx } = await consumo.pronta;
      expect(await tx.integracaoFaturamentoDia.findFirst()).toMatchObject({ estado: 'PENDENTE_DADOS', motivo: 'OUTRA_INTEGRACAO' });
      expect(await tx.faturamentoLancamento.findUnique({ where: { id: alheia.id } })).toEqual(alheia);
      // O UPDATE toma a linha antes de seu BEFORE trigger pedir a cobertura já retida pelo consumer.
      mudanca = outro(m).faturamentoLancamento.update({ where: { id: alheia.id }, data: { valorCentavos: 888 } });
      await bloqueadaPor(pid);
      consumo.liberar();
      expect(await consumo.terminada).toMatchObject({ estado: 'pendente', motivo: 'OUTRA_INTEGRACAO' });
      await mudanca;
    } finally { consumo.liberar(); await Promise.allSettled([consumo.terminada, ...(mudanca ? [mudanca] : [])]); }
    const atual = await financeiro(m.cliente);
    expect(atual.lancamentos).toHaveLength(1);
    expect(atual.lancamentos[0]).toMatchObject({ id: alheia.id, origemRef: alheia.origemRef, valorCentavos: 888, pedidos: 1 });
    expect(atual.fontes).toEqual([]); expect(atual.historico).toEqual([]);
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: 'OUTRA_INTEGRACAO' });
    expect(await financeiro(m.cliente)).toEqual(atual);
  });

  it('morte da sessão advisory após ledger e conclusão, antes do COMMIT, desfaz toda a revisão e conserva a aplicação anterior', async () => {
    const m = await massaAplicada();
    await revisao(m);
    const anterior = await financeiro(m.cliente);
    const reciboAnterior = await m.cliente.integracaoFaturamentoDia.findFirst();
    const consumo = reterAntesDoCommit(m.cliente, c => aplicar(m, c));
    try {
      const { tx } = await consumo.pronta;
      expect(await tx.faturamentoLancamento.findFirst()).toMatchObject({ valorCentavos: 3499, pedidos: 5 });
      expect(await tx.historicoAlteracao.count({ where: { entidade: 'FaturamentoLancamento' } })).toBe(2);
      expect(await tx.integracaoFaturamentoDia.findFirst()).toMatchObject({ estado: 'APLICADO' });
      const nome = `flowfoods-analytics:${lider.posse.id}`;
      const sessoes = await db.$queryRaw<{ pid: number; inicio: string }[]>`SELECT a.pid,a.backend_start::text AS inicio
        FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid AND l.database=a.datid
        WHERE a.datname=current_database() AND a.application_name=${nome} AND l.locktype='advisory'
          AND l.classid=1179009358::oid AND l.objid=1::oid AND l.objsubid=2 AND l.granted`;
      expect(sessoes).toHaveLength(1);
      const s = sessoes[0];
      const encerradas = await db.$queryRaw<{ encerrada: boolean }[]>`SELECT pg_terminate_backend(a.pid,5000) AS encerrada
        FROM pg_stat_activity a WHERE a.pid=${s.pid}::int AND a.backend_start::text=${s.inicio}
          AND a.application_name=${nome} AND a.datname=current_database() AND a.pid<>pg_backend_pid()`;
      expect(encerradas).toEqual([{ encerrada: true }]);
      posseMorta = true;
      consumo.liberar();
      await expect(consumo.terminada).rejects.toThrow('posse viva');
    } finally { consumo.liberar(); await Promise.allSettled([consumo.terminada]); }
    expect(await financeiro(m.cliente)).toEqual(anterior);
    expect(await m.cliente.integracaoFaturamentoDia.findFirst()).toEqual(reciboAnterior);
    expect(await m.cliente.integracaoSnapshot.count({ where: { situacao: 'PUBLICADO' } })).toBe(2);
    expect(await lider.posse.confirmar()).toBe(false);
  });

  it.each(['aplicação primeiro', 'fechamento primeiro'] as const)('fechamento real do DRE × revisão financeira: %s mantém a fotografia completa', async ordem => {
    const m = await massaAplicada();
    await m.cliente.loja.update({ where: { id: m.lojaId }, data: { canaisDeVenda: ['IFOOD'] } });
    await m.cliente.canalConfig.create({ data: { parceiroId: m.cliente.parceiroId, canal: 'IFOOD', taxaConfigurada: true, taxaBp: 0 } });
    await m.cliente.faturamentoLancamento.createMany({ data: Array.from({ length: 31 }, (_, i) => ({
      parceiroId: m.cliente.parceiroId, lojaId: m.lojaId, data: data(`2026-10-${String(i + 1).padStart(2, '0')}`),
      canal: 'IFOOD' as const, origem: 'MANUAL' as const, chaveIdempotencia: chaveHumana(m.lojaId, 'IFOOD', `2026-10-${String(i + 1).padStart(2, '0')}`),
      valorCentavos: 0, pedidos: 0, clientes: 0,
    })) });
    await revisao(m);
    const situacao = await situacaoDoFechamento(m.cliente, ALCANCE_FLOWFOODS, '2026-10-01', '2026-11-07');
    expect(situacao?.condicoes?.duras).toEqual([]);
    const fechar = (c: ClienteDoParceiro) => fecharPeriodo(c, ALCANCE_FLOWFOODS, {
      inicio: '2026-10-01', ressalvas: situacao!.condicoes!.ressalvas.map(x => x.id),
      justificativa: 'Fechamento sintético para verificar a concorrência financeira.',
    }, AUTOR, '2026-11-07');
    if (ordem === 'aplicação primeiro') {
      const consumo = reterAntesDoCommit(m.cliente, c => aplicar(m, c));
      let fechamento: ReturnType<typeof fechar> | undefined;
      try {
        const { pid } = await consumo.pronta;
        fechamento = fechar(outro(m));
        await bloqueadaPor(pid);
        consumo.liberar();
        expect(await consumo.terminada).toMatchObject({ estado: 'aplicado' });
        expect(await fechamento).toMatchObject({ ok: true, versao: 1, jaFechado: false });
      } finally { consumo.liberar(); await Promise.allSettled([consumo.terminada, ...(fechamento ? [fechamento] : [])]); }
    } else {
      const fechamento = reterAntesDoCommit(m.cliente, fechar);
      let consumo: ReturnType<typeof aplicar> | undefined;
      try {
        const { pid } = await fechamento.pronta;
        consumo = aplicar(m, outro(m));
        await bloqueadaPor(pid);
        fechamento.liberar();
        expect(await fechamento.terminada).toMatchObject({ ok: true, versao: 1, jaFechado: false });
        expect(await consumo).toMatchObject({ estado: 'pendente', motivo: 'PERIODO_FECHADO' });
      } finally { fechamento.liberar(); await Promise.allSettled([fechamento.terminada, ...(consumo ? [consumo] : [])]); }
    }
    const valor = ordem === 'aplicação primeiro' ? 3499 : 1999;
    const fotos = await m.cliente.dreFotografia.findMany();
    expect(fotos).toHaveLength(1);
    expect(fotos[0].entrada).toMatchObject({ receitas: [{ lojaId: m.lojaId, canal: 'IFOOD', valorCentavos: valor }] });
    expect(await m.cliente.periodoApuracao.findFirst({ where: { inicio: data('2026-10-01') } })).toMatchObject({ status: 'FECHADO' });
    expect(await m.cliente.faturamentoLancamento.findFirst({ where: { origem: 'INTEGRACAO' } })).toMatchObject({ valorCentavos: valor, clientes: null });
  });
});
