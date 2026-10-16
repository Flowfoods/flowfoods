/**
 * ERP 1.10 · preço e margem por canal (puro): preço sugerido = custo sem a
 * taxa ÷ (1 − taxa − margem-alvo), exato e arredondado PARA CIMA ao centavo;
 * "de cardápio" (próxima ,90); margem bruta (preço − insumos − embalagens) e
 * líquida (− a taxa do canal) em R$ e %; farol simples; incompleto nunca vira
 * número; leitura dos preços e das margens-alvo; retrato para o histórico;
 * a prévia do navegador usa a MESMA conta (ida e volta da serialização).
 *
 *   npx vitest run tests/erp-precos.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  contaDoSugerido,
  entradaDaTela,
  entradaParaTela,
  formatarPorcentagem,
  formatarReaisComSinal,
  impressaoDosCustos,
  impressaoDosPrecos,
  lerMargensAlvo,
  lerPrecos,
  margensDoPreco,
  precoDeCardapio,
  precoDoCanal,
  precoSugerido,
  retratoDosPrecos,
  type EntradaDoCanal,
} from '@/lib/erp/preco-campos';
import type { EmbalagemParaCusto } from '@/lib/erp/canal-campos';
import { compararFracoes, type Fracao } from '@/lib/erp/unidades';

const sp = (t: string) => t.replace(/\s/g, ' ');
const igual = (a: Fracao | null | undefined, num: bigint, den: bigint) => expect(a && compararFracoes(a, { num, den })).toBe(0);
const c = (centavos: number): Fracao => ({ num: BigInt(centavos), den: 1n });
const IFOOD = { comissaoBp: 2300, pagamentoBp: 320 };

/** Canal com a porção da ficha em `custo` centavos (sem embalagem). */
const entrada = (canal: EntradaDoCanal['canal'], custo: number, taxa: EntradaDoCanal['taxa'] = null, faltaPreco: string[] = []): EntradaDoCanal => ({
  canal,
  custoDaFicha: { porRendimento: c(custo), faltaPreco },
  embalagens: [],
  taxa,
});

describe('preço sugerido = custo sem a taxa ÷ (1 − taxa − margem-alvo)', () => {
  it('sem taxa (loja): R$ 8,45 ÷ (1 − 70%) = R$ 28,1666… → R$ 28,17 (para cima); de cardápio R$ 28,90', () => {
    const s = precoSugerido({ semTaxa: c(845), taxaBp: 0, margemAlvoBp: 7000, incompleto: false });
    expect(s.tipo).toBe('ok');
    if (s.tipo !== 'ok') return;
    igual(s.exato, 84_500n, 30n);
    expect(s.centavos).toBe(2817);
    expect(s.cardapio).toBe(2890);
    expect(sp(contaDoSugerido(c(845), 0, 7000, s))).toBe('R$ 8,45 ÷ (1 − 70%) = R$ 28,17');
  });

  it('com a taxa do iFood: R$ 10,18 ÷ (1 − 26,2% − 60%) = R$ 73,768… → R$ 73,77', () => {
    const s = precoSugerido({ semTaxa: c(1018), taxaBp: 2620, margemAlvoBp: 6000, incompleto: false });
    if (s.tipo !== 'ok') throw new Error(s.tipo);
    igual(s.exato, 10_180_000n, 1380n);
    expect(s.centavos).toBe(7377);
    expect(s.cardapio).toBe(7390);
    expect(sp(contaDoSugerido(c(1018), 2620, 6000, s))).toBe('R$ 10,18 ÷ (1 − 26,2% − 60%) = R$ 73,77');
  });

  it('o sugerido atinge o alvo e um centavo a menos não', () => {
    for (const [custo, t, m] of [
      [845, 0, 7000],
      [1018, 2620, 6000],
      [491, 2620, 3333],
      [1, 0, 9999],
    ]) {
      const s = precoSugerido({ semTaxa: c(custo), taxaBp: t, margemAlvoBp: m, incompleto: false });
      if (s.tipo !== 'ok') throw new Error(s.tipo);
      const no = margensDoPreco({ semTaxa: c(custo), taxaBp: t, precoCentavos: s.centavos, margemAlvoBp: m });
      const abaixo = margensDoPreco({ semTaxa: c(custo), taxaBp: t, precoCentavos: s.centavos - 1, margemAlvoBp: m });
      expect(no.farol).toBe('noAlvo');
      expect(abaixo.farol).not.toBe('noAlvo');
    }
  });

  it('conta exata não sobe um centavo: R$ 9,00 ÷ (1 − 70%) = R$ 30,00; cardápio de R$ 27,90 é ele mesmo', () => {
    const s = precoSugerido({ semTaxa: c(900), taxaBp: 0, margemAlvoBp: 7000, incompleto: false });
    expect(s).toMatchObject({ tipo: 'ok', centavos: 3000, cardapio: 3090 });
    expect(precoDeCardapio(2790)).toBe(2790);
    expect(precoDeCardapio(2791)).toBe(2890);
    expect(precoDeCardapio(2899)).toBe(2990);
    expect(precoDeCardapio(1)).toBe(90);
  });

  it('limites: alvo 0% = preço de empate (com a taxa: R$ 9,00 ÷ 0,738 = R$ 12,20); taxa + alvo ≥ 100% é inviável', () => {
    expect(precoSugerido({ semTaxa: c(900), taxaBp: 0, margemAlvoBp: 0, incompleto: false })).toMatchObject({ tipo: 'ok', centavos: 900 });
    expect(precoSugerido({ semTaxa: c(900), taxaBp: 2620, margemAlvoBp: 0, incompleto: false })).toMatchObject({ tipo: 'ok', centavos: 1220 });
    expect(precoSugerido({ semTaxa: c(900), taxaBp: 2620, margemAlvoBp: 7380, incompleto: false })).toEqual({ tipo: 'inviavel', somaBp: 10_000 });
    expect(precoSugerido({ semTaxa: c(900), taxaBp: 0, margemAlvoBp: 10_000, incompleto: false })).toEqual({ tipo: 'inviavel', somaBp: 10_000 });
    expect(precoSugerido({ semTaxa: c(900), taxaBp: 2620, margemAlvoBp: 7379, incompleto: false })).toMatchObject({ tipo: 'ok', centavos: 9_000_000 });
  });

  it('sem alvo, não há sugerido; custo incompleto nunca vira número', () => {
    expect(precoSugerido({ semTaxa: c(900), taxaBp: 0, margemAlvoBp: null, incompleto: false })).toEqual({ tipo: 'semAlvo' });
    expect(precoSugerido({ semTaxa: c(900), taxaBp: 0, margemAlvoBp: 7000, incompleto: true })).toEqual({ tipo: 'incompleto' });
    expect(precoSugerido({ semTaxa: { num: 10n ** 30n, den: 1n }, taxaBp: 0, margemAlvoBp: 5000, incompleto: false })).toEqual({ tipo: 'acimaDoLimite' });
  });
});

describe('margem bruta e líquida', () => {
  it('loja a R$ 29,90 com custo R$ 8,45: bruta = líquida = R$ 21,45 (71,7%), no alvo de 70%', () => {
    const m = margensDoPreco({ semTaxa: c(845), taxaBp: 0, precoCentavos: 2990, margemAlvoBp: 7000 });
    igual(m.bruta, 2145n, 1n);
    igual(m.liquida, 2145n, 1n);
    igual(m.taxa, 0n, 1n);
    expect(sp(formatarReaisComSinal(m.liquida))).toBe('R$ 21,45');
    expect(formatarPorcentagem(m.liquidaBp)).toBe('71,7%');
    expect(m.farol).toBe('noAlvo');
  });

  it('iFood a R$ 29,90 com custo R$ 10,18 e taxa 26,2%: taxa R$ 7,83; bruta R$ 19,72 (66,0%); líquida R$ 11,89 (39,8%), abaixo do alvo de 60%', () => {
    const m = margensDoPreco({ semTaxa: c(1018), taxaBp: 2620, precoCentavos: 2990, margemAlvoBp: 6000 });
    igual(m.taxa, 783_380n, 1000n);
    igual(m.bruta, 1972n, 1n);
    igual(m.liquida, 118_862n, 100n);
    expect(formatarPorcentagem(m.brutaBp)).toBe('66,0%');
    expect(sp(formatarReaisComSinal(m.liquida))).toBe('R$ 11,89');
    expect(formatarPorcentagem(m.liquidaBp)).toBe('39,8%');
    expect(m.farol).toBe('abaixo');
  });

  it('preço abaixo do custo: prejuízo, com o sinal; sem alvo, o farol não diz nada além do prejuízo', () => {
    const m = margensDoPreco({ semTaxa: c(1018), taxaBp: 2620, precoCentavos: 1000, margemAlvoBp: null });
    expect(sp(formatarReaisComSinal(m.bruta))).toBe('−R$ 0,18');
    expect(sp(formatarReaisComSinal(m.liquida))).toBe('−R$ 2,80');
    expect(formatarPorcentagem(m.liquidaBp)).toBe('−28,0%');
    expect(m.farol).toBe('prejuizo');
    expect(margensDoPreco({ semTaxa: c(845), taxaBp: 0, precoCentavos: 2990, margemAlvoBp: null }).farol).toBeNull();
  });
});

describe('preço do canal (a mesma conta no servidor e na prévia)', () => {
  it('sem preço próprio, vale o sugerido (e a margem fica no alvo); com preço próprio, ele sobrescreve', () => {
    const e = entrada('IFOOD', 1018, IFOOD);
    const s = precoDoCanal(e, { margemAlvoBp: 6000, precoProprioCentavos: null });
    expect(s.preco).toEqual({ centavos: 7377, origem: 'sugerido' });
    expect(s.margens?.farol).toBe('noAlvo');
    igual(s.camadas.total, 7_377n * 2620n + 1018n * 10_000n, 10_000n);
    const p = precoDoCanal(e, { margemAlvoBp: 6000, precoProprioCentavos: 2990 });
    expect(p.preco).toEqual({ centavos: 2990, origem: 'proprio' });
    expect(p.sugerido).toMatchObject({ tipo: 'ok', centavos: 7377 });
    expect(formatarPorcentagem(p.margens!.liquidaBp)).toBe('39,8%');
    expect(p.camadas.taxa).toMatchObject({ tipo: 'sobrePreco', totalBp: 2620 });
  });

  it('incompleto: sugerido e margens não viram número, o preço próprio fica e o porquê aparece', () => {
    const e = entrada('LOJA', 845, null, ['Cheddar']);
    const p = precoDoCanal(e, { margemAlvoBp: 7000, precoProprioCentavos: 2990 });
    expect(p.sugerido).toEqual({ tipo: 'incompleto' });
    expect(p.margens).toBeNull();
    expect(p.preco).toEqual({ centavos: 2990, origem: 'proprio' });
    expect(p.porQue).toBe('falta preço em “Cheddar”');
    const sem = precoDoCanal(entrada('IFOOD', 1018, 'naoConfigurada'), { margemAlvoBp: null, precoProprioCentavos: null });
    expect(sem).toMatchObject({ sugerido: { tipo: 'incompleto' }, preco: null, margens: null, porQue: 'taxa do iFood não configurada' });
  });

  it('sem alvo e sem preço próprio: nada de preço; com embalagem, o custo do canal soma as camadas da 1.9', () => {
    const caixa: EmbalagemParaCusto = {
      insumoId: 'cx',
      nome: 'Caixa kraft',
      unidade: 'UN',
      quantidadeMilesimos: 1000,
      insumo: { precoEmbalagemCentavos: 8900, taxaEntregaCentavos: 0, conteudoMilesimos: 100_000, ultimaCompra: null },
    };
    const e: EntradaDoCanal = { ...entrada('DELIVERY_PROPRIO', 845), embalagens: [caixa] };
    expect(precoDoCanal(e, { margemAlvoBp: null, precoProprioCentavos: null })).toMatchObject({ sugerido: { tipo: 'semAlvo' }, preco: null, margens: null });
    const p = precoDoCanal(e, { margemAlvoBp: 6500, precoProprioCentavos: null });
    // (8,45 + 0,89) ÷ 0,35 = 26,6857… → R$ 26,69
    expect(p.sugerido).toMatchObject({ tipo: 'ok', centavos: 2669, cardapio: 2690 });
  });

  it('a entrada atravessa para o navegador (BigInt em texto) e volta igual: a prévia dá o mesmo número', () => {
    const e = entrada('IFOOD', 1018, IFOOD);
    const volta = entradaDaTela(JSON.parse(JSON.stringify(entradaParaTela(e))));
    const a = precoDoCanal(e, { margemAlvoBp: 6000, precoProprioCentavos: 2990 });
    const b = precoDoCanal(volta, { margemAlvoBp: 6000, precoProprioCentavos: 2990 });
    igual(b.margens!.liquida, a.margens!.liquida.num, a.margens!.liquida.den);
    expect(b.sugerido).toEqual(a.sugerido);
  });
});

describe('leitura do formulário', () => {
  it('preços: texto em centavos; vazio = usar o sugerido; zero, letra e acima de R$ 100.000,00 recusados', () => {
    expect(lerPrecos({ LOJA: '29,90', DELIVERY_PROPRIO: '', IFOOD: 'R$ 32,90' })).toEqual({
      ok: true,
      dados: { LOJA: 2990, DELIVERY_PROPRIO: null, IFOOD: 3290 },
    });
    const r = lerPrecos({ LOJA: '0', DELIVERY_PROPRIO: 'trinta', IFOOD: '100.000,01' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.erros).sort()).toEqual(['preco-DELIVERY_PROPRIO', 'preco-IFOOD', 'preco-LOJA']);
    expect(lerPrecos({ LOJA: '100.000,00' })).toMatchObject({ ok: true, dados: { LOJA: 10_000_000, DELIVERY_PROPRIO: null, IFOOD: null } });
  });

  it('margens-alvo: %, vazio = sem alvo; 100% recusado; iFood só com a taxa configurada e taxa + alvo abaixo de 100%', () => {
    expect(lerMargensAlvo({ LOJA: '70', DELIVERY_PROPRIO: '65', IFOOD: '60' }, 2620)).toEqual({
      ok: true,
      dados: { LOJA: 7000, DELIVERY_PROPRIO: 6500, IFOOD: 6000 },
    });
    expect(lerMargensAlvo({ LOJA: '', DELIVERY_PROPRIO: '0', IFOOD: '' }, null)).toEqual({ ok: true, dados: { LOJA: null, DELIVERY_PROPRIO: 0, IFOOD: null } });
    const r = lerMargensAlvo({ LOJA: '100', DELIVERY_PROPRIO: 'x', IFOOD: '74' }, 2620);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros['margem-LOJA']).toMatch(/abaixo de 100%/);
    expect(r.erros['margem-DELIVERY_PROPRIO']).toMatch(/inválida/);
    expect(r.erros['margem-IFOOD']).toMatch(/26,2%.*74%.*100,2%/);
    expect(lerMargensAlvo({ IFOOD: '60' }, null)).toMatchObject({ ok: false, erros: { 'margem-IFOOD': expect.stringMatching(/taxa do iFood/) } });
  });
});

describe('impressões e retrato para o histórico', () => {
  it('impressão dos preços (o que a tela leu) e dos custos (para avisar que o custo mudou)', () => {
    expect(impressaoDosPrecos([{ canal: 'IFOOD', precoManualCentavos: 2990 }, { canal: 'LOJA', precoManualCentavos: null }])).toBe('LOJA:-|DELIVERY_PROPRIO:-|IFOOD:2990');
    const a = impressaoDosCustos([entrada('LOJA', 845), entrada('IFOOD', 1018, IFOOD)]);
    expect(a).toBe(impressaoDosCustos([entrada('LOJA', 845), entrada('IFOOD', 1018, IFOOD)]));
    expect(a).not.toBe(impressaoDosCustos([entrada('LOJA', 846), entrada('IFOOD', 1018, IFOOD)]));
    expect(a).not.toBe(impressaoDosCustos([entrada('LOJA', 845), entrada('IFOOD', 1018, { comissaoBp: 1200, pagamentoBp: 0 })]));
  });

  it('retrato por canal: preço (próprio ou sugerido), margem líquida e o custo na hora', () => {
    const e = entrada('IFOOD', 1018, IFOOD);
    const antes = retratoDosPrecos([precoDoCanal(e, { margemAlvoBp: 6000, precoProprioCentavos: null })]);
    const depois = retratoDosPrecos([precoDoCanal(e, { margemAlvoBp: 6000, precoProprioCentavos: 2990 })]);
    expect(Object.fromEntries(Object.entries(antes).map(([k, v]) => [k, sp(v)]))).toEqual({
      precoIfood: 'sugerido (R$ 73,77)',
      margemIfood: 'R$ 44,26 (60,0%)',
      custoIfood: 'R$ 29,51',
    });
    expect(Object.fromEntries(Object.entries(depois).map(([k, v]) => [k, sp(v)]))).toEqual({
      precoIfood: 'R$ 29,90',
      margemIfood: 'R$ 11,89 (39,8%)',
      custoIfood: 'R$ 18,01',
    });
    const inc = retratoDosPrecos([precoDoCanal(entrada('LOJA', 845, null, ['Cheddar']), { margemAlvoBp: 7000, precoProprioCentavos: null })]);
    expect(Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, sp(v)]))).toEqual({
      precoLoja: 'sem preço',
      margemLoja: 'incompleta',
      custoLoja: 'incompleto (R$ 8,45 sem “Cheddar”)',
    });
  });
});
