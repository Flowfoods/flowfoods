/** Indicadores Analytics em PostgreSQL descartável. Todas as respostas são sintéticas; nenhum transporte. */
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
import { modulosLiberados, mudarLiberacao } from '@/lib/erp/liberacao';
import { desligarConexao } from '@/lib/integracoes/core/conexoes';
import { pausarAnalytics } from '@/lib/integracoes/core/controle-analytics';
import { lerConsultoriaDelivery } from '@/lib/integracoes/core/consultoria-delivery';
import { lerPainelAnalytics } from '@/lib/integracoes/core/painel-analytics';
import { deslocarDiaDoPainel } from '@/lib/integracoes/ifood/painel-campos';
import { agendarJanela, criarRepositorioAnalytics } from '@/lib/integracoes/ifood/pipeline-repositorio';
import { criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { assumirPosseFinanceira, bucketFinanceiro, DIA_FINANCEIRO, massaFinanceira, publicarFinanceiro, type MassaFinanceira } from './integracao-faturamento-apoio';

const inventario = { parceiros: [] as string[], apps: [] as string[], autor: `QA Indicadores ${randomUUID()}` };
const DIA = DIA_FINANCEIRO;
const todas = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const al = (lojaId: string, permissoes: Permissao[] = ['integracao.ver', 'faturamento.ver']): Alcance => ({ nivel: 'LOJA', lojas: [lojaId], permissoes: new Set(permissoes) });
const contexto = (m: MassaFinanceira) => ({ parceiroId: m.cliente.parceiroId, homologacaoDeIntegracao: m.ambiente === 'TEST' });
const d = (valor: string) => ({ estado: 'disponivel', valor });

describe.skipIf(!URL_TESTE)('INT-1.8B · indicadores persistidos e fotografia real', { timeout: 120_000 }, () => {
  let db: PrismaClient, concorrente: PrismaClient, perfil: PerfilDoBanco;
  let lider: Awaited<ReturnType<typeof assumirPosseFinanceira>>;
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('Somente banco local descartável.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } });
    concorrente = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } }); perfil = await perfilDoBanco(db);
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
  const ler = (m: MassaFinanceira, c = m.cliente, a = al(m.lojaId), extra = {}) => lerPainelAnalytics(c, a, contexto(m), { lojaId: m.lojaId, inicio: DIA, fim: DIA, ...extra });

  function consultoria(m: MassaFinanceira, origem?: string, acesso = al(m.lojaId, ['consultoria.ver', 'integracao.ver', 'faturamento.ver'])) {
    return lerConsultoriaDelivery(m.cliente, acesso, contexto(m), { lojaId: m.lojaId, fonteId: origem });
  }

  const liberarRecorte = (m: MassaFinanceira) => mudarLiberacao(m.cliente, 'consultoria-de-delivery', true, inventario.autor,
    { conexaoId: m.conexaoId, ambiente: m.ambiente });

  it('Consultoria: liberação e alcance por loja, seleção de uma marca e pausa com histórico', async () => {
    const m = await massa(), outraLoja = await massaFinanceira(db, inventario, { cliente: m.cliente });
    const outraMarca = await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId });
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(10, 2)]);
    await publicarFinanceiro(outraMarca, lider.posse, [bucketFinanceiro(90, 20)]);
    vi.setSystemTime(new Date(`${deslocarDiaDoPainel(DIA, 1)}T13:00:00Z`));
    try {
      expect(await consultoria(m, m.conexaoId)).toMatchObject({ ok: false, motivo: 'bloqueada' });
      expect(await mudarLiberacao(m.cliente, 'consultoria-de-delivery', true, inventario.autor)).toMatchObject({ ok: false });
      expect(await liberarRecorte(m)).toMatchObject({ ok: true, mudou: true });
      expect(await liberarRecorte(m)).toMatchObject({ ok: true, mudou: false });
      expect(await modulosLiberados(m.cliente, al(m.lojaId))).toContain('consultoria-de-delivery');
      expect(await modulosLiberados(m.cliente, al(outraLoja.lojaId))).not.toContain('consultoria-de-delivery');
      expect(await consultoria(m, m.conexaoId, al(m.lojaId))).toMatchObject({ ok: false });
      expect(await consultoria(m, m.conexaoId, al(outraLoja.lojaId, ['consultoria.ver', 'integracao.ver', 'faturamento.ver']))).toMatchObject({ ok: false });
      expect(await consultoria(m, outraMarca.conexaoId, todas)).toMatchObject({ ok: false });
      expect(await lerConsultoriaDelivery(m.cliente, todas, contexto(m), { lojaId: outraLoja.lojaId })).toMatchObject({ ok: false });
      const r = await consultoria(m);
      expect(r).toMatchObject({
        ok: true, dia: DIA, fonte: { chave: m.conexaoId }, visaoGeral: {
          estado: 'disponivel', cobertura: { fontesCobertas: 1, fontesEsperadas: 1 },
          indicadores: { gmvConcluido: d('1500'), pedidos: d('2'), concluidos: d('2') },
        },
      });
      expect(JSON.stringify(r)).not.toContain(m.merchantId);
      expect(JSON.stringify(r)).not.toContain(outraLoja.lojaId);
      expect(JSON.stringify(r)).not.toContain(outraMarca.conexaoId);
      await expect(m.cliente.liberacaoDeModulo.update({
        where: { parceiroId_modulo: { parceiroId: m.cliente.parceiroId, modulo: 'consultoria-de-delivery' } },
        data: { consultoriaLojaId: outraLoja.lojaId },
      })).rejects.toMatchObject({ code: 'P2003' });
      await desligarConexao(m.cliente, m.conexaoId, inventario.autor);
      expect(await consultoria(m, m.conexaoId)).toMatchObject({
        visaoGeral: { estado: 'pausado', publicadaEm: expect.any(String), indicadores: null },
      });
      expect(await liberarRecorte(outraMarca)).toMatchObject({ ok: true, mudou: true });
      expect(await consultoria(m, m.conexaoId)).toMatchObject({ ok: false });
      const hist = await m.cliente.historicoAlteracao.findMany({ where: { entidade: 'LiberacaoDeModulo', acao: 'ALTEROU' } });
      expect(hist).toContainEqual(expect.objectContaining({
        antes: expect.objectContaining({ lojaId: m.lojaId, conexaoId: m.conexaoId }),
        depois: expect.objectContaining({ lojaId: outraMarca.lojaId, conexaoId: outraMarca.conexaoId }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('Consultoria: leitura anterior fica separada e zero confirmado de TEST é Demonstração', async () => {
    const m = await massaFinanceira(db, inventario, { ambiente: 'TEST' });
    expect(await liberarRecorte(m)).toMatchObject({ ok: true });
    const anterior = deslocarDiaDoPainel(DIA, -1);
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(50, 2)], { dia: anterior });
    vi.setSystemTime(new Date(`${deslocarDiaDoPainel(DIA, 1)}T13:00:00Z`));
    try {
      expect(await consultoria(m)).toMatchObject({
        ok: true, dia: DIA, ambiente: 'TEST', visaoGeral: {
          estado: 'atraso', publicadaEm: null, ultimaLeituraAnterior: { dia: anterior }, indicadores: null,
        },
      });
      await publicarFinanceiro(m, lider.posse, []);
      expect(await consultoria(m)).toMatchObject({
        dia: DIA, ambiente: 'TEST', visaoGeral: {
          estado: 'demonstracao', ultimaLeituraAnterior: null,
          indicadores: { pedidos: d('0'), ticketConcluidos: { estado: 'sem-dado' } },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('Consultoria: mostra a publicação confirmada do próprio dia com a revisão pendente', async () => {
    const m = await massa();
    expect(await liberarRecorte(m)).toMatchObject({ ok: true });
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(10, 2)]);
    vi.setSystemTime(new Date(`${deslocarDiaDoPainel(DIA, 1)}T13:00:00Z`));
    try {
      const antes = await consultoria(m);
      expect(antes).toMatchObject({ ok: true, visaoGeral: { estado: 'disponivel', revisaoPendente: false } });
      if (!antes.ok) throw new Error(antes.mensagem);
      await m.cliente.transacao(tx => criarPeriodoFechadoDeTeste(tx, { nome: 'QA revisão', inicio: '2026-10-01', fim: '2026-10-31' }));
      await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(90, 20)], { ciclo: '2026-10-23' });
      expect(await consultoria(m)).toMatchObject({
        ok: true, dia: DIA, visaoGeral: {
          estado: 'parcial', revisaoPendente: true, publicadaEm: antes.visaoGeral.publicadaEm,
          ultimaLeituraAnterior: null, indicadores: { gmvConcluido: d('1500'), pedidos: d('2') },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('domínio exige duas permissões, loja, tenant e liberação antes das métricas', async () => {
    const m = await massa(), outra = await massa(); await publicarFinanceiro(m, lider.posse);
    for (const permissoes of [[], ['integracao.ver'], ['faturamento.ver']] as Permissao[][]) expect(await ler(m, m.cliente, al(m.lojaId, permissoes))).toMatchObject({ motivo: 'sem-permissao' });
    expect(await ler(m, m.cliente, todas, { lojaId: outra.lojaId })).toMatchObject({ motivo: 'filtro-invalido' });
    expect(await lerPainelAnalytics(m.cliente, todas, contexto(outra), { lojaId: m.lojaId, inicio: DIA, fim: DIA })).toMatchObject({ motivo: 'contexto-invalido' });
    expect(await ler(m, m.cliente, todas, { merchants: outra.merchantId })).toMatchObject({ motivo: 'filtro-invalido' });
    await mudarLiberacao(m.cliente, 'integracao', false, inventario.autor);
    expect(await ler(m)).toMatchObject({ motivo: 'nao-liberado' });
  });
  it('oráculo SQL propaga NULL parcial mesmo quando outra categoria tem valor; mantém pedidos/ticket independente', async () => {
    const m = await massa();
    const nulo = bucketFinanceiro(9, 3, { category: 'GROCERY' }); nulo.gmv = { sum: null };
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(10, 2), nulo, bucketFinanceiro(20, 5, { orderStatus: 'CANCELLED' })]);
    const r = await ler(m); expect(r).toMatchObject({ painel: { resumo: { indicadores: {
      gmv: { estado: 'sem-dado', motivo: 'valor-nao-informado' }, gmvSemEntrega: d('3900'), gmvCancelado: d('2500'), pedidos: d('10'), concluidos: d('5'), cancelados: d('5'),
      ticketConcluidos: { estado: 'sem-dado', motivo: 'valor-nao-informado' }, taxaCancelamento: { valor: { numerador: '5', denominador: '10' } },
    } } } });
    expect(JSON.stringify(r)).not.toMatch(/corpoOriginal|sha256|leaseAte|execucaoId|snapshotId|appId/);
  });
  it('vazio oficial cobre zero, falta de dia não; série preserva apenas os dias completos', async () => {
    const m = await massa();
    expect(await ler(m)).toMatchObject({ painel: { resumo: { indicadores: { pedidos: { motivo: 'cobertura-parcial' } } } } });
    await publicarFinanceiro(m, lider.posse, []);
    expect(await ler(m)).toMatchObject({ painel: { cobertura: { completa: true, dias: [{ fontes: [{ estado: 'vazio-oficial' }] }] }, resumo: { indicadores: { pedidos: d('0'), gmv: d('0'), ticketConcluidos: { motivo: 'sem-pedidos' } } } } });
    expect(await ler(m, m.cliente, al(m.lojaId), { fim: '2026-10-20' })).toMatchObject({ painel: { cobertura: { completa: false, diasCompletos: 1 }, serie: [{ completo: true, indicadores: { pedidos: d('0') } }, { completo: false }] } });
  });
  it('todos os merchants são necessários; seleção explícita deduplicada não soma fonte ausente', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    const segunda = await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId });
    expect(await ler(m)).toMatchObject({ painel: { cobertura: { paresEsperados: 2, paresCobertos: 1, completa: false }, resumo: { indicadores: { gmv: { motivo: 'cobertura-parcial' } } } } });
    expect(await ler(m, m.cliente, al(m.lojaId), { merchants: [m.merchantId, m.merchantId] })).toMatchObject({ painel: { cobertura: { paresEsperados: 1, completa: true } } });
    await publicarFinanceiro(segunda, lider.posse, [bucketFinanceiro(5, 2)]);
    expect(await ler(m)).toMatchObject({ painel: { cobertura: { completa: true }, resumo: { indicadores: { pedidos: d('5'), gmv: d('3499') } } } });
  });
  it('SUM numeric sai como texto exato acima de MAX_SAFE, para dinheiro e contagem', async () => {
    const m = await massa(); const massas = [m,
      await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId }),
      await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId })];
    for (const x of massas) await publicarFinanceiro(x, lider.posse, [bucketFinanceiro(35_000_000_000_000, Number.MAX_SAFE_INTEGER)]);
    const r = await ler(m);
    expect(r).toMatchObject({ painel: { resumo: { indicadores: { pedidos: d('27021597764222973'), gmv: d('10500000000001500'), gmvSemEntrega: d('10500000000000000') } } } });
    expect(() => JSON.stringify(r)).not.toThrow();
  });
  it('somente a última geração PUBLICADO entra, no-op não muda data e pendente não substitui', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(35)], { ciclo: '2026-10-21' });
    const antes = await ler(m);
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(35)], { ciclo: '2026-10-22' });
    expect(await ler(m)).toEqual(antes);
    await m.cliente.transacao(tx => criarPeriodoFechadoDeTeste(tx, { nome: 'QA período', inicio: '2026-10-01', fim: '2026-10-31' }));
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(90)], { ciclo: '2026-10-23' });
    expect(await ler(m)).toMatchObject({ painel: { resumo: { indicadores: { gmv: d('4000'), pedidos: d('3') } }, cobertura: { completa: true, dias: [{ fontes: [{ estado: 'publicado', revisaoPendente: true }] }] } } });
  });
  it('403 e desligamento preservam histórico; religação em outra loja marca ambiguidade sem vazar a loja', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'REVISAO', ciclo: '2026-10-21', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir(); if (!t) throw new Error('Sem tarefa.');
    await repo.falhar(t, { codigo: 'sem-permissao', http: 403 });
    expect(await ler(m)).toMatchObject({ painel: { resumo: { indicadores: { gmv: d('2499') } } } });
    await desligarConexao(m.cliente, m.conexaoId, inventario.autor);
    expect(await ler(m)).toMatchObject({ painel: { fontes: [{ ativa: false }], cobertura: { completa: true } } });
    const outra = await massaFinanceira(db, inventario, { cliente: m.cliente, merchantId: m.merchantId });
    const r = await ler(m); expect(r).toMatchObject({ painel: { cobertura: { completa: false, dias: [{ fontes: [{ estado: 'vinculo-ambiguo' }] }] } } });
    expect(JSON.stringify(r)).not.toContain(outra.lojaId); expect(JSON.stringify(r)).not.toContain(outra.conexaoId);
  });
  it('status/canais/logística novos e nulos permanecem separados; taxa não os classifica', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(10, 2), bucketFinanceiro(5, 3, { orderStatus: 'NOVO', salesChannel: 'NOVO_CANAL', deliveredBy: null }), bucketFinanceiro(2, 1, { orderStatus: null, salesChannel: null })]);
    expect(await ler(m)).toMatchObject({ painel: { resumo: { indicadores: { pedidos: d('6'), concluidos: d('2'), taxaCancelamento: { motivo: 'status-nao-classificado' }, ticketConcluidos: { valor: { numerador: '1500', denominador: '2' } } },
      distribuicoes: { canal: { valor: expect.arrayContaining([{ valor: null, pedidos: '1' }, { valor: 'NOVO_CANAL', pedidos: '3' }]) }, pagamento: { motivo: 'contrato-indisponivel' } } } } });
  });
  it('TEST persistido permanece TEST; acesso não publica indicadores nem cria números de amostra', async () => {
    const m = await massaFinanceira(db, inventario, { ambiente: 'TEST' });
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'ACESSO', ciclo: '2026-10-21', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir(); if (!t) throw new Error('Sem tarefa.');
    await repo.salvarPagina(t, { pagina: 1, http: 200, requestId: 'qa-acesso', corpoOriginal: JSON.stringify({ orderStatus: { value: { CONCLUDED: 7 } } }) }); await repo.verificarAcesso(t);
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', painel: { resumo: { indicadores: { pedidos: { motivo: 'cobertura-parcial' } } } } });
    await publicarFinanceiro(m, lider.posse);
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', painel: { ambiente: 'TEST', resumo: { indicadores: { pedidos: d('3') } } } });
    expect(await lerPainelAnalytics(m.cliente, todas, { ...contexto(m), homologacaoDeIntegracao: false }, { lojaId: m.lojaId, inicio: DIA, fim: DIA })).toMatchObject({ motivo: 'contexto-invalido' });
  });
  it('nested inadequado recusa; RR+RO aceita e impede escrita acidental', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    expect(await m.cliente.transacao(tx => ler(m, tx))).toMatchObject({ motivo: 'leitura-indisponivel' });
    expect(await m.cliente.transacao(tx => ler(m, tx), { repetivel: true, relatorio: {} })).toMatchObject({ ok: true });
    await expect(m.cliente.transacao(async tx => { await ler(m, tx); await tx.loja.update({ where: { id: m.lojaId }, data: { nome: 'não escrever' } }); }, { repetivel: true, relatorio: {} })).rejects.toThrow();
  });
  it('publicação em outra conexão entre metadados e soma não mistura as versões', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); const antes = await ler(m);
    const outro = { ...m, cliente: doParceiro(m.cliente.parceiroId, concorrente) }; let mudou = false;
    const interrompido: ClienteDoParceiro = { ...m.cliente, transacao: (fn, opcoes) => m.cliente.transacao(tx => fn({ ...tx,
      sql: async <T>(partes: TemplateStringsArray, ...valores: unknown[]): Promise<T[]> => {
        const r = await tx.sql<T>(partes, ...valores);
        if (!mudou && partes.join('').includes('DISTINCT ON')) { mudou = true; await publicarFinanceiro(outro, lider.posse, [bucketFinanceiro(50)], { ciclo: '2026-10-21' }); }
        return r;
      },
    }), opcoes) };
    const durante = await ler(m, interrompido), depois = await ler(m);
    expect(mudou).toBe(true); expect(durante).toEqual(antes);
    expect(depois).toMatchObject({ painel: { resumo: { indicadores: { gmv: d('5500') } } } });
  });
});
