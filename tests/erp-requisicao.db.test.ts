/**
 * ERP 1.8 · Requisição no Postgres de verdade:
 * - isolamento (parceiro B não vê A) e alcance (gerente da Delivery não vê a
 *   Penha); permissões por perfil (operador pede e não entrega; perfil
 *   próprio "Cozinha" só pede; setor não concede) — também pela server action;
 * - pedir: estoque aberto, número por loja (também em corrida), snapshot;
 * - entregar: parcial, baixa REQUISICAO com valor exato e coerente com o
 *   trigger/CHECK (saldo = Σ razão), idempotente e em corrida (uma baixa só);
 * - saldo negativo só com confirmação (e vira alarme nas divergências);
 * - devolução por estorno (espelho exato aceito pelo trigger);
 * - cancelar só a pedida;
 * - entregar × aplicar contagem em corrida: razão coerente, saldo certo;
 * - lista pela ficha (bruta, pré-preparo pelo insumo que produz);
 * - cruzamento com dados reais (abertura, compra, requisições, contagem que
 *   acusa falta de bacon sem requisição; pequenos repetidos que fecharam
 *   sozinhos dentro da tolerância).
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-requisicao.db.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const atual = vi.hoisted(() => ({ ctx: null as null | (() => unknown) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT ${url}`), { url });
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return { exigirParceiroDaSessao: async () => atual.ctx!(), exigirParceiro: async () => atual.ctx!(), recusaDaAcao, exigirPermissao, pode };
});
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: async () => ({}) } } }));

import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste as cadastrarInsumo, SEM_NOTA_FISCAL } from './erp-db-apoio';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { concluirAbertura, contarItem, iniciarAbertura, obterContagemDeAbertura, obterEstoqueDaLoja } from '@/lib/erp/estoque';
import { concluirContagem, contarNaContagem, iniciarCiclo, obterContagem } from '@/lib/erp/contagem';
import {
  atenderRequisicao,
  cancelarRequisicao,
  criarRequisicao,
  devolverItem,
  divergenciasDaLoja,
  listaDaFicha,
  lojasDasRequisicoes,
  obterRequisicao,
  quadroDeRequisicoes,
} from '@/lib/erp/requisicao';
import { listarHistorico } from '@/lib/erp/historico';
import { resolverAlcance, type Alcance, type Permissao } from '@/lib/erp/permissoes';
import * as estoqueDaSessao from '@/app/erp/estoque/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const DIA = 86_400_000;

describe.skipIf(!URL_TESTE)('ERP 1.8 · requisição e cruzamento com a contagem (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `r${globalThis.crypto.randomUUID().slice(0, 8)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  const hoje = hojeNoRio();
  const diaDaSemana = ((new Date(`${hoje}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  // Semana do parceiro termina hoje: o período de agora começou há 6 dias (a abertura, há 10, fica antes).
  const CFG = { tipo: 'SEMANAL' as const, diaInicio: (diaDaSemana % 7) + 1 };

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR' | null, lojaIds: string[] | 'rede', proprio: Permissao[] | null = null): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: proprio, permissoesExtras: [], permissoesRemovidas: [], redeInteira: lojaIds === 'rede', lojaIds: lojaIds === 'rede' ? [] : lojaIds });
  const DONA = () => alcanceDe('DONO', 'rede');
  const GERENTE = () => alcanceDe('GERENTE', [ids.vp]);
  const OPERADOR = () => alcanceDe('OPERADOR', [ids.vp]);
  const GERENTE_DELIVERY = () => alcanceDe('GERENTE', [ids.delivery]);
  // Perfil próprio "Cozinha": só pede (e vê fichas e estoque).
  const COZINHA = () => alcanceDe(null, [ids.vp], ['requisicao.pedir', 'estoque.ver', 'fichas.ver']);

  const saldo = async (insumoId: string) => (await a.saldoEstoque.findFirst({ where: { lojaId: ids.vp, insumoId }, select: { quantidadeMilesimos: true } }))?.quantidadeMilesimos ?? null;
  const razaoCoerente = async () => {
    const [r] = await db.$queryRawUnsafe<{ divergentes: number; quebrados: number }[]>(
      `SELECT
         (SELECT count(*)::int FROM "SaldoEstoque" s WHERE s."parceiroId" = $1 AND (s."quantidadeMilesimos", s."valorCentavos") <>
            (SELECT coalesce(sum(m."quantidadeMilesimos"), 0)::int, coalesce(sum(m."valorCentavos"), 0)::int FROM "MovimentoEstoque" m
              WHERE m."parceiroId" = s."parceiroId" AND m."lojaId" = s."lojaId" AND m."insumoId" = s."insumoId")) AS divergentes,
         (SELECT count(*)::int FROM "MovimentoEstoque" m WHERE m."parceiroId" = $1 AND m."saldoAntesMilesimos" + m."quantidadeMilesimos" <> m."saldoDepoisMilesimos") AS quebrados`,
      A.id,
    );
    return r;
  };
  const pedir = (alcance: Alcance, autor: string, linhas: { insumoId: string; quantidade: string; escala?: string }[], extra: Record<string, unknown> = {}) =>
    criarRequisicao(a, alcance, ids.vp, { setor: 'COZINHA', paraDia: 'hoje', observacao: '', linhas: linhas.map((l) => ({ escala: 'base', ...l })), ...extra }, autor);
  const req = async (id: string) => (await obterRequisicao(a, DONA(), ids.vp, id))!;
  const entregar = async (alcance: Alcance, id: string, porNome: Record<string, string>, extra: { encerrar?: boolean; confirmarNegativo?: boolean; versao?: number } = {}) => {
    const r = await req(id);
    const linhas = r.itens.filter((i) => porNome[i.nome] !== undefined).map((i) => ({ itemId: i.id, quantidade: porNome[i.nome], escala: 'base' }));
    return atenderRequisicao(a, alcance, ids.vp, id, { versao: extra.versao ?? r.requisicao.versao, linhas, encerrar: extra.encerrar ?? false, confirmarNegativo: extra.confirmarNegativo ?? false }, 'Edu Estoque');
  };
  const contarCiclo = async (insumoId: string, numero: string) => {
    const c = await iniciarCiclo(a, GERENTE(), ids.vp, { insumoIds: [insumoId], titulo: '' }, 'Gil Gerente');
    expect(c.ok).toBe(true);
    const cid = (c as { id: string }).id;
    const item = (await obterContagem(a, GERENTE(), ids.vp, cid))!.itens[0];
    const r = await contarNaContagem(a, OPERADOR(), ids.vp, cid, { itemId: item.id, embalagens: '', solto: numero, escala: 'base', versao: item.versao }, 'Caio');
    expect(r.ok).toBe(true);
    return { cid, r };
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Requisição A', slug: `requisicao-a-${sufixo}`, status: 'ATIVO' } });
    // 2.2a: a regra do período vive em RegraDoPeriodo (a semana do parceiro termina HOJE).
    a = doParceiro(A.id, db);
    // Pelo portão (como o app): com FORCE RLS, escrever pelo cliente cru em tabela de tenant falha.
    await a.regraDoPeriodo.create({ data: { parceiroId: A.id, vigenteDesde: new Date('2020-01-01T00:00:00Z'), tipo: CFG.tipo, diaInicio: CFG.diaInicio, criadoPorNome: 'teste' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Requisição B', slug: `requisicao-b-${sufixo}`, status: 'ATIVO' } });
    b = doParceiro(B.id, db);
    for (const [chave, nome] of [['vp', 'Vila da Penha'], ['delivery', 'Delivery']] as const) {
      const r = await cadastrarLoja(a, { nome }, 'Marina');
      if (!r.ok) throw new Error(JSON.stringify(r));
      ids[chave] = r.id;
    }
    for (const [chave, campos] of Object.entries({
      cheddar: { nome: 'Cheddar fatiado', unidade: 'KG', conteudo: '5', preco: '94,90', conservacao: 'REFRIGERADO' },
      bacon: { nome: 'Bacon', unidade: 'KG', conteudo: '1', preco: '42,00', conservacao: 'REFRIGERADO' },
      pao: { nome: 'Pão brioche', unidade: 'UN', conteudo: '12', preco: '18,00' },
      batata: { nome: 'Batata palito', unidade: 'KG', conteudo: '2', semPreco: 'on', conservacao: 'CONGELADO' },
    })) {
      const r = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    const f = await cadastrarFornecedor(a, { nome: 'Frigorífico Rio', ...SEM_NOTA_FISCAL }, 'Marina');
    if (!f.ok) throw new Error('fornecedor');
    ids.fornecedor = f.id;
    const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
    if (!lb.ok) throw new Error(JSON.stringify(lb));
    ids.lojaB = lb.id;
    // A Penha abriu o estoque há 10 dias: cheddar 10 kg, bacon 3 kg, pão 24, batata 5 kg.
    const antes = new Date(Date.now() - 10 * DIA);
    expect((await iniciarAbertura(a, DONA(), ids.vp, 'Marina', antes)).ok).toBe(true);
    const ab = (await obterContagemDeAbertura(a, DONA(), ids.vp))!;
    const numeros: Record<string, string> = { 'Cheddar fatiado': '10', Bacon: '3', 'Pão brioche': '24', 'Batata palito': '5' };
    for (const i of ab.itens) {
      const r = await contarItem(a, DONA(), ids.vp, { itemId: i.id, embalagens: '', solto: numeros[i.nome], escala: 'base', versao: i.versao }, 'Marina', { agora: antes });
      expect(r.ok).toBe(true);
    }
    const v = (await a.contagem.findFirst({ where: { lojaId: ids.vp, tipo: 'ABERTURA' }, select: { versao: true } }))!.versao;
    expect((await concluirAbertura(a, DONA(), ids.vp, { versao: v, confirmarNaoContados: false }, 'Marina', antes)).ok).toBe(true);
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('loja com o estoque não aberto não recebe pedido; lista vazia, setor de fora e insumo de outro parceiro são recusados', async () => {
    expect(await criarRequisicao(a, DONA(), ids.delivery, { setor: 'COZINHA', paraDia: 'hoje', observacao: '', linhas: [{ insumoId: ids.cheddar, quantidade: '1', escala: 'base' }] }, 'Marina')).toMatchObject({
      ok: false,
      erros: { geral: expect.stringMatching(/ainda não foi aberto/) },
    });
    expect(await pedir(OPERADOR(), 'Caio', [])).toMatchObject({ ok: false, erros: { itens: expect.any(String) } });
    expect(await pedir(OPERADOR(), 'Caio', [{ insumoId: ids.cheddar, quantidade: '1' }], { setor: 'COPA' })).toMatchObject({ ok: false, erros: { setor: expect.any(String) } });
    const deB = await cadastrarInsumo(b, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Insumo de B', unidade: 'KG', conteudo: '1', preco: '1,00' });
    expect(deB.ok).toBe(true);
    expect(await pedir(OPERADOR(), 'Caio', [{ insumoId: (deB as { id: string }).id, quantidade: '1' }])).toMatchObject({ ok: false, erros: { 'item:0': 'Escolha o insumo.' } });
    expect(await a.requisicao.count()).toBe(0);
  });

  it('o cozinheiro (operador) pede 2 kg de cheddar e 1 kg de bacon: #1, pedida, nada sai do estoque ainda', async () => {
    const r = await pedir(OPERADOR(), 'Caio Cozinha', [
      { insumoId: ids.cheddar, quantidade: '2' },
      { insumoId: ids.bacon, quantidade: '1000', escala: 'menor' },
    ]);
    expect(r.ok).toBe(true);
    ids.r1 = (r as { id: string }).id;
    const d = await req(ids.r1);
    expect(d.requisicao).toMatchObject({ numero: 1, status: 'ABERTA', setor: 'COZINHA', paraDia: hoje, pedidaPorNome: 'Caio Cozinha', versao: 0 });
    expect(d.itens.map((i) => [i.nome, i.solicitadoMilesimos, i.atendidoMilesimos, i.saldoMilesimos])).toEqual([
      ['Cheddar fatiado', 2000, 0, 10_000],
      ['Bacon', 1000, 0, 3000],
    ]);
    expect(await a.movimentoEstoque.count({ where: { tipo: 'REQUISICAO' } })).toBe(0);
    const h = await listarHistorico(a, { de: [{ entidade: 'Requisicao', ids: [ids.r1] }], limite: 5, verPrecos: true });
    expect(h[0]).toMatchObject({ acao: 'PEDIU', autorNome: 'Caio Cozinha' });
  });

  it('número por loja em corrida: dois pedidos juntos dão #2 e #3', async () => {
    const [x, y] = await Promise.all([pedir(COZINHA(), 'Ana', [{ insumoId: ids.pao, quantidade: '12' }]), pedir(COZINHA(), 'Bia', [{ insumoId: ids.batata, quantidade: '1' }], { setor: 'SALAO' })]);
    expect(x.ok && y.ok).toBe(true);
    const ns = await a.requisicao.findMany({ where: { id: { in: [(x as { id: string }).id, (y as { id: string }).id] } }, select: { id: true, numero: true } });
    expect(ns.map((n) => n.numero).sort()).toEqual([2, 3]);
    // Herança c da 1.8: a corrida decide quem fica com #2 — os testes seguintes falam do NÚMERO, não da ordem do Promise.all.
    ids.r2 = ns.find((n) => n.numero === 2)!.id;
    ids.r3 = ns.find((n) => n.numero === 3)!.id;
  });

  it('isolamento e alcance: B não vê; gerente da Delivery não vê nem entrega na Penha', async () => {
    expect(await quadroDeRequisicoes(b, DONA(), ids.vp)).toBeNull();
    expect(await obterRequisicao(b, DONA(), ids.vp, ids.r1)).toBeNull();
    expect(await obterRequisicao(b, DONA(), ids.lojaB, ids.r1)).toBeNull();
    expect(await quadroDeRequisicoes(a, GERENTE_DELIVERY(), ids.vp)).toBeNull();
    expect(await entregar(GERENTE_DELIVERY(), ids.r1, { 'Cheddar fatiado': '2' })).toMatchObject({ ok: false, naoEncontrado: true });
    expect((await lojasDasRequisicoes(a, GERENTE_DELIVERY())).map((l) => l.nome)).toEqual(['Delivery']);
    expect((await lojasDasRequisicoes(a, OPERADOR())).find((l) => l.nome === 'Vila da Penha')).toMatchObject({ pendentes: 3 });
  });

  it('permissões por perfil: operador e "Cozinha" pedem e não entregam (também pela server action); setor não concede', async () => {
    expect(await entregar(OPERADOR(), ids.r1, { 'Cheddar fatiado': '2' })).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/atender requisição/) } });
    expect(await entregar(COZINHA(), ids.r1, { 'Cheddar fatiado': '2' })).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/atender requisição/) } });
    // A server action de verdade, com o operador na sessão (setor Estoque não muda nada).
    atual.ctx = () => ({ cliente: a, alcance: OPERADOR(), parceiro: A, sessao: { userId: 'u', autorNome: 'Caio' }, bloqueio: null, pessoa: { setores: ['ESTOQUE'] } });
    const form = new FormData();
    form.set('versao', '0');
    const r = await estoqueDaSessao.acaoAtenderRequisicao(ids.vp, ids.r1, null, form);
    expect(r).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/atender requisição/) } });
    expect(await a.movimentoEstoque.count({ where: { tipo: 'REQUISICAO' } })).toBe(0);
    // Quadro: quem pede vê; divergências, não.
    expect(await quadroDeRequisicoes(a, COZINHA(), ids.vp)).not.toBeNull();
    expect(await divergenciasDaLoja(a, OPERADOR(), ids.vp, {})).toBeNull();
  });

  it('o estoquista entrega parcial (2 kg de cheddar, 600 g de bacon): REQUISICAO com valor exato, saldo antes › depois, atendida em parte', async () => {
    const r = await entregar(GERENTE(), ids.r1, { 'Cheddar fatiado': '2', Bacon: '0,6' });
    expect(r).toMatchObject({ ok: true });
    const movs = await a.movimentoEstoque.findMany({ where: { tipo: 'REQUISICAO' }, orderBy: { insumoNomeSnapshot: 'asc' }, select: { insumoNomeSnapshot: true, quantidadeMilesimos: true, valorCentavos: true, saldoAntesMilesimos: true, saldoDepoisMilesimos: true, motivo: true, requisicaoItemId: true } });
    expect(movs.map(({ requisicaoItemId, ...m }) => ({ ...m, item: !!requisicaoItemId }))).toEqual([
      { insumoNomeSnapshot: 'Bacon', quantidadeMilesimos: -600, valorCentavos: -2520, saldoAntesMilesimos: 3000, saldoDepoisMilesimos: 2400, motivo: 'Requisição #1 · Cozinha', item: true },
      { insumoNomeSnapshot: 'Cheddar fatiado', quantidadeMilesimos: -2000, valorCentavos: -3796, saldoAntesMilesimos: 10_000, saldoDepoisMilesimos: 8000, motivo: 'Requisição #1 · Cozinha', item: true },
    ]);
    const d = await req(ids.r1);
    expect(d.requisicao).toMatchObject({ status: 'PARCIAL', atendidaPorNome: 'Edu Estoque', versao: 1 });
    expect(d.itens.map((i) => [i.nome, i.atendidoMilesimos, i.faltaMilesimos])).toEqual([
      ['Cheddar fatiado', 2000, 0],
      ['Bacon', 600, 400],
    ]);
    expect(d.movimentos).toHaveLength(2);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
    // O livro da loja mostra a saída com o link da requisição.
    const e = (await obterEstoqueDaLoja(a, GERENTE(), ids.vp))!;
    expect(e.movimentos.filter((m) => m.tipo === 'REQUISICAO').every((m) => m.requisicaoId === ids.r1)).toBe(true);
  });

  it('entregar de novo a mesma tela (versão velha) não baixa; duas entregas do resto em corrida = uma baixa só', async () => {
    expect(await entregar(GERENTE(), ids.r1, { Bacon: '0,4' }, { versao: 0 })).toMatchObject({ ok: false, conflito: true });
    const v = (await req(ids.r1)).requisicao.versao;
    const [x, y] = await Promise.all([entregar(GERENTE(), ids.r1, { Bacon: '0,4' }, { versao: v }), entregar(GERENTE(), ids.r1, { Bacon: '0,4' }, { versao: v })]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(2); // a segunda encontra a requisição já atendida: "já feito"
    expect([x, y].filter((r) => r.ok && 'jaFeito' in r && r.jaFeito)).toHaveLength(1);
    expect(await a.movimentoEstoque.count({ where: { tipo: 'REQUISICAO', insumoId: ids.bacon } })).toBe(2);
    expect((await req(ids.r1)).requisicao).toMatchObject({ status: 'ATENDIDA' });
    expect(await saldo(ids.bacon)).toBe(2000);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('saldo insuficiente: sem confirmar, nada sai; confirmado, sai e o saldo fica negativo (alarme)', async () => {
    const p = await pedir(OPERADOR(), 'Caio', [{ insumoId: ids.pao, quantidade: '30' }]);
    ids.r4 = (p as { id: string }).id;
    const sem = await entregar(GERENTE(), ids.r4, { 'Pão brioche': '30' });
    expect(sem).toMatchObject({ ok: false, erros: { confirmarNegativo: expect.stringMatching(/Pão brioche: o livro diz 24 un; com esta saída fica −6 un/) } });
    expect(await saldo(ids.pao)).toBe(24_000);
    expect(await entregar(GERENTE(), ids.r4, { 'Pão brioche': '30' }, { confirmarNegativo: true })).toMatchObject({ ok: true });
    expect(await saldo(ids.pao)).toBe(-6000);
    const h = await listarHistorico(a, { de: [{ entidade: 'Requisicao', ids: [ids.r4] }], limite: 5, verPrecos: true });
    expect(JSON.stringify(h[0])).toMatch(/negativo/);
  });

  it('devolução por estorno: voltaram 300 g de bacon — espelho exato aceito pelo trigger, baixa do líquido, saldo e razão coerentes', async () => {
    const d = await req(ids.r1);
    const bacon = d.itens.find((i) => i.nome === 'Bacon')!;
    expect(await devolverItem(a, OPERADOR(), ids.vp, ids.r1, { versao: d.requisicao.versao, itemId: bacon.id, quantidade: '300', escala: 'menor', motivo: '' }, 'Caio')).toMatchObject({ ok: false });
    const r = await devolverItem(a, GERENTE(), ids.vp, ids.r1, { versao: d.requisicao.versao, itemId: bacon.id, quantidade: '300', escala: 'menor', motivo: 'sobrou do almoço' }, 'Edu Estoque');
    expect(r).toMatchObject({ ok: true });
    const movs = await a.movimentoEstoque.findMany({ where: { requisicaoItemId: bacon.id }, orderBy: [{ ocorridoEm: 'asc' }, { criadoEm: 'asc' }], select: { quantidadeMilesimos: true, valorCentavos: true, estornoDeId: true } });
    expect(movs.map((m) => [m.quantidadeMilesimos, m.valorCentavos, !!m.estornoDeId])).toEqual(
      expect.arrayContaining([
        [-600, -2520, false],
        [-400, -1680, false],
        [600, 2520, true],
        [400, 1680, true],
        [-700, -2940, false],
      ]),
    );
    expect(movs.reduce((s, m) => s + m.quantidadeMilesimos, 0)).toBe(-700);
    const depois = await req(ids.r1);
    expect(depois.itens.find((i) => i.nome === 'Bacon')).toMatchObject({ atendidoMilesimos: 700, devolvidoMilesimos: 300 });
    expect(await saldo(ids.bacon)).toBe(2300);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
    // Devolver mais do que saiu: recusado.
    expect(await devolverItem(a, GERENTE(), ids.vp, ids.r1, { versao: depois.requisicao.versao, itemId: bacon.id, quantidade: '1', escala: 'base', motivo: '' }, 'Edu')).toMatchObject({ ok: false, erros: { devolver: expect.stringMatching(/700 g/) } });
  });

  it('cancelar: só a pedida (quem pede pode), com motivo; atendida não cancela', async () => {
    expect(await cancelarRequisicao(a, OPERADOR(), ids.vp, ids.r3, { motivo: '' }, 'Caio')).toMatchObject({ ok: false, erros: { motivo: expect.any(String) } });
    expect(await cancelarRequisicao(a, OPERADOR(), ids.vp, ids.r3, { motivo: 'pedimos em dobro' }, 'Caio')).toMatchObject({ ok: true });
    expect(await cancelarRequisicao(a, OPERADOR(), ids.vp, ids.r3, { motivo: 'pedimos em dobro' }, 'Caio')).toMatchObject({ ok: true, jaFeito: true });
    expect(await cancelarRequisicao(a, GERENTE(), ids.vp, ids.r1, { motivo: 'errado' }, 'Gil')).toMatchObject({ ok: false, conflito: true });
    expect(await entregar(GERENTE(), ids.r3, { 'Batata palito': '1' })).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/cancelada/) } });
    const q = (await quadroDeRequisicoes(a, OPERADOR(), ids.vp))!;
    expect(q.colunas.CANCELADA.map((c) => c.numero)).toEqual([3]);
    expect(q.colunas.ATENDIDA.map((c) => c.numero).sort()).toEqual([1, 4]);
    expect(q.colunas.ABERTA.map((c) => c.numero)).toEqual([2]);
  });

  it('atrasada: pedida para 2 dias atrás aparece com "2d de atraso" no topo da coluna', async () => {
    await a.requisicao.updateMany({ where: { id: ids.r2 }, data: { paraDia: new Date(`${hojeNoRio(new Date(Date.now() - 2 * DIA))}T00:00:00.000Z`) } });
    const q = (await quadroDeRequisicoes(a, OPERADOR(), ids.vp))!;
    expect(q.colunas.ABERTA[0]).toMatchObject({ numero: 2, atrasoDias: 2 });
    expect((await lojasDasRequisicoes(a, OPERADOR())).find((l) => l.nome === 'Vila da Penha')).toMatchObject({ pendentes: 1, atrasadas: 1 });
  });

  it('entregar × aplicar contagem em corrida: o cheddar contado e a baixa juntos dão o saldo certo e o razão bate', async () => {
    // Contou 8 kg (bate com o livro). Em seguida, uma requisição de 1 kg é entregue enquanto o gerente aplica.
    const { cid } = await contarCiclo(ids.cheddar, '8');
    // Bateu exato e nada mexeu depois: fechou sozinha.
    expect((await a.contagem.findUnique({ where: { id: cid } }))!.desfecho).toBe('APLICADA_SOZINHA');
    // Contou 7,5 kg (500 g = R$ 9,49, fora da tolerância: espera o gerente).
    const c2 = await contarCiclo(ids.cheddar, '7,5');
    const p = await pedir(OPERADOR(), 'Caio', [{ insumoId: ids.cheddar, quantidade: '1' }]);
    ids.r5 = (p as { id: string }).id;
    const v = (await a.contagem.findUnique({ where: { id: c2.cid } }))!;
    expect(v.status).toBe('ABERTA');
    const [x, y] = await Promise.all([
      entregar(GERENTE(), ids.r5, { 'Cheddar fatiado': '1' }),
      concluirContagem(a, GERENTE(), ids.vp, c2.cid, { versao: v.versao, confirmarNaoContados: false }, 'Gil'),
    ]);
    expect(x.ok && y.ok).toBe(true);
    // 8 kg − 500 g (contagem) − 1 kg (requisição) = 6,5 kg, em qualquer ordem.
    expect(await saldo(ids.cheddar)).toBe(6500);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });

  it('lista pela ficha: 20 burgers pedem o bacon da receita e o molho PRONTO (insumo que o pré-preparo produz), sem cascata', async () => {
    const molho = await cadastrarFicha(a, { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '800', unidade: 'g' }] }, { tipo: 'manter' }, 'Marina');
    expect(molho.ok).toBe(true);
    const burger = await cadastrarFicha(
      a,
      {
        nome: 'Burger bacon',
        tipo: 'PRATO',
        rendimento: '1',
        itens: [
          { insumoId: ids.bacon, quantidade: '50', unidade: 'g' },
          { subfichaId: (molho as { id: string }).id, quantidade: '30', unidade: 'g' },
          { insumoId: ids.pao, quantidade: '1', unidade: 'un' },
        ],
      },
      { tipo: 'manter' },
      'Marina',
    );
    expect(burger.ok).toBe(true);
    const l = await listaDaFicha(a, OPERADOR(), ids.vp, (burger as { id: string }).id, '20');
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    const produzido = (await a.fichaTecnica.findUnique({ where: { id: (molho as { id: string }).id }, select: { insumoProduzidoId: true } }))!.insumoProduzidoId!;
    expect(l.linhas).toEqual(
      expect.arrayContaining([
        { insumoId: ids.bacon, quantidade: '1', escala: 'base' },
        { insumoId: produzido, quantidade: '0,6', escala: 'base' },
        { insumoId: ids.pao, quantidade: '20', escala: 'base' },
      ]),
    );
    expect(l.linhas.some((x) => x.insumoId === ids.cheddar)).toBe(false);
    expect(await listaDaFicha(a, OPERADOR(), ids.vp, (burger as { id: string }).id, '2,5')).toMatchObject({ ok: false, erros: { quantidade: expect.any(String) } });
    const r = await pedir(OPERADOR(), 'Caio', l.linhas, { fichaId: l.ficha.id, fichaQuantidade: String(l.ficha.quantidadeMilesimos) });
    expect(r.ok).toBe(true);
    expect((await req((r as { id: string }).id)).requisicao).toMatchObject({ fichaNomeSnapshot: 'Burger bacon', fichaQuantidadeMilesimos: 20_000 });
    await cancelarRequisicao(a, OPERADOR(), ids.vp, (r as { id: string }).id, { motivo: 'só teste da ficha' }, 'Caio');
    // Herança b da 1.8: quantidade da ficha forjada acima do INTEGER não dá 500 — o pedido entra, sem a origem ficha.
    for (const forjada of ['3000000000', '10000001']) {
      const f = await pedir(OPERADOR(), 'Caio', l.linhas, { fichaId: l.ficha.id, fichaQuantidade: forjada });
      expect(f.ok).toBe(true);
      expect((await req((f as { id: string }).id)).requisicao).toMatchObject({ fichaId: null, fichaQuantidadeMilesimos: null });
      await cancelarRequisicao(a, OPERADOR(), ids.vp, (f as { id: string }).id, { motivo: 'só teste do teto' }, 'Caio');
    }
    expect(await listaDaFicha(a, OPERADOR(), ids.vp, (burger as { id: string }).id, '10001')).toMatchObject({ ok: false, erros: { quantidade: expect.any(String) } });
  });

  it('cruzamento: contagem acusa 500 g de bacon a menos sem requisição → divergência de R$ 21,00; pequenos repetidos do cheddar; pão negativo', async () => {
    // Livro do bacon: 3 kg − 1 kg + 300 g devolvidos = 2,3 kg. Contou 1,8 kg.
    const { cid } = await contarCiclo(ids.bacon, '1,8');
    const c = (await a.contagem.findUnique({ where: { id: cid } }))!;
    expect(c.status).toBe('ABERTA'); // R$ 21,00 passa da tolerância: não fecha sozinha
    expect((await concluirContagem(a, GERENTE(), ids.vp, cid, { versao: c.versao, confirmarNaoContados: false }, 'Gil')).ok).toBe(true);
    // Cheddar: dois pequenos dentro da tolerância (200 g = R$ 3,80 cada) — fecham sozinhos.
    for (const n of ['6,3', '6,1']) {
      const p = await contarCiclo(ids.cheddar, n);
      expect(p.r.ok && 'fechouSozinha' in p.r && p.r.fechouSozinha).toBe(true);
    }
    const d = (await divergenciasDaLoja(a, GERENTE(), ids.vp, {}))!;
    expect(d.aberto).toBe(true);
    if (!d.aberto) return;
    const bacon = d.linhas.find((l) => l.nome === 'Bacon')!;
    // consumo = 3 kg (abertura) + 0 − 1,8 kg = 1,2 kg; requisitado 700 g (1 kg − 300 g devolvidos); sumiço 500 g × R$ 42,00.
    expect(bacon).toMatchObject({ trechos: 1, consumoMilesimos: 1200, requisitadoMilesimos: 700, sumicoMilesimos: 500, sumicoCentavos: 2100 });
    expect(bacon.requisitadoPorSetor.get('COZINHA')).toBe(700);
    const cheddar = d.linhas.find((l) => l.nome === 'Cheddar fatiado')!;
    // Trechos: abertura → 8 kg (bateu), 8 → 7,5 (500 g), 7,5 → 6,3 (com 1 kg requisitado: 200 g), 6,3 → 6,1 (200 g).
    expect(cheddar).toMatchObject({ trechos: 4, requisitadoMilesimos: 3000, sumicoMilesimos: 900, sumicoCentavos: 1708, pequenos: { vezes: 2, milesimos: 400, centavos: 759 } });
    expect(d.linhas[0].nome).toBe('Bacon'); // ranking por valor
    expect(d.resumo).toMatchObject({ comSumico: 2, pequenosRepetidos: 1 });
    expect(d.resumo.sumicoCentavos).toBe(2100 + cheddar.sumicoCentavos!);
    expect(d.setores[0]).toMatchObject({ setor: 'COZINHA', insumosComSumico: 2 });
    expect(d.negativos).toEqual([expect.objectContaining({ nome: 'Pão brioche', quantidadeMilesimos: -6000, valorCentavos: -900 })]);
    // Pão foi requisitado e nunca recontado: fica como "sem contagem para cruzar".
    expect(d.semContagem.map((s) => [s.nome, s.quantidade])).toEqual([['Pão brioche', 30_000]]);
    // É leitura: nada foi gravado pelo relatório.
    const antes = await a.movimentoEstoque.count();
    await divergenciasDaLoja(a, DONA(), ids.vp, {});
    expect(await a.movimentoEstoque.count()).toBe(antes);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
    // Gerente de outra loja e parceiro B não veem.
    expect(await divergenciasDaLoja(a, GERENTE_DELIVERY(), ids.vp, {})).toBeNull();
    expect(await divergenciasDaLoja(b, DONA(), ids.vp, {})).toBeNull();
  });

  it('herança a da 1.8: duas entregas do MESMO insumo em requisições diferentes, juntas, não pulam a confirmação do negativo', async () => {
    // Queijo prato entra pela nota (loja aberta): 1 kg no livro. Duas requisições de 700 g, cada uma cabe sozinha.
    const q = await cadastrarInsumo(a, { tipo: 'INGREDIENTE', escala: 'base', nome: 'Queijo prato', unidade: 'KG', conteudo: '1', preco: '30,00', conservacao: 'REFRIGERADO' });
    expect(q.ok).toBe(true);
    ids.prato = (q as { id: string }).id;
    const n = await lancarNota(a, DONA(), { lojaId: ids.vp, fornecedorId: ids.fornecedor, numero: '9001', serie: '', data: hoje, frete: '', total: '30,00', itens: [{ insumoId: ids.prato, embalagem: 'padrao', quantidade: '1', valor: '30,00' }] }, 'Marina');
    expect(n.ok).toBe(true);
    expect(await saldo(ids.prato)).toBe(1000);
    const [p1, p2] = [await pedir(OPERADOR(), 'Ana', [{ insumoId: ids.prato, quantidade: '700', escala: 'menor' }]), await pedir(OPERADOR(), 'Bia', [{ insumoId: ids.prato, quantidade: '700', escala: 'menor' }])];
    const r1 = (p1 as { id: string }).id;
    const r2 = (p2 as { id: string }).id;
    const [x, y] = await Promise.all([entregar(GERENTE(), r1, { 'Queijo prato': '0,7' }), entregar(GERENTE(), r2, { 'Queijo prato': '0,7' })]);
    // Uma passa; a outra, que leu o saldo travado depois da primeira, pede a confirmação (o livro diz 300 g).
    expect([x, y].filter((r) => r.ok)).toHaveLength(1);
    const recusada = [x, y].find((r) => !r.ok)!;
    expect(recusada).toMatchObject({ ok: false, erros: { confirmarNegativo: expect.stringMatching(/Queijo prato: o livro diz 300 g; com esta saída fica −400 g/) } });
    expect(await saldo(ids.prato)).toBe(300);
    // Confirmado, sai e fica negativo (alarme), com o razão coerente.
    const qual = x.ok ? r2 : r1;
    expect(await entregar(GERENTE(), qual, { 'Queijo prato': '0,7' }, { confirmarNegativo: true })).toMatchObject({ ok: true });
    expect(await saldo(ids.prato)).toBe(-400);
    expect(await razaoCoerente()).toEqual({ divergentes: 0, quebrados: 0 });
  });
});
