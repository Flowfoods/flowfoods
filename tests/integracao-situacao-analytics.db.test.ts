/** INT-1.8A: leituras reais em PostgreSQL descartável. Não chama o provedor. */
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
import { resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import { obterDia } from '@/lib/erp/faturamento';
import { aplicarFaturamentoAnalytics } from '@/lib/erp/faturamento-integracao';
import { desligarConexao, mudarModulo } from '@/lib/integracoes/core/conexoes';
import { pausarAnalytics } from '@/lib/integracoes/core/controle-analytics';
import { lerOrigemAnalyticsNoFaturamento, lerSituacaoAnalyticsDaLoja } from '@/lib/integracoes/core/situacao-analytics';
import { agendarJanela, criarRepositorioAnalytics } from '@/lib/integracoes/ifood/pipeline-repositorio';
import { criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { assumirPosseFinanceira, bucketFinanceiro, DIA_FINANCEIRO, massaFinanceira, publicarFinanceiro, type MassaFinanceira } from './integracao-faturamento-apoio';

const inventario = { parceiros: [] as string[], apps: [] as string[], autor: `QA Situação ${randomUUID()}` };
const DIA = DIA_FINANCEIRO;
const todas = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const al = (lojaId: string, permissoes: Permissao[] = ['integracao.ver']): Alcance => ({ nivel: 'LOJA', lojas: [lojaId], permissoes: new Set(permissoes) });
const contexto = (m: MassaFinanceira) => ({ parceiroId: m.cliente.parceiroId, homologacaoDeIntegracao: m.ambiente === 'TEST' });

describe.skipIf(!URL_TESTE)('INT-1.8A · fotografia e isolamento reais', { timeout: 120_000 }, () => {
  let db: PrismaClient, concorrente: PrismaClient, perfil: PerfilDoBanco;
  let lider: Awaited<ReturnType<typeof assumirPosseFinanceira>>;
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Somente banco local descartável.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    concorrente = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    perfil = await perfilDoBanco(db);
  });
  beforeEach(async () => {
    await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: null, proximaChamadaEm: null } });
    await pausarAnalytics(false, inventario.autor); lider = await assumirPosseFinanceira(URL_TESTE!);
  });
  afterEach(async () => { if (lider) { lider.liberar(); await lider.encerrada; } });
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
      await prisma.auditLog.deleteMany({ where: { evento: 'integracao.analytics-pausa', dados: { path: ['autor'], equals: inventario.autor } } });
    } finally { await Promise.all([db.$disconnect(), concorrente.$disconnect(), prisma.$disconnect()]); }
  }, 360_000);
  const massa = () => massaFinanceira(db, inventario);
  const aplicar = (m: MassaFinanceira, c = m.cliente) => aplicarFaturamentoAnalytics(c, lider.posse, { lojaId: m.lojaId, dia: DIA }, () => true);
  const ler = (m: MassaFinanceira, c = m.cliente, a = al(m.lojaId)) => lerSituacaoAnalyticsDaLoja(c, a, contexto(m), { lojaId: m.lojaId, dia: DIA });

  it('sem as permissões/modulo ou com loja/tenant forjados não devolve situação', async () => {
    const m = await massa(), outro = await massa(); await publicarFinanceiro(m, lider.posse);
    expect(await ler(m, m.cliente, al(m.lojaId, ['faturamento.ver']))).toMatchObject({ ok: false, motivo: 'sem-permissao' });
    expect(await lerSituacaoAnalyticsDaLoja(m.cliente, al(m.lojaId), contexto(m), { lojaId: outro.lojaId, dia: DIA })).toMatchObject({ ok: false, motivo: 'loja-indisponivel' });
    expect(await lerSituacaoAnalyticsDaLoja(m.cliente, todas, contexto(m), { lojaId: outro.lojaId, dia: DIA })).toMatchObject({ ok: false, motivo: 'loja-indisponivel' });
    expect(await lerSituacaoAnalyticsDaLoja(m.cliente, todas, contexto(outro), { lojaId: m.lojaId, dia: DIA })).toMatchObject({ ok: false, motivo: 'contexto-invalido' });
    expect(await mudarLiberacao(m.cliente, 'integracao', false, inventario.autor)).toMatchObject({ ok: true });
    expect(await ler(m)).toMatchObject({ ok: false, motivo: 'sem-modulo' });
  });
  it('operacional não consulta Kpi/payload/dinheiro e nenhuma projeção financeira sai ao navegador', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const consultas: unknown[] = [];
    const protegido: ClienteDoParceiro = { ...m.cliente, transacao: (fn, opcoes) => m.cliente.transacao(async tx => {
      const envolver = <T extends object>(delegate: T): T => Object.fromEntries(Object.entries(delegate).map(([k, v]) => [k, typeof v === 'function' ? (...args: unknown[]) => {
        consultas.push(args); return v(...args);
      } : v])) as T;
      return fn({ ...tx, integracaoSnapshot: envolver(tx.integracaoSnapshot), integracaoExecucao: envolver(tx.integracaoExecucao), integracaoConexao: envolver(tx.integracaoConexao), integracaoFaturamentoDia: envolver(tx.integracaoFaturamentoDia),
        kpiIfoodDia: { ...tx.kpiIfoodDia, findMany: () => { throw new Error('Leu métricas.'); } },
        integracaoPayload: { ...tx.integracaoPayload, findMany: () => { throw new Error('Leu raw.'); } },
      });
    }, opcoes) };
    const r = await ler(m, protegido); expect(r).toMatchObject({ ok: true, situacao: { podeVerFaturamento: false, cobertura: 'disponivel', aplicacao: { estado: 'aplicado' } } });
    const texto = JSON.stringify({ r, consultas });
    for (const vedado of ['pedidos', 'valorCentavos', 'gmv', 'vazioOficial', 'numeroGrupos', 'ultimoHash', 'ultimoRequestId', 'appId', 'leaseAte', 'corpoOriginal']) expect(texto).not.toContain(vedado);
  });
  it('ausência de leitura difere de versão publicada, inclusive vazio oficial sem revelar zero', async () => {
    const m = await massa();
    expect(await ler(m)).toMatchObject({ situacao: { cobertura: 'sem-leitura', fontes: [{ tentativa: null, versaoDisponivel: null }] } });
    await publicarFinanceiro(m, lider.posse, []);
    const r = await ler(m);
    expect(r).toMatchObject({ situacao: { cobertura: 'disponivel', fontes: [{ tentativa: { estado: 'SUCESSO' }, versaoDisponivel: { publicadaEm: expect.any(String) } }] } });
    expect(JSON.stringify(r)).not.toMatch(/vazioOficial|zero vendas|"pedidos"/);
  });
  it('no-op seguido de falha mantém data da versão e distingue tentativa posterior', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); const a = await ler(m);
    await publicarFinanceiro(m, lider.posse, undefined, { ciclo: '2026-10-21' });
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'REVISAO', ciclo: '2026-10-22', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir();
    if (!t) throw new Error('Fixture sem tarefa.');
    await repo.falhar(t, { codigo: 'requisicao-invalida', http: 400, requestId: 'qa-operacional-400' });
    const b = await ler(m); if (!a.ok || !b.ok) throw new Error('Leitura recusada.');
    expect(b.situacao?.fontes[0].versaoDisponivel).toEqual(a.situacao?.fontes[0].versaoDisponivel);
    expect(b.situacao?.fontes[0].tentativa).toMatchObject({ estado: 'FALHA', mensagem: { rotulo: 'Pedido de leitura recusado' }, concluidaEm: expect.any(String) });
    expect(JSON.stringify(b)).not.toContain('qa-operacional-400');
  });
  it('período fechado conserva PUBLICADO e aplicação anterior com revisão pendente visível', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m); const a = await ler(m);
    await m.cliente.transacao(tx => criarPeriodoFechadoDeTeste(tx, { nome: 'QA período', inicio: '2026-10-01', fim: '2026-10-31' }));
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(34.99)], { ciclo: '2026-10-21' });
    const b = await ler(m); if (!a.ok || !b.ok) throw new Error('Leitura recusada.');
    expect(b.situacao?.fontes[0]).toMatchObject({ revisaoPendente: true, tentativa: { estado: 'PENDENTE_PERIODO' }, versaoDisponivel: a.situacao?.fontes[0].versaoDisponivel });
    expect(b.situacao?.aplicacao.aplicadoEm).toBe(a.situacao?.aplicacao.aplicadoEm);
  });
  it('vários merchants e fonte desligada não desaparecem e incompletude continua explícita', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const segunda = await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId });
    await aplicar(m);
    const r = await ler(m); expect(r).toMatchObject({ situacao: { cobertura: 'parcial', aplicacao: { estado: 'pendente', mantemAplicacaoAnterior: true } } });
    expect(await desligarConexao(m.cliente, m.conexaoId, inventario.autor)).toMatchObject({ ok: true });
    const d = await ler(m); if (!d.ok) throw new Error('Leitura recusada.');
    expect(d.situacao?.fontes).toHaveLength(2); expect(d.situacao?.fontes.find(f => f.chave === m.conexaoId)).toMatchObject({ vinculada: false, aplicada: true });
    expect(d.situacao?.fontes.find(f => f.chave === segunda.conexaoId)?.versaoDisponivel).toBeNull();
  });
  it('403 não elimina histórico e pausa real aparece sem prometer sucesso', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'REVISAO', ciclo: '2026-10-21', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir(); if (!t) throw new Error('Sem tarefa.');
    await repo.falhar(t, { codigo: 'sem-permissao', http: 403 });
    expect(await ler(m)).toMatchObject({ situacao: { fontes: [{ acesso: { rotulo: 'Acesso recusado pelo iFood' }, tentativa: { mensagem: { rotulo: 'Acesso recusado' } }, versaoDisponivel: { publicadaEm: expect.any(String) } }] } });
    const pausada = await massa(); await publicarFinanceiro(pausada, lider.posse);
    expect(await mudarModulo(pausada.cliente, pausada.moduloId, 'pausar', inventario.autor)).toMatchObject({ ok: true });
    expect(await ler(pausada)).toMatchObject({ situacao: { fontes: [{ acesso: { rotulo: 'Coleta pausada' } }] } });
  });
  it('TEST deriva do parceiro/conexão, e perfil acesso não vira leitura diária', async () => {
    const m = await massaFinanceira(db, inventario, { ambiente: 'TEST' });
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'ACESSO', ciclo: '2026-10-21', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir(); if (!t) throw new Error('Sem tarefa.');
    await repo.salvarPagina(t, { pagina: 1, http: 200, requestId: 'qa-acesso', corpoOriginal: JSON.stringify({ orderStatus: { value: { CONCLUDED: 1 } } }) });
    await repo.verificarAcesso(t);
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', situacao: { cobertura: 'sem-leitura', fontes: [{ tentativa: null, versaoDisponivel: null }], aplicacao: { estado: 'teste' } } });
    await publicarFinanceiro(m, lider.posse);
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', situacao: { cobertura: 'disponivel', aplicacao: { estado: 'teste', aplicadoEm: null } } });
    expect(await lerSituacaoAnalyticsDaLoja(m.cliente, todas, { ...contexto(m), homologacaoDeIntegracao: false }, { lojaId: m.lojaId, dia: DIA })).toMatchObject({ ok: false, motivo: 'ambiente-incompativel' });
  });
  it('relação comercial em outra loja produz só pendência, sem divulgar a loja fora do alcance', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await desligarConexao(m.cliente, m.conexaoId, inventario.autor);
    const outra = await massaFinanceira(db, inventario, { cliente: m.cliente, merchantId: m.merchantId });
    const r = await ler(m); expect(r).toMatchObject({ situacao: { cobertura: 'vinculo-ambiguo' } });
    expect(JSON.stringify(r)).not.toContain(outra.lojaId); expect(JSON.stringify(r)).not.toContain(outra.conexaoId);
  });
  it('origem mínima segue disponível sem integracao.ver ou liberação, mas respeita faturamento.ver/loja', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const gravado = await m.cliente.integracaoFaturamentoDia.findFirstOrThrow();
    await mudarLiberacao(m.cliente, 'integracao', false, inventario.autor);
    expect(await lerOrigemAnalyticsNoFaturamento(m.cliente, al(m.lojaId, ['faturamento.ver']), { lojaId: m.lojaId, dia: DIA })).toEqual({ origem: 'ifood-analytics', aplicadoEm: gravado.aplicadoEm!.toISOString(), atualizacaoPendente: false });
    expect(await lerOrigemAnalyticsNoFaturamento(m.cliente, al(m.lojaId), { lojaId: m.lojaId, dia: DIA })).toBeNull();
    expect((await obterDia(m.cliente, al(m.lojaId, ['faturamento.ver']), m.lojaId, DIA))?.origemAnalytics).toMatchObject({ aplicadoEm: gravado.aplicadoEm!.toISOString() });
  });
  it('recusa aninhamento inadequado e aceita a fotografia externa de obterDia/relatório', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    expect(await m.cliente.transacao(tx => ler(m, tx))).toMatchObject({ ok: false, motivo: 'leitura-indisponivel' });
    expect(await m.cliente.transacao(tx => lerOrigemAnalyticsNoFaturamento(tx, todas, { lojaId: m.lojaId, dia: DIA }))).toBeNull();
    expect(await m.cliente.transacao(tx => ler(m, tx), { repetivel: true, relatorio: {} })).toMatchObject({ ok: true });
    await expect(m.cliente.transacao(async tx => { await ler(m, tx); await tx.loja.update({ where: { id: m.lojaId }, data: { nome: 'não gravar' } }); }, { repetivel: true, relatorio: {} })).rejects.toThrow();
  });
  it('publicação/aplicação concorrentes não misturam snapshot anterior com recibo novo', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const antes = await ler(m); if (!antes.ok) throw new Error('Leitura recusada.');
    const outro = { ...m, cliente: doParceiro(m.cliente.parceiroId, concorrente) };
    let atualizou = false;
    const interrompido: ClienteDoParceiro = { ...m.cliente, transacao: (fn, opcoes) => m.cliente.transacao(tx => fn({ ...tx,
      integracaoSnapshot: { ...tx.integracaoSnapshot, findMany: (async args => {
        const resposta = await tx.integracaoSnapshot.findMany(args);
        if (!atualizou) { atualizou = true; await publicarFinanceiro(outro, lider.posse, [bucketFinanceiro(35.99)], { ciclo: '2026-10-21' }); await aplicar(outro); }
        return resposta;
      }) as typeof tx.integracaoSnapshot.findMany },
    }), opcoes) };
    const durante = await ler(m, interrompido), depois = await ler(m);
    expect(atualizou).toBe(true); if (!durante.ok || !depois.ok) throw new Error('Leitura recusada.');
    expect(durante.situacao?.fontes[0].versaoDisponivel).toEqual(antes.situacao?.fontes[0].versaoDisponivel);
    expect(durante.situacao?.aplicacao).toEqual(antes.situacao?.aplicacao);
    expect(depois.situacao?.fontes[0].versaoDisponivel).not.toEqual(antes.situacao?.fontes[0].versaoDisponivel);
    expect(depois.situacao?.aplicacao.aplicadoEm).not.toBe(antes.situacao?.aplicacao.aplicadoEm);
  });
  it('obterDia mantém os valores e o selo da mesma versão durante revisão concorrente', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const antes = await obterDia(m.cliente, todas, m.lojaId, DIA);
    const outro = { ...m, cliente: doParceiro(m.cliente.parceiroId, concorrente) };
    let atualizou = false;
    const interrompido: ClienteDoParceiro = { ...m.cliente, transacao: (fn, opcoes) => m.cliente.transacao(tx => fn({ ...tx,
      faturamentoLancamento: { ...tx.faturamentoLancamento, findMany: (async args => {
        const resposta = await tx.faturamentoLancamento.findMany(args);
        if (!atualizou) { atualizou = true; await publicarFinanceiro(outro, lider.posse, [bucketFinanceiro(35.99)], { ciclo: '2026-10-21' }); await aplicar(outro); }
        return resposta;
      }) as typeof tx.faturamentoLancamento.findMany },
    }), opcoes) };
    const durante = await obterDia(interrompido, todas, m.lojaId, DIA), depois = await obterDia(m.cliente, todas, m.lojaId, DIA);
    expect(atualizou).toBe(true);
    expect(durante?.canais.find(c => c.canal === 'IFOOD')?.valendo?.valorCentavos).toBe(1999);
    expect(durante?.origemAnalytics).toEqual(antes?.origemAnalytics);
    expect(depois?.canais.find(c => c.canal === 'IFOOD')?.valendo?.valorCentavos).toBe(3599);
    expect(depois?.origemAnalytics?.aplicadoEm).not.toBe(antes?.origemAnalytics?.aplicadoEm);
  });
});
