/** INT-1.7B: pipeline persistido → recibo → ledger. Somente fixtures e PostgreSQL descartável; sem HTTP. */
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
import { aplicarFaturamentoAnalytics } from '@/lib/erp/faturamento-integracao';
import { processarUmFaturamentoPendente, sinalizarFaturamentoAnalytics } from '@/lib/integracoes/ifood/faturamento-pendencias';
import { pausarAnalytics } from '@/lib/integracoes/core/controle-analytics';
import { desligarConexao, mudarModulo } from '@/lib/integracoes/core/conexoes';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import { lancarDia, obterDia, removerLancamento } from '@/lib/erp/faturamento';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { criarPeriodoFechadoDeTeste, reabrirPeriodoDeTeste, limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';
import { assumirPosseFinanceira, bucketFinanceiro, DIA_FINANCEIRO, massaFinanceira, publicarFinanceiro, type MassaFinanceira } from './integracao-faturamento-apoio';

const inventario = { parceiros: [] as string[], apps: [] as string[], autor: `QA Financeiro ${randomUUID()}` };
const al = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const data = new Date(`${DIA_FINANCEIRO}T00:00:00Z`);
describe.skipIf(!URL_TESTE)('INT-1.7B · aplicação financeira atômica e replay', { timeout: 120_000 }, () => {
  let db: PrismaClient, perfil: PerfilDoBanco;
  let lider: Awaited<ReturnType<typeof assumirPosseFinanceira>>;
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('DB precisa ser local e descartável.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE! } } }); perfil = await perfilDoBanco(db);
  });
  beforeEach(async () => {
    await prisma.integracaoControle.update({ where: { id: 'IFOOD_ANALYTICS' }, data: { bloqueadaAte: null, proximaChamadaEm: null } });
    await pausarAnalytics(false, inventario.autor); lider = await assumirPosseFinanceira(URL_TESTE!);
  });
  afterEach(async () => { if (lider) { lider.liberar(); await lider.encerrada; } });
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
    } finally { await Promise.all([db.$disconnect(), prisma.$disconnect()]); }
  }, 360_000);
  const massa = () => massaFinanceira(db, inventario);
  const aplicar = (m: MassaFinanceira, c = m.cliente) => aplicarFaturamentoAnalytics(c, lider.posse, { lojaId: m.lojaId, dia: DIA_FINANCEIRO }, () => true);
  const linhas = (m: MassaFinanceira) => m.cliente.faturamentoLancamento.findMany({ orderBy: { chaveIdempotencia: 'asc' } });
  const eventos = (m: MassaFinanceira) => m.cliente.historicoAlteracao.findMany({ where: { entidade: 'FaturamentoLancamento' }, orderBy: { id: 'asc' } });
  const recibo = (m: MassaFinanceira) => m.cliente.integracaoFaturamentoDia.findFirstOrThrow({ where: { lojaId: m.lojaId, dia: data } });

  it('publicação só sinaliza; consumer grava valor em centavos, pedidos e clientes ausentes com origem relacional', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    expect(await linhas(m)).toEqual([]);
    expect(await recibo(m)).toMatchObject({ estado: 'PENDENTE', revisaoSolicitada: 1n, revisaoConferida: 0n });
    expect(await aplicar(m)).toMatchObject({ estado: 'aplicado', fontes: 1 });
    const [l] = await linhas(m), [f] = await m.cliente.integracaoFaturamentoFonte.findMany();
    expect(l).toMatchObject({ origem: 'INTEGRACAO', canal: 'IFOOD', valorCentavos: 1999, pedidos: 3, clientes: null, chaveIdempotencia: `ifood-analytics:dia:${m.merchantId}:${DIA_FINANCEIRO}`, origemRef: `ifood-analytics:${f.snapshotId}` });
    expect(f).toMatchObject({ conexaoId: m.conexaoId, moduloId: m.moduloId, merchantId: m.merchantId, lancamentoId: l.id });
    expect(await eventos(m)).toHaveLength(1);
    expect(await recibo(m)).toMatchObject({ estado: 'APLICADO', versaoMapaAplicada: 1, revisaoConferida: 1n });
  });
  it('replay e sem-mudança confirmam o destino sem duplicar linha/histórico/aplicadoEm', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const [antes, h, r] = await Promise.all([linhas(m), eventos(m), recibo(m)]);
    expect(await aplicar(m)).toMatchObject({ estado: 'igual' });
    expect((await publicarFinanceiro(m, lider.posse, undefined, { ciclo: '2026-10-21' })).resultado).toBe('sem-mudanca');
    expect(await processarUmFaturamentoPendente(m.cliente, lider.posse, () => true)).toMatchObject({ estado: 'igual' });
    expect(await linhas(m)).toEqual(antes); expect(await eventos(m)).toEqual(h);
    expect(await recibo(m)).toMatchObject({ aplicadoEm: r.aplicadoEm, hashAplicado: r.hashAplicado, revisaoSolicitada: 2n, revisaoConferida: 2n });
  });
  it('snapshot novo substitui a própria fonte, preservando id e revisões anteriores', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m); const [a] = await linhas(m);
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(40, 4)], { ciclo: '2026-10-21' });
    expect(await aplicar(m)).toMatchObject({ estado: 'aplicado' });
    expect(await linhas(m)).toMatchObject([{ id: a.id, valorCentavos: 4000, pedidos: 4, clientes: null }]);
    expect(await m.cliente.integracaoSnapshot.count()).toBe(2); expect(await eventos(m)).toHaveLength(2);
  });
  it('novo snapshot de mesmos números financeiros atualiza a proveniência, sem multiplicar venda', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const [antes] = await linhas(m), fonte = await m.cliente.integracaoFaturamentoFonte.findFirstOrThrow();
    await publicarFinanceiro(m, lider.posse, [{ ...bucketFinanceiro(), paymentTotalValue: { sum: 99 } }], { ciclo: '2026-10-21' });
    expect(await aplicar(m)).toMatchObject({ estado: 'aplicado' });
    const [depois] = await linhas(m), nova = await m.cliente.integracaoFaturamentoFonte.findFirstOrThrow();
    expect(depois).toMatchObject({ id: antes.id, valorCentavos: antes.valorCentavos, pedidos: antes.pedidos, clientes: null });
    expect(nova.id).toBe(fonte.id); expect(nova.snapshotId).not.toBe(fonte.snapshotId); expect(depois.origemRef).toBe(`ifood-analytics:${nova.snapshotId}`);
    expect(await eventos(m)).toHaveLength(2);
  });
  it('resposta perdida depois do COMMIT não gera falso sucesso; retentativa reconhece o mesmo conjunto', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    const wrapper = new Proxy({ ...m.cliente }, { get(alvo, prop) {
      if (prop === 'transacao') return async (executar: Parameters<ClienteDoParceiro['transacao']>[0], opcoes: Parameters<ClienteDoParceiro['transacao']>[1]) => {
        await alvo.transacao(executar, opcoes); throw new Error('Resposta do COMMIT perdida na fixture');
      };
      return Reflect.get(alvo, prop);
    } });
    await expect(aplicar(m, wrapper)).rejects.toThrow('Resposta do COMMIT perdida');
    const [ls, hs, rs] = await Promise.all([linhas(m), eventos(m), recibo(m)]);
    expect(ls).toHaveLength(1); expect(hs).toHaveLength(1);
    expect(await aplicar(m)).toMatchObject({ estado: 'igual' });
    expect(await linhas(m)).toEqual(ls); expect(await eventos(m)).toEqual(hs); expect((await recibo(m)).aplicadoEm).toEqual(rs.aplicadoEm);
  });
  it('dois merchants exigem cobertura completa e somam uma vez com fallback humano único', async () => {
    const a = await massa(), b = await massaFinanceira(db, inventario, { cliente: a.cliente, lojaId: a.lojaId });
    expect(await lancarDia(a.cliente, al, { lojaId: a.lojaId, data: DIA_FINANCEIRO, canais: [{ canal: 'IFOOD', valor: '100,00', pedidos: '10', clientes: '19', naoVendeu: false, versao: '' }] }, inventario.autor, DIA_FINANCEIRO)).toMatchObject({ ok: true });
    const humana = (await linhas(a))[0]; await publicarFinanceiro(a, lider.posse);
    expect(await aplicar(a)).toMatchObject({ estado: 'pendente', motivo: 'COBERTURA_INCOMPLETA' });
    expect(await linhas(a)).toEqual([humana]);
    await publicarFinanceiro(b, lider.posse, [bucketFinanceiro(30, 2)]);
    expect(await aplicar(a)).toMatchObject({ estado: 'aplicado', fontes: 2 });
    const d = await obterDia(a.cliente, al, a.lojaId, DIA_FINANCEIRO);
    expect(d?.canais.find(c => c.canal === 'IFOOD')?.valendo).toMatchObject({ valorCentavos: 4999, pedidos: 5, clientes: 19, fonteClientes: 'HUMANO' });
    expect(await a.cliente.faturamentoLancamento.findFirst({ where: { id: humana.id } })).toEqual(humana);
    expect(await removerLancamento(a.cliente, al, { lojaId: a.lojaId, canal: 'IFOOD', data: DIA_FINANCEIRO, motivo: 'Teste de ausência', versao: humana.atualizadoEm.toISOString() }, inventario.autor)).toMatchObject({ ok: true });
    const d2 = await obterDia(a.cliente, al, a.lojaId, DIA_FINANCEIRO);
    expect(d2?.canais.find(c => c.canal === 'IFOOD')?.valendo).toMatchObject({ valorCentavos: 4999, pedidos: 5, clientes: null, fonteClientes: 'SEM_DADO' });
  });
  it('vazio oficial substitui venda anterior por zero explícito sem inventar clientes', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    await publicarFinanceiro(m, lider.posse, [], { ciclo: '2026-10-21' }); await aplicar(m);
    expect(await linhas(m)).toMatchObject([{ valorCentavos: 0, pedidos: 0, clientes: null }]);
  });
  it('merchant novo sem snapshot preserva todo conjunto aplicado até completar a cobertura', async () => {
    const a = await massa(); await publicarFinanceiro(a, lider.posse); await aplicar(a);
    const [ls, fs, hs] = await Promise.all([linhas(a), a.cliente.integracaoFaturamentoFonte.findMany(), eventos(a)]);
    const b = await massaFinanceira(db, inventario, { cliente: a.cliente, lojaId: a.lojaId });
    expect(await aplicar(a)).toMatchObject({ estado: 'pendente', motivo: 'COBERTURA_INCOMPLETA' });
    expect(await linhas(a)).toEqual(ls); expect(await a.cliente.integracaoFaturamentoFonte.findMany()).toEqual(fs); expect(await eventos(a)).toEqual(hs);
    await publicarFinanceiro(b, lider.posse, [bucketFinanceiro(10, 1)]);
    expect(await aplicar(a)).toMatchObject({ estado: 'aplicado', fontes: 2 });
    expect((await linhas(a)).reduce((s, l) => s + l.valorCentavos, 0)).toBe(2999);
    expect(await a.cliente.faturamentoLancamento.findFirst({ where: { id: ls[0].id } })).toEqual(ls[0]);
  });
  it('enum desconhecido ou valor ausente preserva último dinheiro e suas fontes', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m);
    const [ls, fs, hs] = await Promise.all([linhas(m), m.cliente.integracaoFaturamentoFonte.findMany(), eventos(m)]);
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(50, 4, { category: 'GROCERY' })], { ciclo: '2026-10-21' });
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: 'RECORTE_NAO_MAPEADO' });
    expect(await linhas(m)).toEqual(ls); expect(await m.cliente.integracaoFaturamentoFonte.findMany()).toEqual(fs); expect(await eventos(m)).toEqual(hs);
    const semValor = { ...bucketFinanceiro(), gmvWithoutDelivery: { sum: null } };
    await publicarFinanceiro(m, lider.posse, [semValor], { ciclo: '2026-10-22' });
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: 'VALOR_AUSENTE' }); expect(await linhas(m)).toEqual(ls);
  });
  it('limite do grão considera soma dos merchants antes de qualquer escrita', async () => {
    const a = await massa(), b = await massaFinanceira(db, inventario, { cliente: a.cliente, lojaId: a.lojaId });
    await publicarFinanceiro(a, lider.posse, [bucketFinanceiro(600000, 3)]); await publicarFinanceiro(b, lider.posse, [bucketFinanceiro(600000, 4)]);
    expect(await aplicar(a)).toMatchObject({ estado: 'pendente', motivo: 'LIMITE_FATURAMENTO' });
    expect(await linhas(a)).toEqual([]); expect(await a.cliente.integracaoFaturamentoFonte.count()).toBe(0);
  });
  it.each(['loja', 'canal', 'liberacao', 'modulo'] as const)('retirada de acesso %s registra pendência sem alterar anterior', async modo => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m); const antes = await linhas(m);
    if (modo === 'loja') await m.cliente.loja.update({ where: { id: m.lojaId }, data: { ativa: false } });
    if (modo === 'canal') await m.cliente.loja.update({ where: { id: m.lojaId }, data: { canaisDeVenda: ['LOJA'] } });
    if (modo === 'liberacao') expect(await mudarLiberacao(m.cliente, 'integracao', false, inventario.autor)).toMatchObject({ ok: true });
    if (modo === 'modulo') expect(await mudarModulo(m.cliente, m.moduloId, 'erro-permissao', inventario.autor, { erro: '403 sintético' })).toMatchObject({ ok: true });
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: 'ACESSO' }); expect(await linhas(m)).toEqual(antes);
    expect(await recibo(m)).toMatchObject({ estado: 'PENDENTE_ACESSO', motivo: 'ACESSO' });
  });
  it('período fechado preserva ledger; reabrir permite replay local sem nova coleta', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    const p = await m.cliente.transacao(tx => criarPeriodoFechadoDeTeste(tx, { nome: 'Período sintético', inicio: '2026-10-01', fim: '2026-10-31' }));
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: 'PERIODO_FECHADO' }); expect(await linhas(m)).toEqual([]);
    // Reabertura da fixture sem novo transporte; a corrida do fechamento é coberta na suíte independente.
    await reabrirPeriodoDeTeste(m.cliente, p.id);
    expect(await processarUmFaturamentoPendente(m.cliente, lider.posse, () => true)).toMatchObject({ estado: 'aplicado' });
    expect(await m.cliente.integracaoPayload.count()).toBe(1);
  });
  it('religar o mesmo merchant não duplica nem troca a identidade aplicada', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m); const antes = await linhas(m);
    expect(await desligarConexao(m.cliente, m.conexaoId, inventario.autor)).toMatchObject({ ok: true });
    await massaFinanceira(db, inventario, { cliente: m.cliente, lojaId: m.lojaId, merchantId: m.merchantId });
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: 'VINCULO_AMBIGUO' }); expect(await linhas(m)).toEqual(antes);
  });
  it('marca alterada após aplicação fica pendente e preserva a atribuição anterior', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); await aplicar(m); const antes = await linhas(m);
    const marca = await m.cliente.marca.create({ data: { parceiroId: m.cliente.parceiroId, nome: 'Outra marca sintética' } });
    await m.cliente.integracaoConexao.update({ where: { id: m.conexaoId }, data: { marcaId: marca.id } });
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: 'MARCA_DIVERGENTE' }); expect(await linhas(m)).toEqual(antes);
    expect(await m.cliente.integracaoFaturamentoFonte.findFirst()).toMatchObject({ marcaAplicadaId: null });
  });
  it('outra integração no grão impede sobreposição financeira', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    const l = await m.cliente.faturamentoLancamento.create({ data: { parceiroId: m.cliente.parceiroId, lojaId: m.lojaId, canal: 'IFOOD', data, valorCentavos: 1, pedidos: 1, clientes: null, origem: 'INTEGRACAO', chaveIdempotencia: 'outra:fixture', origemRef: 'outro-sistema' } });
    expect(await aplicar(m)).toMatchObject({ estado: 'pendente', motivo: 'OUTRA_INTEGRACAO' }); expect(await linhas(m)).toEqual([l]);
  });
  it('falha SQL após gravar ledger e fonte faz rollback de dinheiro, refs, recibo e histórico', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); const antes = await recibo(m); let viuEscrita = false;
    const wrapper = new Proxy({ ...m.cliente }, { get(alvo, prop) {
      if (prop === 'transacao') return (executar: Parameters<ClienteDoParceiro['transacao']>[0], opcoes: Parameters<ClienteDoParceiro['transacao']>[1]) => alvo.transacao(async tx => {
        const r = await executar(tx); viuEscrita = await tx.faturamentoLancamento.count() === 1 && await tx.integracaoFaturamentoFonte.count() === 1;
        await tx.sql`SELECT 1/0 AS falha_real_depois_da_escrita`; return r;
      }, opcoes);
      return Reflect.get(alvo, prop);
    } });
    await expect(aplicar(m, wrapper)).rejects.toThrow(); expect(viuEscrita).toBe(true);
    expect(await linhas(m)).toEqual([]); expect(await eventos(m)).toEqual([]); expect(await m.cliente.integracaoFaturamentoFonte.count()).toBe(0); expect(await recibo(m)).toEqual(antes);
  });
  it('TEST e cliente de outro tenant nunca produzem dinheiro', async () => {
    const m = await massaFinanceira(db, inventario, { ambiente: 'TEST' }); await publicarFinanceiro(m, lider.posse);
    expect(await m.cliente.integracaoFaturamentoDia.count()).toBe(0);
    expect(await processarUmFaturamentoPendente(m.cliente, lider.posse, () => true)).toBeNull(); expect(await linhas(m)).toEqual([]);
    const a = await massa(), b = await massa(); await publicarFinanceiro(a, lider.posse);
    await expect(aplicar(a, b.cliente)).rejects.toThrow(); expect(await linhas(a)).toEqual([]); expect(await linhas(b)).toEqual([]);
  });
  it('chave desligada ou posse perdida não prepara nem altera recibos', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse); const antes = await recibo(m);
    await expect(aplicarFaturamentoAnalytics(m.cliente, lider.posse, { lojaId: m.lojaId, dia: DIA_FINANCEIRO }, () => false)).rejects.toMatchObject({ codigo: 'ACESSO' });
    await expect(aplicarFaturamentoAnalytics(m.cliente, { ...lider.posse, confirmar: async () => false }, { lojaId: m.lojaId, dia: DIA_FINANCEIRO }, () => true)).rejects.toMatchObject({ codigo: 'POSSE' });
    expect(await recibo(m)).toEqual(antes); expect(await linhas(m)).toEqual([]);
  });
  it('um dia pendente não monopoliza o replay; sem sinal novo não reescreve aplicado', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(1, 1, { category: 'NOVO' })]);
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(2, 1)], { dia: '2026-10-20', ciclo: '2026-10-21' });
    const resultados = [await processarUmFaturamentoPendente(m.cliente, lider.posse, () => true), await processarUmFaturamentoPendente(m.cliente, lider.posse, () => true)];
    expect(resultados.map(r => r?.estado).sort()).toEqual(['aplicado', 'pendente']);
    expect(await linhas(m)).toMatchObject([{ valorCentavos: 200 }]);
    const r = await m.cliente.integracaoFaturamentoDia.findFirstOrThrow({ where: { estado: 'APLICADO' } });
    await processarUmFaturamentoPendente(m.cliente, lider.posse, () => true);
    expect(await m.cliente.integracaoFaturamentoDia.findFirst({ where: { id: r.id } })).toEqual(r);
  });
  it('bootstrap de snapshots pré-ponte recupera no máximo um grão por rodada', async () => {
    const m = await massa(); await publicarFinanceiro(m, lider.posse);
    await publicarFinanceiro(m, lider.posse, [bucketFinanceiro(2, 1)], { dia: '2026-10-20', ciclo: '2026-10-21' });
    // Simula apenas o estado histórico anterior à migração56: snapshots existentes sem cabeçalho.
    // O dono físico da fixture suspende triggers exclusivamente nesta TX e só neste tenant.
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoFaturamentoDia" NO FORCE ROW LEVEL SECURITY');
      await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoFaturamentoDia" DISABLE TRIGGER USER');
      await tx.$executeRawUnsafe('DELETE FROM "IntegracaoFaturamentoDia" WHERE "parceiroId"=$1', m.cliente.parceiroId);
      await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoFaturamentoDia" ENABLE TRIGGER USER');
      if (perfil.rls) await tx.$executeRawUnsafe('ALTER TABLE "IntegracaoFaturamentoDia" FORCE ROW LEVEL SECURITY');
    });
    expect(await m.cliente.integracaoFaturamentoDia.count()).toBe(0);
    expect(await processarUmFaturamentoPendente(m.cliente, lider.posse, () => true)).toMatchObject({ estado: 'aplicado' });
    expect(await m.cliente.integracaoFaturamentoDia.count()).toBe(1); expect(await linhas(m)).toHaveLength(1);
    expect(await processarUmFaturamentoPendente(m.cliente, lider.posse, () => true)).toMatchObject({ estado: 'aplicado' });
    expect(await m.cliente.integracaoFaturamentoDia.count()).toBe(2); expect(await linhas(m)).toHaveLength(2); expect(await m.cliente.integracaoPayload.count()).toBe(2);
  });
  it('sinalização de TEST não incrementa recibo de produção com o mesmo dia', async () => {
    const m = await massaFinanceira(db, inventario, { ambiente: 'TEST' }); await publicarFinanceiro(m, lider.posse);
    const s = await m.cliente.integracaoSnapshot.findFirstOrThrow();
    await m.cliente.transacao(tx => sinalizarFaturamentoAnalytics(tx, s.id, lider.posse.id));
    expect(await m.cliente.integracaoFaturamentoDia.count()).toBe(0);
    expect(await doParceiro(m.cliente.parceiroId, db).faturamentoLancamento.count()).toBe(0);
  });
});
