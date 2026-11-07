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

const inventario = { parceiros: [] as string[], apps: [] as string[], autor: `QA painel complementares ${randomUUID()}` };
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

describe.skipIf(!URL_TESTE)('INT-1.8D · horários e primeiro pedido com cobertura própria', { timeout: 120_000 }, () => {
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
  type Mapa = Record<string, number> | null;
  async function publicar(m: MassaFinanceira, horarios: Mapa = { '14': 15 }, primeiros: Mapa = { true: 4, false: 6 }, o: { ciclo?: string; dia?: string } = {}) {
    await agendarJanela(m.cliente, { moduloId: m.moduloId, dia: o.dia ?? DIA, ciclo: o.ciclo ?? '2026-10-20', tipo: 'D1', perfil: 'complementares', fuso: 'America/Sao_Paulo', unidade: 'REAL' });
    const repo = criarRepositorioAnalytics(m.cliente, lider.posse, () => true), tarefa = await repo.adquirir();
    if (!tarefa || tarefa.moduloId !== m.moduloId || tarefa.perfil !== 'complementares') throw new Error('A fixture adquiriu outra janela.');
    const corpoOriginal = JSON.stringify({ data: [{ orderCreationHour: horarios === null ? null : { value: horarios },
      customerFirstOrderInMerchant: primeiros === null ? null : { value: primeiros } }], currentPage: 1, size: 1, totalItems: 1, totalPages: 1 });
    await repo.salvarPagina(tarefa, { pagina: 1, http: 200, requestId: 'qa-painel-complementares', versaoContrato: 1, corpoOriginal });
    const resultado = await repo.publicarComplementares(tarefa);
    expect(['publicada', 'sem-mudanca', 'pendente-periodo']).toContain(resultado);
    return { tarefa, resultado };
  }
  it('gates de permissão, tenant, loja e liberação precedem toda consulta complementar', async () => {
    const m = await massa(), outro = await massa(); await publicar(m);
    const sql: string[] = [], observado = depoisDoSql(m.cliente, async texto => { sql.push(texto); });
    for (const p of [[], ['integracao.ver'], ['faturamento.ver']] as Permissao[][]) expect(await ler(m, observado, al(m.lojaId, p))).toMatchObject({ motivo: 'sem-permissao' });
    expect(await lerPainelAnalytics(observado, todas, contexto(outro), { lojaId: m.lojaId, inicio: DIA, fim: DIA })).toMatchObject({ motivo: 'contexto-invalido' });
    expect(sql).toEqual([]);
    expect(await ler(m, observado, al(outro.lojaId))).toMatchObject({ motivo: 'sem-permissao' });
    expect(await ler(m, observado, todas, { merchants: outro.merchantId })).toMatchObject({ motivo: 'filtro-invalido' });
    await mudarLiberacao(m.cliente, 'integracao', false, inventario.autor);
    expect(await ler(m, observado)).toMatchObject({ motivo: 'nao-liberado' });
    expect(sql.some(s => s.includes('IntegracaoDistribuicaoSnapshot'))).toBe(false);
  });
  it.each(['diario', 'complementares'] as const)('cobertura %s não supre os outros perfis', async completo => {
    const m = await massa();
    if (completo === 'diario') await publicarFinanceiro(m, lider.posse);
    else await publicar(m);
    expect(await ler(m)).toMatchObject({ painel: {
      cobertura: { completa: completo === 'diario' }, pagamentos: { cobertura: { completa: false } },
      complementares: { cobertura: { completa: completo === 'complementares' },
        horarios: { total: completo === 'complementares' ? d('15') : { motivo: 'cobertura-parcial' } },
        primeirosPedidos: { total: completo === 'complementares' ? d('10') : { motivo: 'cobertura-parcial' } } },
    } });
  });
  it.each(['nulo', 'vazio', 'zero'] as const)('horário %s conserva independência de NULL/vazio/zero do primeiro pedido', async estadoHora => {
    for (const estadoPrimeiro of ['nulo', 'vazio', 'zero'] as const) {
      const m = await massa();
      const hora: Mapa = estadoHora === 'nulo' ? null : estadoHora === 'vazio' ? {} : { '0': 0 };
      const primeiro: Mapa = estadoPrimeiro === 'nulo' ? null : estadoPrimeiro === 'vazio' ? {} : { true: 0 };
      await publicar(m, hora, primeiro);
      const consultas: string[] = [], r = await ler(m, depoisDoSql(m.cliente, async s => { consultas.push(s); }));
      expect(r).toMatchObject({ painel: { complementares: { cobertura: { completa: true },
        horarios: { total: hora === null ? { motivo: 'valor-nao-informado' } : d('0') },
        primeirosPedidos: { total: primeiro === null ? { motivo: 'valor-nao-informado' } : d('0') } } } });
      expect(consultas.some(s => s.includes('jsonb_array_elements(s.horarios)'))).toBe(hora !== null);
      expect(consultas.some(s => s.includes('jsonb_array_elements(s."primeirosPedidos")'))).toBe(primeiro !== null);
    }
  });
  it('duas origens preservam termos desconhecidos e exatidão sem inferir clientes únicos', async () => {
    const m = await massa(), outra = await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId });
    for (const x of [m, outra]) await publicar(x, { '14': Number.MAX_SAFE_INTEGER, ['__proto__']: 2, '01': 0 }, { true: 4, false: 6, null: 1 });
    const r = await ler(m);
    expect(r).toMatchObject({ painel: { complementares: { cobertura: { completa: true },
      horarios: { total: d('18014398509481986'), distribuicao: d([{ termo: '14', ocorrencias: '18014398509481982' }, { termo: '01', ocorrencias: '0' }, { termo: '__proto__', ocorrencias: '4' }]) },
      primeirosPedidos: { total: d('22'), distribuicao: d([{ termo: 'true', ocorrencias: '8' }, { termo: 'false', ocorrencias: '12' }, { termo: 'null', ocorrencias: '2' }]) },
    } } });
    expect(JSON.stringify(r)).not.toMatch(/corpoOriginal|sha256|leaseAte|execucaoId|snapshotId|appId/);
  });
  it('última publicação, no-op e revisão fechada preservam valores e instante aplicado', async () => {
    const m = await massa(); await publicar(m, { '14': 2 }, { true: 1 });
    await publicar(m, { '14': 5 }, { true: 3 }, { ciclo: '2026-10-21' });
    const antes = await ler(m);
    expect(await publicar(m, { '14': 5 }, { true: 3 }, { ciclo: '2026-10-22' })).toMatchObject({ resultado: 'sem-mudanca' });
    expect(await ler(m)).toEqual(antes);
    await m.cliente.transacao(tx => criarPeriodoFechadoDeTeste(tx, { nome: 'QA complementar', inicio: '2026-10-01', fim: '2026-10-31' }));
    expect(await publicar(m, { '14': 99 }, { true: 88 }, { ciclo: '2026-10-23' })).toMatchObject({ resultado: 'pendente-periodo' });
    const depois = await ler(m);
    expect(depois).toMatchObject({ painel: { complementares: { horarios: { total: d('5') }, primeirosPedidos: { total: d('3') },
      cobertura: { completa: true, dias: [{ fontes: [{ revisaoPendente: true }] }] } } } });
    if (!antes.ok || !antes.painel || !depois.ok || !depois.painel) throw new Error('Painel ausente.');
    expect(depois.painel.complementares.cobertura.dias[0].fontes[0].publicadaEm).toBe(antes.painel.complementares.cobertura.dias[0].fontes[0].publicadaEm);
  });
  it('fonte/dia ausente impede soma parcial; seleção explícita mantém recorte completo', async () => {
    const m = await massa(); await publicar(m);
    await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId });
    const sql: string[] = [];
    expect(await ler(m, depoisDoSql(m.cliente, async s => { sql.push(s); }))).toMatchObject({ painel: { complementares: {
      cobertura: { completa: false, paresEsperados: 2, paresCobertos: 1 }, horarios: { total: { motivo: 'cobertura-parcial' } }, primeirosPedidos: { total: { motivo: 'cobertura-parcial' } } } } });
    expect(sql.some(s => s.includes('jsonb_array_elements'))).toBe(false);
    expect(await ler(m, m.cliente, al(m.lojaId), { merchants: [m.merchantId, m.merchantId] })).toMatchObject({ painel: { complementares: { cobertura: { completa: true, paresEsperados: 1 }, horarios: { total: d('15') } } } });
    expect(await ler(m, m.cliente, al(m.lojaId), { merchants: m.merchantId, fim: '2026-10-20' })).toMatchObject({ painel: { complementares: { cobertura: { completa: false, diasCompletos: 1 } } } });
  });
  it('desligamento preserva histórico e religação ambígua recusa soma entre lojas', async () => {
    const m = await massa(); await publicar(m); await desligarConexao(m.cliente, m.conexaoId, inventario.autor);
    expect(await ler(m)).toMatchObject({ painel: { fontes: [{ ativa: false }], complementares: { horarios: { total: d('15') } } } });
    const outra = await massaFinanceira(db, inventario, { cliente: m.cliente, merchantId: m.merchantId });
    const r = await ler(m);
    expect(r).toMatchObject({ painel: { complementares: { cobertura: { completa: false, dias: [{ fontes: [{ estado: 'vinculo-ambiguo' }] }] }, horarios: { total: { motivo: 'cobertura-parcial' } } } } });
    expect(JSON.stringify(r)).not.toContain(outra.lojaId);
  });
  it('TEST usa dados persistidos sintéticos, sem completar a fixture oficial', async () => {
    const m = await massaFinanceira(db, inventario, { ambiente: 'TEST' });
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', painel: { complementares: { horarios: { total: { estado: 'sem-dado' } } } } });
    await publicar(m, { HORA_NOVA_TEST: 4 }, null);
    expect(await ler(m)).toMatchObject({ ambiente: 'TEST', painel: { complementares: { horarios: { total: d('4') }, primeirosPedidos: { total: { motivo: 'valor-nao-informado' } } } } });
  });
  it('exige fotografia repetível somente leitura e não permite escrita no relatório', async () => {
    const m = await massa(); await publicar(m); let consultou = false;
    expect(await m.cliente.transacao(tx => ler(m, depoisDoSql(tx, async s => { consultou ||= s.includes('IntegracaoDistribuicaoSnapshot'); })))).toMatchObject({ motivo: 'leitura-indisponivel' });
    expect(consultou).toBe(false);
    expect(await m.cliente.transacao(tx => ler(m, tx), { repetivel: true, relatorio: {} })).toMatchObject({ painel: { complementares: { horarios: { total: d('15') } } } });
    await expect(m.cliente.transacao(async tx => { await ler(m, tx); await tx.loja.update({ where: { id: m.lojaId }, data: { nome: 'proibido' } }); }, { repetivel: true, relatorio: {} })).rejects.toThrow();
  });
  it.each(['diario', 'complementares'] as const)('publicação concorrente na fronteira %s mantém os campos na mesma fotografia', async fronteira => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(10)]); await publicar(m);
    const antes = await ler(m), outro = { ...m, cliente: doParceiro(m.cliente.parceiroId, concorrente) }; let mudou = false;
    const observado = depoisDoSql(m.cliente, async s => {
      if (!mudou && s.includes('DISTINCT ON') && s.includes("e.perfil = '" + fronteira + "'")) {
        mudou = true; await publicarFinanceiro(outro, lider.posse, [bucketFinanceiro(50)], { ciclo: '2026-10-21' });
        await publicar(outro, { '14': 99 }, { true: 88 }, { ciclo: '2026-10-21' });
      }
    });
    expect(await ler(m, observado)).toEqual(antes); expect(mudou).toBe(true);
    expect(await ler(m)).toMatchObject({ painel: { resumo: { indicadores: { gmv: d('5500') } }, complementares: { horarios: { total: d('99') }, primeirosPedidos: { total: d('88') } } } });
  });
});
