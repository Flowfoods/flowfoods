/** Marginal e diário na mesma fotografia autorizada. PostgreSQL descartável; sem HTTP. */
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
import { desligarConexao } from '@/lib/integracoes/core/conexoes';
import { pausarAnalytics } from '@/lib/integracoes/core/controle-analytics';
import { lerPainelAnalytics } from '@/lib/integracoes/core/painel-analytics';
import { agendarJanela, criarRepositorioAnalytics } from '@/lib/integracoes/ifood/pipeline-repositorio';
import { criarPeriodoFechadoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { assumirPosseFinanceira, bucketFinanceiro, DIA_FINANCEIRO, massaFinanceira, publicarFinanceiro, type MassaFinanceira } from './integracao-faturamento-apoio';

const inventario = { parceiros: [] as string[], apps: [] as string[], autor: `QA painel pagamentos ${randomUUID()}` };
const DIA = DIA_FINANCEIRO;
const todas = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const al = (lojaId: string, permissoes: Permissao[] = ['integracao.ver', 'faturamento.ver']): Alcance => ({ nivel: 'LOJA', lojas: [lojaId], permissoes: new Set(permissoes) });
const contexto = (m: MassaFinanceira) => ({ parceiroId: m.cliente.parceiroId, homologacaoDeIntegracao: m.ambiente === 'TEST' });
const d = (valor: unknown) => ({ estado: 'disponivel', valor });

/** Intercepta depois da consulta real, sem substituir linhas ou resultados. */
function depoisDoSql(cliente: ClienteDoParceiro, etapa: (texto: string) => Promise<void>): ClienteDoParceiro {
  return { ...cliente, transacao: (fn, opcoes) => cliente.transacao(tx => fn({ ...tx,
    sql: async <T>(partes: TemplateStringsArray, ...valores: unknown[]): Promise<T[]> => {
      const resultado = await tx.sql<T>(partes, ...valores);
      await etapa(partes.join(''));
      return resultado;
    },
  }), opcoes) };
}

describe.skipIf(!URL_TESTE)('INT-1.8C · painel marginal autorizado e independente', { timeout: 120_000 }, () => {
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
    await pausarAnalytics(false, inventario.autor);
    lider = await assumirPosseFinanceira(URL_TESTE!);
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
  async function publicar(m: MassaFinanceira, valor: Record<string, number> | null = { PIX: 7, DINHEIRO: 2 }, o: { ciclo?: string; dia?: string } = {}) {
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: o.dia ?? DIA, ciclo: o.ciclo ?? '2026-10-20', tipo: 'D1', perfil: 'pagamentos', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), tarefa = await repo.adquirir();
    if (!tarefa || tarefa.moduloId !== m.moduloId || tarefa.perfil !== 'pagamentos') throw new Error('A fixture adquiriu outra janela.');
    const corpoOriginal = JSON.stringify({ data: [{ paymentMethod: valor === null ? null : { value: valor } }], currentPage: 1, size: 1, totalItems: 1, totalPages: 1 });
    await repo.salvarPagina(tarefa, { pagina: 1, http: 200, requestId: 'qa-painel-pagamentos', versaoContrato: 1, corpoOriginal });
    const resultado = await repo.publicarPagamentos(tarefa);
    expect(['publicada', 'sem-mudanca', 'pendente-periodo']).toContain(resultado);
    return { tarefa, resultado };
  }

  it('permissões, tenant, loja e liberação são conferidos antes de qualquer SQL marginal', async () => {
    const m = await massa(), outro = await massa(); await publicar(m);
    const sql: string[] = [];
    const observado = depoisDoSql(m.cliente, async texto => { sql.push(texto); });
    for (const p of [[], ['integracao.ver'], ['faturamento.ver']] as Permissao[][]) {
      expect(await ler(m, observado, al(m.lojaId, p))).toMatchObject({ motivo: 'sem-permissao' });
    }
    expect(sql).toEqual([]);
    expect(await lerPainelAnalytics(observado, todas, contexto(outro), { lojaId: m.lojaId, inicio: DIA, fim: DIA })).toMatchObject({ motivo: 'contexto-invalido' });
    expect(sql).toEqual([]);
    expect(await ler(m, observado, al(outro.lojaId))).toMatchObject({ motivo: 'sem-permissao' });
    expect(await ler(m, observado, todas, { lojaId: outro.lojaId })).toMatchObject({ motivo: 'filtro-invalido' });
    expect(await ler(m, observado, todas, { merchants: outro.merchantId })).toMatchObject({ motivo: 'filtro-invalido' });
    await mudarLiberacao(m.cliente, 'integracao', false, inventario.autor);
    expect(await ler(m, observado)).toMatchObject({ motivo: 'nao-liberado' });
    expect(sql.some(s => s.includes('IntegracaoPagamentoSnapshot'))).toBe(false);
  });

  it.each(['diario', 'pagamentos'] as const)('cobertura %s completa não preenche o outro perfil ausente', async perfilCompleto => {
    const m = await massa();
    if (perfilCompleto === 'diario') await publicarFinanceiro(m, lider.posse);
    else await publicar(m);
    const r = await ler(m);
    expect(r).toMatchObject({ painel: {
      cobertura: { completa: perfilCompleto === 'diario' },
      resumo: { indicadores: { pedidos: perfilCompleto === 'diario' ? d('3') : { estado: 'sem-dado', motivo: 'cobertura-parcial' } } },
      pagamentos: { cobertura: { completa: perfilCompleto === 'pagamentos' }, total: perfilCompleto === 'pagamentos' ? d('9') : { estado: 'sem-dado', motivo: 'cobertura-parcial' } },
    } });
  });

  it.each([null, {}])('NULL e mapa vazio têm cobertura completa mas ausência distinta: %j', async valor => {
    const m = await massa(); await publicar(m, { PIX: 80 });
    await publicar(m, valor, { ciclo: '2026-10-21' });
    const consultas: string[] = [];
    const r = await ler(m, depoisDoSql(m.cliente, async texto => { consultas.push(texto); }));
    expect(r).toMatchObject({ painel: { pagamentos: { cobertura: { completa: true },
      total: valor === null ? { estado: 'sem-dado', motivo: 'valor-nao-informado' } : d('0'),
      distribuicao: valor === null ? { estado: 'sem-dado', motivo: 'valor-nao-informado' } : d([]),
    } } });
    expect(consultas.some(s => s.includes('jsonb_array_elements'))).toBe(valor !== null);
  });

  it('soma exata mantém métodos novos, protótipos e zero sem convertê-los em pedidos', async () => {
    const m = await massa(), outro = await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId });
    for (const x of [m, outro]) await publicar(x, { PIX: Number.MAX_SAFE_INTEGER, ['__proto__']: 2, constructor: 0, null: 1 });
    const r = await ler(m);
    expect(r).toMatchObject({ painel: { pagamentos: { cobertura: { completa: true }, total: d('18014398509481988'), distribuicao: d([
      { metodo: 'PIX', ocorrencias: '18014398509481982' }, { metodo: '__proto__', ocorrencias: '4' }, { metodo: 'constructor', ocorrencias: '0' }, { metodo: 'null', ocorrencias: '2' },
    ]) }, resumo: { indicadores: { pedidos: { estado: 'sem-dado' } } } } });
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(JSON.stringify(r)).not.toMatch(/corpoOriginal|sha256|leaseAte|execucaoId|snapshotId|appId/);
  });

  it('última PUBLICADO vence, no-op preserva data e revisão pendente não substitui valor', async () => {
    const m = await massa(); await publicar(m, { PIX: 2 }); await publicar(m, { PIX: 5 }, { ciclo: '2026-10-21' });
    const antes = await ler(m);
    expect(await publicar(m, { PIX: 5 }, { ciclo: '2026-10-22' })).toMatchObject({ resultado: 'sem-mudanca' });
    expect(await ler(m)).toEqual(antes);
    await m.cliente.transacao(tx => criarPeriodoFechadoDeTeste(tx, { nome: 'QA marginal', inicio: '2026-10-01', fim: '2026-10-31' }));
    expect(await publicar(m, { PIX: 99 }, { ciclo: '2026-10-23' })).toMatchObject({ resultado: 'pendente-periodo' });
    const depois = await ler(m);
    expect(depois).toMatchObject({ painel: { pagamentos: { total: d('5'), cobertura: { completa: true, dias: [{ fontes: [{ estado: 'publicado', revisaoPendente: true }] }] } } } });
    if (!antes.ok || !antes.painel || !depois.ok || !depois.painel) throw new Error('Painel ausente.');
    expect(depois.painel.pagamentos.cobertura.dias[0].fontes[0].publicadaEm).toBe(antes.painel.pagamentos.cobertura.dias[0].fontes[0].publicadaEm);
  });

  it('uma fonte ou dia ausente impede total parcial; seleção explícita preserva o recorte completo', async () => {
    const m = await massa(); await publicar(m, { PIX: 2 });
    const outra = await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId });
    const sql: string[] = [];
    expect(await ler(m, depoisDoSql(m.cliente, async texto => { sql.push(texto); }))).toMatchObject({ painel: { pagamentos: {
      cobertura: { completa: false, paresEsperados: 2, paresCobertos: 1 }, total: { motivo: 'cobertura-parcial' },
    } } });
    expect(sql.some(s => s.includes('jsonb_array_elements'))).toBe(false);
    expect(await ler(m, m.cliente, al(m.lojaId), { merchants: [m.merchantId, m.merchantId] })).toMatchObject({ painel: { pagamentos: { cobertura: { completa: true, paresEsperados: 1 }, total: d('2') } } });
    await publicar(outra, { PIX: 3 });
    expect(await ler(m)).toMatchObject({ painel: { pagamentos: { cobertura: { completa: true, paresEsperados: 2 }, total: d('5') } } });
    expect(await ler(m, m.cliente, al(m.lojaId), { fim: '2026-10-20' })).toMatchObject({ painel: { pagamentos: { cobertura: { completa: false, diasCompletos: 1 }, total: { motivo: 'cobertura-parcial' } } } });
  });

  it('403 e desligamento preservam histórico; religação ambígua não soma nem expõe a outra loja', async () => {
    const m = await massa(); await publicar(m);
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: DIA, tipo: 'REVISAO', perfil: 'pagamentos', ciclo: '2026-10-21', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), t = await repo.adquirir();
    if (!t) throw new Error('Sem tarefa.');
    await repo.falhar(t, { codigo: 'sem-permissao', http: 403 });
    expect(await ler(m)).toMatchObject({ painel: { pagamentos: { cobertura: { completa: true }, total: d('9') } } });
    await desligarConexao(m.cliente, m.conexaoId, inventario.autor);
    expect(await ler(m)).toMatchObject({ painel: { fontes: [{ ativa: false }], pagamentos: { total: d('9') } } });
    const outra = await massaFinanceira(db, inventario, { cliente: m.cliente, merchantId: m.merchantId });
    const r = await ler(m);
    expect(r).toMatchObject({ painel: { pagamentos: { cobertura: { completa: false, dias: [{ fontes: [{ estado: 'vinculo-ambiguo' }] }] }, total: { motivo: 'cobertura-parcial' } } } });
    expect(JSON.stringify(r)).not.toContain(outra.lojaId); expect(JSON.stringify(r)).not.toContain(outra.conexaoId);
  });

  it('TEST usa somente a marginal persistida e não inventa distribuição da amostra', async () => {
    const m = await massaFinanceira(db, inventario, { ambiente: 'TEST' });
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', painel: { pagamentos: { total: { estado: 'sem-dado' } } } });
    await publicar(m, { METODO_TEST_SINTETICO: 4 });
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', painel: { ambiente: 'TEST', pagamentos: { total: d('4'), distribuicao: d([{ metodo: 'METODO_TEST_SINTETICO', ocorrencias: '4' }]) } } });
    expect(await lerPainelAnalytics(m.cliente, todas, { ...contexto(m), homologacaoDeIntegracao: false }, { lojaId: m.lojaId, inicio: DIA, fim: DIA })).toMatchObject({ motivo: 'contexto-invalido' });
  });

  it('transação aninhada inadequada recusa antes da marginal; RR+RO permite a leitura', async () => {
    const m = await massa(); await publicar(m);
    let consultouMarginal = false;
    expect(await m.cliente.transacao(tx => ler(m, depoisDoSql(tx, async texto => { consultouMarginal ||= texto.includes('IntegracaoPagamentoSnapshot'); })))).toMatchObject({ motivo: 'leitura-indisponivel' });
    expect(consultouMarginal).toBe(false);
    expect(await m.cliente.transacao(tx => ler(m, tx), { repetivel: true, relatorio: {} })).toMatchObject({ painel: { pagamentos: { total: d('9') } } });
    await expect(m.cliente.transacao(async tx => { await ler(m, tx); await tx.loja.update({ where: { id: m.lojaId }, data: { nome: 'escrita proibida' } }); }, { repetivel: true, relatorio: {} })).rejects.toThrow();
  });

  it.each(['diario', 'pagamentos'] as const)('publicação concorrente após metadados %s não mistura diário e marginal', async fronteira => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(10)]); await publicar(m, { PIX: 2 });
    const antes = await ler(m), outro = { ...m, cliente: doParceiro(m.cliente.parceiroId, concorrente) };
    let mudou = false;
    const interrompido = depoisDoSql(m.cliente, async texto => {
      if (!mudou && texto.includes('DISTINCT ON') && texto.includes(`e.perfil = '${fronteira}'`)) {
        mudou = true;
        await publicarFinanceiro(outro, lider.posse, [bucketFinanceiro(50)], { ciclo: '2026-10-21' });
        await publicar(outro, { PIX: 99 }, { ciclo: '2026-10-21' });
      }
    });
    expect(await ler(m, interrompido)).toEqual(antes);
    expect(mudou).toBe(true);
    expect(await ler(m)).toMatchObject({ painel: { resumo: { indicadores: { gmv: d('5500') } }, pagamentos: { total: d('99') } } });
  });
});
