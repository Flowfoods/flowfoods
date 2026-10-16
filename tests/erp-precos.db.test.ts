/**
 * ERP 1.10 · Preço e margem por canal no Postgres de verdade:
 * - margens-alvo do parceiro (loja 70 %, delivery 65 %, iFood 60 %) e o
 *   sugerido exato de cada canal do "Burger cheddar";
 * - preço próprio pela server action: o servidor recalcula (campos forjados
 *   no formulário não valem), grava e deixa o retrato no histórico da ficha
 *   (antes/depois e o custo do canal na hora);
 * - permissões: operador e gerente não mudam preço nem margem; a dona muda;
 *   operador nem tem `precos.ver`;
 * - concorrência: duas abas no preço (impressão), duas nas margens (versão),
 *   preço salvo enquanto a nota muda o custo (o histórico grava o custo do
 *   instante, coerente com a margem) e taxa que estouraria o alvo;
 * - nota do cheddar mais cara: a margem cai e o farol avisa;
 * - incompleto: o preço próprio entra, as margens não viram número;
 * - isolamento: B não lê nem grava preço de A; margens de A não valem em B;
 * - lista de fichas: preço e margem em lote.
 *
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-precos.db.test.ts
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
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja } from '@/lib/erp/estrutura';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { cadastrarFicha, listarFichas, obterFicha } from '@/lib/erp/fichas';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { custoPorCanal, obterTaxaDoIfood, precosDaLista, salvarEmbalagens, salvarMargensAlvo, salvarPrecos, salvarTaxaDoIfood } from '@/lib/erp/canais';
import { formatarPorcentagem, formatarReaisComSinal } from '@/lib/erp/preco-campos';
import { listarHistorico } from '@/lib/erp/historico';
import { compararFracoes } from '@/lib/erp/unidades';
import { pode, resolverAlcance, type Alcance } from '@/lib/erp/permissoes';
import * as fichasDaSessao from '@/app/erp/fichas/actions';
import { limparParceiros, perfilDoBanco, type PerfilDoBanco } from './erp-db-apoio';

const URL_TESTE = process.env.ERP_DB_TESTE;
const sp = (t: string) => t.replace(/\s/g, ' ');

describe.skipIf(!URL_TESTE)('ERP 1.10 · preço e margem por canal (Postgres real)', { timeout: 120_000 }, () => {
  let db: PrismaClient;
  let perfil: PerfilDoBanco;
  const sufixo = `p${Date.now().toString(36)}`;
  let A: { id: string };
  let B: { id: string };
  let a: ClienteDoParceiro;
  let b: ClienteDoParceiro;
  const ids: Record<string, string> = {};
  let notas = 0;

  const alcanceDe = (perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR'): Alcance =>
    resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const ctxDe = (cliente: ClienteDoParceiro, parceiro: { id: string }, perfilBase: 'DONO' | 'GERENTE' | 'OPERADOR', autorNome: string) => () => ({
    cliente,
    alcance: alcanceDe(perfilBase),
    parceiro,
    sessao: { userId: 'u', autorNome },
    bloqueio: null,
    pessoa: { setores: [] },
  });

  const tela = async (cliente: ClienteDoParceiro, fichaId: string) => {
    const f = (await obterFicha(cliente, fichaId))!;
    return (await custoPorCanal(cliente, f))!;
  };
  const formDosPrecos = (t: { impressaoDosPrecos: string; impressaoDosCustos: string }, precos: Partial<Record<string, string>>, extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set('impressao', t.impressaoDosPrecos);
    f.set('custos', t.impressaoDosCustos);
    for (const c of ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']) f.set(`preco_${c}`, precos[c] ?? '');
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };
  const formDasMargens = (versao: string, m: Partial<Record<string, string>>) => {
    const f = new FormData();
    f.set('versao', versao);
    for (const c of ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']) f.set(`margem_${c}`, m[c] ?? '');
    return f;
  };
  const notaDoCheddar = async (valor: string) => {
    const r = await lancarNota(
      a,
      alcanceDe('DONO'),
      {
        lojaId: ids.loja,
        fornecedorId: ids.forn,
        numero: `${++notas}`,
        serie: '',
        data: hojeNoRio(),
        frete: '',
        total: valor,
        itens: [{ insumoId: ids.cheddar, embalagem: 'padrao', quantidade: '1', valor }],
      },
      'Marina',
    );
    if (!r.ok) throw new Error(JSON.stringify(r));
  };

  beforeAll(async () => {
    const host = new URL(URL_TESTE!).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('ERP_DB_TESTE precisa ser local.');
    db = new PrismaClient({ datasources: { db: { url: URL_TESTE } } });
    perfil = await perfilDoBanco(db);
    A = await db.parceiroFlow.create({ data: { nome: 'Preços A', slug: `precos-a-${sufixo}`, status: 'ATIVO' } });
    B = await db.parceiroFlow.create({ data: { nome: 'Preços B', slug: `precos-b-${sufixo}`, status: 'ATIVO' } });
    a = doParceiro(A.id, db);
    b = doParceiro(B.id, db);
    for (const [chave, campos] of Object.entries({
      pao: { tipo: 'INGREDIENTE', nome: 'Pão brioche', unidade: 'UN', conteudo: '12', preco: '18,00' },
      blend: { tipo: 'INGREDIENTE', nome: 'Blend bovino', unidade: 'KG', conteudo: '5', preco: '94,90' },
      cheddar: { tipo: 'INGREDIENTE', nome: 'Cheddar', unidade: 'KG', conteudo: '1', preco: '50,00' },
      bacon: { tipo: 'INGREDIENTE', nome: 'Bacon', unidade: 'KG', conteudo: '1', preco: '', semPreco: 'sim' },
      caixa: { tipo: 'EMBALAGEM', nome: 'Caixa kraft', unidade: 'UN', conteudo: '100', preco: '89,00' },
      guardanapo: { tipo: 'EMBALAGEM', nome: 'Guardanapo', unidade: 'UN', conteudo: '1000', preco: '4,00' },
      sacola: { tipo: 'EMBALAGEM', nome: 'Sacola', unidade: 'UN', conteudo: '100', preco: '25,00' },
    })) {
      const r = await cadastrarInsumo(a, { escala: 'base', ...campos });
      if (!r.ok) throw new Error(`${chave}: ${JSON.stringify(r)}`);
      ids[chave] = r.id;
    }
    // Burger cheddar: pão 150 c + blend 180 g 341,64 c + cheddar 20 g 100 c = 591,64 c por porção.
    const f = await cadastrarFicha(
      a,
      {
        nome: 'Burger cheddar',
        tipo: 'PRATO',
        rendimento: '1',
        itens: [
          { insumoId: ids.pao, quantidade: '1', unidade: 'un' },
          { insumoId: ids.blend, quantidade: '180', unidade: 'g' },
          { insumoId: ids.cheddar, quantidade: '20', unidade: 'g' },
        ],
      },
      { tipo: 'manter' },
      'Marina',
    );
    if (!f.ok) throw new Error(JSON.stringify(f));
    ids.burger = f.id;
    // Delivery: caixa + 2 guardanapos (89,8 c); iFood: caixa + sacola + 2 guardanapos (114,8 c).
    const em = await salvarEmbalagens(
      a,
      ids.burger,
      {
        impressao: '',
        linhas: [
          { canal: 'DELIVERY_PROPRIO', insumoId: ids.caixa, quantidade: '1', unidade: 'un' },
          { canal: 'DELIVERY_PROPRIO', insumoId: ids.guardanapo, quantidade: '2', unidade: 'un' },
          { canal: 'IFOOD', insumoId: ids.caixa, quantidade: '1', unidade: 'un' },
          { canal: 'IFOOD', insumoId: ids.sacola, quantidade: '1', unidade: 'un' },
          { canal: 'IFOOD', insumoId: ids.guardanapo, quantidade: '2', unidade: 'un' },
        ],
      },
      'Marina',
    );
    if (!em.ok) throw new Error(JSON.stringify(em));
    const bacon = await cadastrarFicha(
      a,
      { nome: 'Burger bacon', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: ids.pao, quantidade: '1', unidade: 'un' }, { insumoId: ids.bacon, quantidade: '30', unidade: 'g' }] },
      { tipo: 'manter' },
      'Marina',
    );
    if (!bacon.ok) throw new Error(JSON.stringify(bacon));
    ids.baconBurger = bacon.id;
    const loja = await cadastrarLoja(a, { nome: 'Vila da Penha' }, 'Marina');
    const forn = await cadastrarFornecedor(a, { nome: 'Laticínios Rio' }, 'Marina');
    if (!loja.ok || !forn.ok) throw new Error('loja/fornecedor');
    ids.loja = loja.id;
    ids.forn = forn.id;
    const caixaB = await cadastrarInsumo(b, { escala: 'base', tipo: 'INGREDIENTE', nome: 'Pão de B', unidade: 'UN', conteudo: '10', preco: '10,00' });
    if (!caixaB.ok) throw new Error('B');
    const fb = await cadastrarFicha(b, { nome: 'Burger de B', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: caixaB.id, quantidade: '1', unidade: 'un' }] }, { tipo: 'manter' }, 'Bia');
    if (!fb.ok) throw new Error('B ficha');
    ids.burgerB = fb.id;
  });

  afterAll(async () => {
    if (db) await limparParceiros(db, perfil, [A.id, B.id]);
    await db?.$disconnect();
  });

  it('sem margem-alvo: sem sugerido, sem preço; o operador nem tem "ver preços", o gerente vê', async () => {
    const t = await tela(a, ids.burger);
    // O iFood sem a taxa é incompleto antes de tudo (nunca um sugerido sem a taxa).
    expect(t.precos.map((p) => p.sugerido.tipo)).toEqual(['semAlvo', 'semAlvo', 'incompleto']);
    expect(t.precos.map((p) => p.preco)).toEqual([null, null, null]);
    expect(t.impressaoDosPrecos).toBe('LOJA:-|DELIVERY_PROPRIO:-|IFOOD:-');
    expect(t.precos[2].porQue).toBe('taxa do iFood não configurada');
    expect(pode(alcanceDe('OPERADOR'), 'precos.ver')).toBe(false);
    expect(pode(alcanceDe('GERENTE'), 'precos.ver')).toBe(true);
    expect(pode(alcanceDe('GERENTE'), 'precos.editar')).toBe(false);
  });

  it('margens-alvo: gerente e operador recusados; iFood espera a taxa; a dona define 70/65/60 e o histórico do canal registra', async () => {
    const v0 = (await obterTaxaDoIfood(a)).versaoDasMargens;
    for (const p of ['OPERADOR', 'GERENTE'] as const) {
      atual.ctx = ctxDe(a, A, p, p);
      expect(await fichasDaSessao.acaoSalvarMargensAlvo(null, formDasMargens(v0, { LOJA: '70' }))).toMatchObject({ ok: false, erros: { geral: expect.any(String) } });
    }
    expect(await a.canalConfig.count()).toBe(0);
    atual.ctx = ctxDe(a, A, 'DONO', 'Marina');
    expect(await fichasDaSessao.acaoSalvarMargensAlvo(null, formDasMargens(v0, { LOJA: '70', DELIVERY_PROPRIO: '65', IFOOD: '60' }))).toMatchObject({
      ok: false,
      erros: { 'margem-IFOOD': expect.stringMatching(/taxa do iFood/) },
    });
    expect(await a.canalConfig.count()).toBe(0);
    expect(await salvarTaxaDoIfood(a, { comissao: '23', pagamento: '3,2', versao: '' }, 'Marina')).toMatchObject({ ok: true });
    const v1 = (await obterTaxaDoIfood(a)).versaoDasMargens;
    await expect(fichasDaSessao.acaoSalvarMargensAlvo(null, formDasMargens(v1, { LOJA: '70', DELIVERY_PROPRIO: '65', IFOOD: '60' }))).rejects.toMatchObject({
      url: '/erp/fichas/canais?feito=margens',
    });
    const o = await obterTaxaDoIfood(a);
    expect(o.margens).toEqual({ LOJA: 7000, DELIVERY_PROPRIO: 6500, IFOOD: 6000 });
    expect(o.taxa).toEqual({ comissaoBp: 2300, pagamentoBp: 320 });
    expect(o.historico.find((h) => h.alvo === 'Loja')?.mudancas).toEqual([{ campo: 'margem-alvo', antes: 'sem alvo', depois: '70%' }]);
    // Mesmas margens de novo: nada muda.
    await expect(fichasDaSessao.acaoSalvarMargensAlvo(null, formDasMargens(o.versaoDasMargens, { LOJA: '70', DELIVERY_PROPRIO: '65', IFOOD: '60' }))).rejects.toMatchObject({
      url: '/erp/fichas/canais?feito=margens-igual',
    });
  });

  it('sugeridos exatos: loja 5,9164 ÷ 0,30 → R$ 19,73 · delivery 6,8144 ÷ 0,35 → R$ 19,47 · iFood 7,0644 ÷ 0,138 → R$ 51,20', async () => {
    const t = await tela(a, ids.burger);
    expect(t.precos.map((p) => p.sugerido)).toMatchObject([
      { tipo: 'ok', centavos: 1973, cardapio: 1990 },
      { tipo: 'ok', centavos: 1947, cardapio: 1990 },
      { tipo: 'ok', centavos: 5120, cardapio: 5190 },
    ]);
    expect(t.precos.map((p) => p.preco)).toEqual([
      { centavos: 1973, origem: 'sugerido' },
      { centavos: 1947, origem: 'sugerido' },
      { centavos: 5120, origem: 'sugerido' },
    ]);
    expect(t.precos.map((p) => p.margens?.farol)).toEqual(['noAlvo', 'noAlvo', 'noAlvo']);
  });

  it('preço pela action: gerente recusado; a dona digita R$ 29,90 no iFood, campos forjados não valem, o servidor recalcula e o histórico guarda o retrato', async () => {
    const t = await tela(a, ids.burger);
    atual.ctx = ctxDe(a, A, 'GERENTE', 'Gil');
    expect(await fichasDaSessao.acaoSalvarPrecos(ids.burger, null, formDosPrecos(t, { IFOOD: '29,90' }))).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/preços/) } });
    expect(await a.produtoCanal.count()).toBe(0);
    atual.ctx = ctxDe(a, A, 'DONO', 'Marina');
    // A prévia do navegador manda o que quiser: só o texto do preço vale.
    const forjado = { margem_IFOOD: '99', sugerido_IFOOD: '1', custo_IFOOD: '0', precoManualCentavos: '1', margemAlvoBp: '0' };
    await expect(fichasDaSessao.acaoSalvarPrecos(ids.burger, null, formDosPrecos(t, { IFOOD: '29,90' }, forjado))).rejects.toMatchObject({
      url: `/erp/fichas/${ids.burger}?feito=precos`,
    });
    expect(await a.produtoCanal.findMany({ select: { canal: true, precoManualCentavos: true, margemAlvoBp: true } })).toEqual([
      { canal: 'IFOOD', precoManualCentavos: 2990, margemAlvoBp: null },
    ]);
    expect((await obterTaxaDoIfood(a)).margens.IFOOD).toBe(6000);
    const depois = await tela(a, ids.burger);
    const ifood = depois.precos[2];
    // Taxa 26,2% de 29,90 = 7,8338; bruta = 29,90 − 7,0644 = 22,8356 (76,4%); líquida = 15,0018 (50,2%): abaixo do alvo de 60%.
    expect(sp(formatarReaisComSinal(ifood.margens!.taxa))).toBe('R$ 7,83');
    expect(sp(formatarReaisComSinal(ifood.margens!.bruta))).toBe('R$ 22,84');
    expect(formatarPorcentagem(ifood.margens!.brutaBp)).toBe('76,4%');
    expect(sp(formatarReaisComSinal(ifood.margens!.liquida))).toBe('R$ 15,00');
    expect(formatarPorcentagem(ifood.margens!.liquidaBp)).toBe('50,2%');
    expect(ifood.margens!.farol).toBe('abaixo');
    expect(ifood.preco).toEqual({ centavos: 2990, origem: 'proprio' });
    expect(ifood.sugerido).toMatchObject({ centavos: 5120 });
    expect(depois.canais[2].total).not.toBeNull();
    const h = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [ids.burger] }], limite: 1 });
    expect(h[0].autorNome).toBe('Marina');
    expect(h[0].mudancas.map((m) => ({ ...m, depois: sp(m.depois), antes: m.antes && sp(m.antes) }))).toEqual([
      { campo: 'preço no iFood', antes: 'sugerido (R$ 51,20)', depois: 'R$ 29,90' },
      { campo: 'margem líquida no iFood', antes: 'R$ 30,72 (60,0%)', depois: 'R$ 15,00 (50,2%)' },
      { campo: 'custo do iFood na hora', antes: null, depois: 'R$ 14,90' },
    ]);
    // O mesmo preço de novo: nada muda, nada no histórico.
    const n = await a.historicoAlteracao.count();
    await expect(fichasDaSessao.acaoSalvarPrecos(ids.burger, null, formDosPrecos(depois, { IFOOD: '29,90' }))).rejects.toMatchObject({
      url: `/erp/fichas/${ids.burger}?feito=precos-igual`,
    });
    expect(await a.historicoAlteracao.count()).toBe(n);
    // Texto ruim volta para o campo, com a frase.
    expect(await salvarPrecos(a, ids.burger, { impressao: depois.impressaoDosPrecos, custos: '', precos: { LOJA: '0', IFOOD: '29,999' } }, 'Marina')).toMatchObject({
      ok: false,
      erros: { 'preco-LOJA': expect.stringMatching(/maior que zero/), 'preco-IFOOD': expect.any(String) },
    });
  });

  it('concorrência: duas abas no preço — uma grava, a outra recebe "alguém mudou"; nas margens também', async () => {
    const t = await tela(a, ids.burger);
    const [x, y] = await Promise.all([
      salvarPrecos(a, ids.burger, { impressao: t.impressaoDosPrecos, custos: t.impressaoDosCustos, precos: { LOJA: '24,90', IFOOD: '29,90' } }, 'Ana'),
      salvarPrecos(a, ids.burger, { impressao: t.impressaoDosPrecos, custos: t.impressaoDosCustos, precos: { LOJA: '26,90', IFOOD: '29,90' } }, 'Bia'),
    ]);
    expect([x, y].filter((r) => r.ok)).toHaveLength(1);
    expect([x, y].find((r) => !r.ok)).toMatchObject({ ok: false, conflito: true, erros: { geral: expect.stringMatching(/Alguém mudou os preços/) } });
    expect(await a.produtoCanal.count({ where: { canal: 'LOJA' } })).toBe(1);
    const v = (await obterTaxaDoIfood(a)).versaoDasMargens;
    const [m1, m2] = await Promise.all([
      salvarMargensAlvo(a, { versao: v, margens: { LOJA: '68', DELIVERY_PROPRIO: '65', IFOOD: '60' } }, 'Ana'),
      salvarMargensAlvo(a, { versao: v, margens: { LOJA: '72', DELIVERY_PROPRIO: '65', IFOOD: '60' } }, 'Bia'),
    ]);
    expect([m1, m2].filter((r) => r.ok)).toHaveLength(1);
    expect([m1, m2].find((r) => !r.ok)).toMatchObject({ conflito: true });
    const o = await obterTaxaDoIfood(a);
    expect(await salvarMargensAlvo(a, { versao: o.versaoDasMargens, margens: { LOJA: '70', DELIVERY_PROPRIO: '65', IFOOD: '60' } }, 'Marina')).toMatchObject({ ok: true });
    // A taxa que, com o alvo de 60%, passaria de 100% é recusada; a tela velha (versão antiga) também.
    const o2 = await obterTaxaDoIfood(a);
    expect(await salvarTaxaDoIfood(a, { comissao: '38', pagamento: '2', versao: o2.versao }, 'Marina')).toMatchObject({ ok: false, erros: { geral: expect.stringMatching(/margem-alvo do iFood/) } });
    // Taxa e margem do iFood moram na mesma linha: mudar a margem deixa a tela velha da taxa em conflito.
    expect(await salvarMargensAlvo(a, { versao: o2.versaoDasMargens, margens: { LOJA: '70', DELIVERY_PROPRIO: '65', IFOOD: '61' } }, 'Marina')).toMatchObject({ ok: true });
    expect(await salvarTaxaDoIfood(a, { comissao: '23', pagamento: '3,2', versao: o2.versao }, 'Marina')).toMatchObject({ ok: false, conflito: true });
    const o3 = await obterTaxaDoIfood(a);
    expect(await salvarMargensAlvo(a, { versao: o3.versaoDasMargens, margens: { LOJA: '70', DELIVERY_PROPRIO: '65', IFOOD: '60' } }, 'Marina')).toMatchObject({ ok: true });
  });

  it('nota do cheddar mais cara: a margem cai e o farol avisa; salvar com a tela velha grava o custo de AGORA no histórico e avisa', async () => {
    const t = await tela(a, ids.burger);
    const lojaAntes = t.precos[0];
    await notaDoCheddar('80,00'); // 20 g a R$ 80,00/kg = 160 c (era 100 c)
    const depois = await tela(a, ids.burger);
    const ifood = depois.precos[2];
    // iFood a 29,90: líquida = 29,90 − 7,6644 − 7,8338 = 14,4018 (48,2%).
    expect(formatarPorcentagem(ifood.margens!.liquidaBp)).toBe('48,2%');
    expect(ifood.margens!.farol).toBe('abaixo');
    // A loja (preço próprio) também perde margem: o custo subiu 60 c.
    expect(compararFracoes(depois.precos[0].margens!.liquida, lojaAntes.margens!.liquida)).toBe(-1);
    // Salvar com a tela de antes da nota: grava, avisa, e o retrato tem o custo de agora (6,5164 + nada de taxa).
    atual.ctx = ctxDe(a, A, 'DONO', 'Marina');
    await expect(fichasDaSessao.acaoSalvarPrecos(ids.burger, null, formDosPrecos(t, { LOJA: '25,90', IFOOD: '29,90' }))).rejects.toMatchObject({
      url: `/erp/fichas/${ids.burger}?feito=precos-custo`,
    });
    const h = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [ids.burger] }], limite: 1 });
    expect(h[0].mudancas.map((m) => sp(m.depois))).toEqual(expect.arrayContaining(['R$ 25,90', 'R$ 19,38 (74,8%)', 'R$ 6,52']));
  });

  it('preço × nota ao mesmo tempo: o histórico grava um custo coerente (o de antes ou o de depois), com a margem dele', async () => {
    const t = await tela(a, ids.burger);
    await Promise.all([
      notaDoCheddar('110,00'), // 20 g = 220 c: loja = 7,1164
      salvarPrecos(a, ids.burger, { impressao: t.impressaoDosPrecos, custos: t.impressaoDosCustos, precos: { LOJA: '27,90', IFOOD: '29,90' } }, 'Marina'),
    ]);
    const h = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [ids.burger] }], limite: 1 });
    const de = (campo: string) => sp(h[0].mudancas.find((m) => m.campo === campo)!.depois);
    // Antes da nota: 6,5164 → margem 21,3836 (76,6%); depois: 7,1164 → 20,7836 (74,5%).
    const par = [de('custo da loja na hora'), de('margem líquida na loja')];
    expect([
      ['R$ 6,52', 'R$ 21,38 (76,6%)'],
      ['R$ 7,12', 'R$ 20,78 (74,5%)'],
    ]).toContainEqual(par);
  });

  it('incompleto: preço próprio entra; sugerido e margens não viram número; o retrato diz o porquê', async () => {
    const t = await tela(a, ids.baconBurger);
    expect(t.precos[0]).toMatchObject({ sugerido: { tipo: 'incompleto' }, margens: null, porQue: 'falta preço em “Bacon”' });
    expect(await salvarPrecos(a, ids.baconBurger, { impressao: t.impressaoDosPrecos, custos: t.impressaoDosCustos, precos: { LOJA: '32,90' } }, 'Marina')).toMatchObject({ ok: true });
    const d = await tela(a, ids.baconBurger);
    expect(d.precos[0]).toMatchObject({ preco: { centavos: 3290, origem: 'proprio' }, margens: null });
    const h = await listarHistorico(a, { de: [{ entidade: 'FichaTecnica', ids: [ids.baconBurger] }], limite: 1 });
    // A margem era e continua "incompleta": não é mudança; o custo na hora sempre vai.
    expect(h[0].mudancas.map((m) => sp(m.depois))).toEqual(['R$ 32,90', 'incompleto (R$ 1,50 sem “Bacon”)']);
    // Pré-preparo não se vende.
    const molho = await cadastrarFicha(
      a,
      { nome: 'Molho', tipo: 'PRE_PREPARO', rendimento: '1', rendimentoUnidade: 'kg', itens: [{ insumoId: ids.cheddar, quantidade: '100', unidade: 'g' }] },
      { tipo: 'manter' },
      'Marina',
    );
    if (!molho.ok) throw new Error('molho');
    expect(await salvarPrecos(a, molho.id, { impressao: 'LOJA:-|DELIVERY_PROPRIO:-|IFOOD:-', custos: '', precos: { LOJA: '10,00' } }, 'Marina')).toMatchObject({
      ok: false,
      erros: { geral: expect.stringMatching(/Pré-preparo/) },
    });
  });

  it('isolamento: B não lê nem grava preço de A; margens e taxa de A não valem em B; FK recusa preço de B no produto de A', async () => {
    expect(await obterFicha(b, ids.burger)).toBeNull();
    expect(await salvarPrecos(b, ids.burger, { impressao: 'LOJA:-|DELIVERY_PROPRIO:-|IFOOD:-', custos: '', precos: { LOJA: '1,00' } }, 'Bia')).toMatchObject({
      ok: false,
      naoEncontrado: true,
    });
    const tb = await tela(b, ids.burgerB);
    expect(tb.precos.map((p) => p.sugerido.tipo)).toEqual(['semAlvo', 'semAlvo', 'incompleto']);
    expect(tb.precos[2].porQue).toBe('taxa do iFood não configurada');
    expect((await obterTaxaDoIfood(b)).margens).toEqual({ LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null });
    expect(await b.produtoCanal.count()).toBe(0);
    const produtoA = (await a.produtoVenda.findFirst({ where: { fichaId: ids.burger } }))!.id;
    await expect(b.produtoCanal.create({ data: { parceiroId: B.id, produtoId: produtoA, canal: 'LOJA', precoManualCentavos: 100 } })).rejects.toThrow();
  });

  it('lista de fichas: preço e margem de cada canal em lote (prato) — pré-preparo fica de fora', async () => {
    const pagina = await listarFichas(a, {});
    const mapa = await precosDaLista(a, pagina.linhas);
    const burger = mapa.get(ids.burger)!;
    const t = await tela(a, ids.burger);
    expect(burger.map((p) => p.preco)).toEqual(t.precos.map((p) => p.preco));
    expect(burger.map((p) => p.margens && formatarPorcentagem(p.margens.liquidaBp))).toEqual(t.precos.map((p) => p.margens && formatarPorcentagem(p.margens.liquidaBp)));
    expect(mapa.get(ids.baconBurger)![0].margens).toBeNull();
    expect([...mapa.keys()]).not.toContain(pagina.linhas.find((l) => l.tipo === 'PRE_PREPARO')!.id);
  });
});
