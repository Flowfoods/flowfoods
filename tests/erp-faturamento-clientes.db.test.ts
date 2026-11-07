/** INT-1.7A: fixtures de integração sem writer externo; ausência real e leitura financeira independente. */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import { chaveDeIntegracao, type CanalVenda } from '@/lib/erp/faturamento-campos';
import { CABECALHO_DO_MODELO } from '@/lib/erp/faturamento-planilha';
import {
  faturamentoDoGrao, faturamentoDosGraos, importarPlanilha, lancarDia,
  obterDia, obterMes, previaDaImportacao, type EntradaDoCanal,
} from '@/lib/erp/faturamento';
import { dreDoPeriodo } from '@/lib/erp/dre';
import { complementosDoFaturamento } from '@/lib/erp/home-faturamento-complementos';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const HOJE = '2026-10-31';
const D = '2026-10-10';
const D2 = '2026-10-11';
const data = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const alcance = (lojas: 'rede' | string[], permissoesRemovidas: string[] = []): Alcance => resolverAlcance({
  perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas,
  redeInteira: lojas === 'rede', lojaIds: lojas === 'rede' ? [] : lojas,
});
const dono = () => alcance('rede');

describe.skipIf(!URL_TESTE)('INT-1.7A · atendimentos ausentes no banco e no recorte', { timeout: 180_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  let a: ClienteDoParceiro, b: ClienteDoParceiro;
  let lojaA: string, lojaA2: string, lojaB: string;
  const parceiros: string[] = [];

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(URL_TESTE!).hostname)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
  });
  beforeEach(async () => {
    const prefixo = `clientes-${randomUUID().slice(0, 12)}`;
    const A = await db.parceiroFlow.create({ data: { nome: 'Fixture Clientes A', slug: `${prefixo}-a`, status: 'ATIVO' } });
    parceiros.push(A.id);
    const B = await db.parceiroFlow.create({ data: { nome: 'Fixture Clientes B', slug: `${prefixo}-b`, status: 'ATIVO' } });
    parceiros.push(B.id);
    a = doParceiro(A.id, db); b = doParceiro(B.id, db);
    const criar = async (cliente: ClienteDoParceiro, nome: string) => {
      const r = await cadastrarLoja(cliente, { nome }, 'Fixture');
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.id;
    };
    lojaA = await criar(a, 'Fixture Centro');
    lojaA2 = await criar(a, 'Fixture Segunda');
    lojaB = await criar(b, 'Fixture Outro parceiro');
  });
  afterEach(async () => {
    if (db && parceiros.length) await limparParceiros(db, perfil, parceiros.splice(0));
  }, 360_000);
  afterAll(async () => { await db?.$disconnect(); });

  /** Somente fixture: nenhuma ponte de publicação ou API foi implementada por este teste. */
  const integrada = (cliente: ClienteDoParceiro, lojaId: string, dia: string, clientes: number | null,
    valorCentavos = 12_000, pedidos = 3, canal: CanalVenda = 'IFOOD') => {
    const ref = randomUUID();
    return cliente.faturamentoLancamento.create({ data: {
      parceiroId: cliente.parceiroId, lojaId, canal, data: data(dia), valorCentavos, pedidos, clientes,
      origem: 'INTEGRACAO', origemRef: `fixture:${ref}`, chaveIdempotencia: chaveDeIntegracao('fixture', 'pedido', ref)!,
    } });
  };
  const humana = (lojaId: string, dia: string, valor: string, pedidos: string, clientes: string,
    canal: CanalVenda = 'IFOOD', extra: Partial<EntradaDoCanal> = {}) => lancarDia(a, dono(), {
    lojaId, data: dia, canais: [{ canal, valor, pedidos, clientes, naoVendeu: false, versao: '', ...extra }],
  }, 'Pessoa sintética', HOJE);
  const mes = (lojaId?: string, al = dono()) => obterMes(a, al, { mes: '2026-10', lojaId }, HOJE);

  it('NULL parcial do SUM não vira a soma conhecida, zero ou pedidos; dia e grão concordam', async () => {
    await integrada(a, lojaA, D, 3);
    const ausente = await integrada(a, lojaA, D, null, 8_000, 2);
    expect((await a.faturamentoLancamento.findUnique({ where: { id: ausente.id } }))?.clientes).toBeNull();
    const g = await faturamentoDoGrao(a, dono(), lojaA, 'IFOOD', D);
    expect(g).toEqual({ lojaId: lojaA, canal: 'IFOOD', data: D, valorCentavos: 20_000, pedidos: 5,
      clientes: null, fonte: 'INTEGRACAO', fonteClientes: 'SEM_DADO', conferencia: null });
    const tela = (await obterDia(a, dono(), lojaA, D))!.canais.find(c => c.canal === 'IFOOD')!;
    expect(tela.humano).toBeNull();
    expect(tela.valendo).toEqual({ valorCentavos: 20_000, pedidos: 5, clientes: null,
      fonte: 'INTEGRACAO', fonteClientes: 'SEM_DADO', conferencia: null });
    expect((await mes(lojaA)).total).toEqual({ valorCentavos: 20_000, pedidos: 5, clientes: null, ticketMedioCentavos: 4_000 });
  });

  it('fallback humano usa o total uma vez, sem somar clientes integrados parcialmente conhecidos', async () => {
    expect(await humana(lojaA, D, '90,00', '4', '19')).toMatchObject({ ok: true });
    await integrada(a, lojaA, D, 3);
    await integrada(a, lojaA, D, null, 8_000, 2);
    const esperado = { valorCentavos: 20_000, pedidos: 5, clientes: 19, fonte: 'INTEGRACAO', fonteClientes: 'HUMANO',
      conferencia: { valorCentavos: 9_000, pedidos: 4, clientes: 19, diferencaCentavos: 11_000 } };
    expect(await faturamentoDoGrao(a, dono(), lojaA, 'IFOOD', D)).toMatchObject(esperado);
    const tela = (await obterDia(a, dono(), lojaA, D))!.canais.find(c => c.canal === 'IFOOD')!;
    expect(tela.valendo).toEqual(esperado);
    expect(tela.humano).toMatchObject({ valorCentavos: 9_000, pedidos: 4, clientes: 19, origem: 'MANUAL' });
    expect((await mes(lojaA)).total).toEqual({ valorCentavos: 20_000, pedidos: 5, clientes: 19, ticketMedioCentavos: 4_000 });
  });

  it('quando todos os clientes integrados são conhecidos, soma a integração e mantém humano só na conferência', async () => {
    expect(await humana(lojaA, D, '90,00', '4', '19')).toMatchObject({ ok: true });
    await integrada(a, lojaA, D, 3);
    await integrada(a, lojaA, D, 2, 8_000, 2);
    expect(await faturamentoDoGrao(a, dono(), lojaA, 'IFOOD', D)).toMatchObject({
      valorCentavos: 20_000, pedidos: 5, clientes: 5, fonteClientes: 'INTEGRACAO',
      conferencia: { clientes: 19, diferencaCentavos: 11_000 },
    });
  });

  it('zero integrado conhecido vence humano; zero humano informado é fallback legítimo para integração sem dado', async () => {
    expect(await humana(lojaA, D, '90,00', '4', '19')).toMatchObject({ ok: true });
    await integrada(a, lojaA, D, 0);
    expect(await faturamentoDoGrao(a, dono(), lojaA, 'IFOOD', D)).toMatchObject({ clientes: 0, fonteClientes: 'INTEGRACAO' });
    expect(await humana(lojaA, D2, '', '', '', 'IFOOD', { naoVendeu: true })).toMatchObject({ ok: true });
    await integrada(a, lojaA, D2, null);
    expect(await faturamentoDoGrao(a, dono(), lojaA, 'IFOOD', D2)).toMatchObject({
      clientes: 0, fonteClientes: 'HUMANO', valorCentavos: 12_000, pedidos: 3,
      conferencia: { valorCentavos: 0, pedidos: 0, clientes: 0, diferencaCentavos: 12_000 },
    });
  });

  it('NULL propaga em dia/canal/loja/rede, mas preserva totais conhecidos de outro canal e loja', async () => {
    await integrada(a, lojaA, D, null, 20_000, 5);
    await integrada(a, lojaA, D2, 2, 1_000, 1);
    expect(await humana(lojaA, D, '10,00', '2', '7', 'LOJA')).toMatchObject({ ok: true });
    expect(await humana(lojaA2, D, '40,00', '2', '8', 'LOJA')).toMatchObject({ ok: true });
    const rede = await mes();
    expect(rede.total).toEqual({ valorCentavos: 26_000, pedidos: 10, clientes: null, ticketMedioCentavos: 2_600 });
    expect(rede.porCanal.IFOOD).toEqual({ valorCentavos: 21_000, pedidos: 6, clientes: null, ticketMedioCentavos: 3_500 });
    expect(rede.porCanal.LOJA).toEqual({ valorCentavos: 5_000, pedidos: 4, clientes: 15, ticketMedioCentavos: 1_250 });
    const primeira = rede.lojas.find(l => l.loja.id === lojaA)!;
    expect(primeira.total).toEqual({ valorCentavos: 22_000, pedidos: 8, clientes: null, ticketMedioCentavos: 2_750 });
    expect(primeira.dias.find(d => d.data === D)!.total).toEqual({ valorCentavos: 21_000, pedidos: 7, clientes: null, ticketMedioCentavos: 3_000 });
    expect(primeira.dias.find(d => d.data === D2)!.total).toEqual({ valorCentavos: 1_000, pedidos: 1, clientes: 2, ticketMedioCentavos: 1_000 });
    expect((await mes(lojaA2)).total).toEqual({ valorCentavos: 4_000, pedidos: 2, clientes: 8, ticketMedioCentavos: 2_000 });
    expect(complementosDoFaturamento('ok', () => rede.total)).toMatchObject({ estado: 'ok', pedidos: 10, atendimentos: null, ticketMedioCentavos: 2_600 });
    // Completar o mesmo grão recupera atendimentos sem duplicar receita/pedidos.
    expect(await humana(lojaA, D, '90,00', '4', '19')).toMatchObject({ ok: true });
    expect((await mes()).total).toEqual({ valorCentavos: 26_000, pedidos: 10, clientes: 36, ticketMedioCentavos: 2_600 });
  });

  it('não empresta atendimentos de outro dia, canal, loja ou parceiro', async () => {
    await integrada(a, lojaA, D, null);
    expect(await humana(lojaA, D, '10,00', '1', '50', 'LOJA')).toMatchObject({ ok: true });
    expect(await humana(lojaA, D2, '10,00', '1', '40')).toMatchObject({ ok: true });
    expect(await humana(lojaA2, D, '10,00', '1', '30')).toMatchObject({ ok: true });
    await integrada(b, lojaB, D, 70);
    expect(await faturamentoDoGrao(a, dono(), lojaA, 'IFOOD', D)).toMatchObject({ clientes: null, fonteClientes: 'SEM_DADO' });
    expect(await faturamentoDoGrao(a, dono(), lojaB, 'IFOOD', D)).toBeNull();
    expect(await faturamentoDoGrao(b, dono(), lojaA, 'IFOOD', D)).toBeNull();
    const permitida = await mes(undefined, alcance([lojaA2]));
    expect(permitida.lojas.map(l => l.loja.id)).toEqual([lojaA2]);
    expect(permitida.total.clientes).toBe(30);
    expect(await obterDia(a, alcance([lojaA2]), lojaA, D)).toBeNull();
    expect((await mes(undefined, alcance('rede', ['faturamento.ver']))).lojas).toEqual([]);
  });

  it('alterar apenas clientes para NULL não muda receita, pedidos, ticket nem resultado do DRE', async () => {
    const l = await integrada(a, lojaA, D, 3, 12_345, 3, 'DELIVERY_PROPRIO');
    expect(await humana(lojaA, D, '900,00', '30', '50', 'DELIVERY_PROPRIO')).toMatchObject({ ok: true });
    const antes = await dreDoPeriodo(a, dono(), { tipo: 'loja', lojaId: lojaA }, D, HOJE);
    expect(antes?.resultado.receitaBrutaCentavos).toBe(12_345);
    await a.faturamentoLancamento.update({ where: { id: l.id }, data: { clientes: null } });
    const depois = await dreDoPeriodo(a, dono(), { tipo: 'loja', lojaId: lojaA }, D, HOJE);
    expect(depois?.resultado).toEqual(antes!.resultado);
    expect((await mes(lojaA)).total).toEqual({ valorCentavos: 12_345, pedidos: 3, clientes: 50, ticketMedioCentavos: 4_115 });
    const humanaAtual = await a.faturamentoLancamento.findFirstOrThrow({ where: { lojaId: lojaA, origem: 'MANUAL' } });
    await a.faturamentoLancamento.delete({ where: { id: humanaAtual.id } });
    expect((await mes(lojaA)).total).toEqual({ valorCentavos: 12_345, pedidos: 3, clientes: null, ticketMedioCentavos: 4_115 });
    expect((await dreDoPeriodo(a, dono(), { tipo: 'loja', lojaId: lojaA }, D, HOJE))?.resultado).toEqual(antes!.resultado);
  });

  it('lançamento humano vazio continua usando pedidos; salvar/editar preserva integração NULL e CAS', async () => {
    const integrado = await integrada(a, lojaA, D, null);
    expect(await humana(lojaA, D, '90,00', '4', '')).toMatchObject({ ok: true });
    const tela = (await obterDia(a, dono(), lojaA, D))!.canais.find(c => c.canal === 'IFOOD')!;
    expect(tela.humano).toMatchObject({ clientes: 4, pedidos: 4 });
    expect(tela.valendo).toMatchObject({ clientes: 4, fonteClientes: 'HUMANO', valorCentavos: 12_000, pedidos: 3 });
    expect(await humana(lojaA, D, '100,00', '5', '', 'IFOOD', { versao: tela.humano!.versao })).toMatchObject({ ok: true, canais: { IFOOD: 'alterado' } });
    expect(await humana(lojaA, D, '110,00', '6', '', 'IFOOD', { versao: tela.humano!.versao })).toMatchObject({ ok: false, conflito: true });
    expect((await a.faturamentoLancamento.findUnique({ where: { id: integrado.id } }))?.clientes).toBeNull();
    expect(await faturamentoDoGrao(a, dono(), lojaA, 'IFOOD', D)).toMatchObject({ clientes: 5, valorCentavos: 12_000, pedidos: 3 });
  });

  it('CSV vazio continua usando pedidos, reimporta sem duplicar e mantém histórico humano numérico', async () => {
    await integrada(a, lojaA, D, null);
    await integrada(a, lojaA, D, 2, 8_000, 2);
    const csv = (pedidos: number) => [CABECALHO_DO_MODELO, `10/10/2026;Fixture Centro;ifood;90,00;${pedidos};`].join('\n');
    const pre = await previaDaImportacao(a, dono(), csv(8), HOJE);
    expect(pre.contagem).toEqual({ nova: 1, muda: 0, igual: 0, erro: 0 });
    expect(pre.linhas[0].depois).toEqual({ valorCentavos: 9_000, pedidos: 8, clientes: 8 });
    expect(await importarPlanilha(a, dono(), csv(8), pre.impressao, 'fixture.csv', 'Pessoa sintética', HOJE)).toEqual({ ok: true, criadas: 1, alteradas: 0, iguais: 0, comErro: 0 });
    const humano = await a.faturamentoLancamento.findFirstOrThrow({ where: { lojaId: lojaA, origem: 'IMPORTACAO' } });
    const histAntes = await a.historicoAlteracao.count({ where: { entidadeId: humano.id } });
    const igual = await previaDaImportacao(a, dono(), csv(8), HOJE);
    expect(await importarPlanilha(a, dono(), csv(8), igual.impressao, 'fixture.csv', 'Pessoa sintética', HOJE)).toEqual({ ok: true, criadas: 0, alteradas: 0, iguais: 1, comErro: 0 });
    expect(await a.historicoAlteracao.count({ where: { entidadeId: humano.id } })).toBe(histAntes);
    const muda = await previaDaImportacao(a, dono(), csv(9), HOJE);
    expect(muda.linhas[0]).toMatchObject({ situacao: 'muda', antes: { clientes: 8 }, depois: { clientes: 9 } });
    expect(await importarPlanilha(a, dono(), csv(9), muda.impressao, 'fixture2.csv', 'Pessoa sintética', HOJE)).toMatchObject({ ok: true, alteradas: 1 });
    const alteracao = await a.historicoAlteracao.findFirstOrThrow({ where: { entidadeId: humano.id, acao: 'ALTEROU' } });
    expect(alteracao.antes).toMatchObject({ clientes: 8, pedidos: 8 });
    expect(alteracao.depois).toMatchObject({ clientes: 9, pedidos: 9 });
    expect(await faturamentoDoGrao(a, dono(), lojaA, 'IFOOD', D)).toMatchObject({ clientes: 9, fonteClientes: 'HUMANO', valorCentavos: 20_000, pedidos: 5 });
    expect(await a.faturamentoLancamento.count({ where: { lojaId: lojaA } })).toBe(3);
  });

  it('mês vazio mantém zero legítimo e um dia sem lançamento continua ausente', async () => {
    expect(await faturamentoDosGraos(a, dono(), { de: D, ate: D2 })).toEqual([]);
    const lido = await mes(lojaA);
    expect(lido.total).toEqual({ valorCentavos: 0, pedidos: 0, clientes: 0, ticketMedioCentavos: null });
    expect(lido.lojas[0].dias.find(d => d.data === D)!.total).toBeNull();
    expect((await obterDia(a, dono(), lojaA, D))!.canais.every(c => c.humano === null && c.valendo === null)).toBe(true);
  });
});
