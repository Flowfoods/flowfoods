/**
 * ERP · preço pela META DE CMV por canal (puro) — o cenário sintético de referência do plano (Notion,
 * "Complemento aprovado — cenário de referência e resumo por rodada"), linha a linha, e as variações de aceite
 * que cabem na conta pura. Números ILUSTRATIVOS: metas de 25%/30% e taxa de 20% existem só aqui.
 *
 *   npx vitest run tests/erp-cmv-produto.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  cmvDoCanal,
  cmvTeoricoBp,
  contaDoSugeridoPorCmv,
  lerMetasDeCmv,
  parcelasEmTexto,
  ROTULO_DO_RESULTADO,
  sugeridoPorCmv,
} from '@/lib/erp/cmv-produto-campos';
import { custoDaCompra } from '@/lib/erp/compra-campos';
import { custoDaFicha } from '@/lib/erp/ficha-campos';
import type { EmbalagemParaCusto } from '@/lib/erp/canal-campos';
import { precoDoCanal, type EntradaDoCanal } from '@/lib/erp/preco-campos';
import { compararFracoes, custoPorUnidade, formatarFracao, lerQuantidadeNa, type Fracao } from '@/lib/erp/unidades';

const sp = (t: string) => t.replace(/\s/g, ' ');
const igual = (a: Fracao | null | undefined, num: bigint, den: bigint) => expect(a && compararFracoes(a, { num, den })).toBe(0);
const reais = (f: Fracao) => sp(formatarFracao(f));

/** Embalagem de teste: 1 un custando `centavos`, 1 un usada por porção. */
const embalagem = (nome: string, centavos: number | null): EmbalagemParaCusto => ({
  insumoId: `emb-${nome}`,
  nome,
  unidade: 'UN',
  quantidadeMilesimos: 1000,
  insumo: { precoEmbalagemCentavos: centavos ?? 0, taxaEntregaCentavos: 0, conteudoMilesimos: 1000, ultimaCompra: null },
});

// --- linha 1 e 2 do cenário: compra → custo por kg → ficha → custo por porção
const compra = custoDaCompra([{ valorCentavos: 10_000, freteRateadoCentavos: 1_000, quantidadeMilesimos: 5_000 }])!;
const ficha = (quantidadeMilesimos: number, rendimentoMilesimos: number) =>
  custoDaFicha([{ nome: 'Insumo de teste', quantidadeMilesimos, fatorCorrecaoMilesimos: 1000, custo: compra }], rendimentoMilesimos);

const entrada = (canal: EntradaDoCanal['canal'], porcao: ReturnType<typeof ficha>, embalagens: EmbalagemParaCusto[] = [], taxa: EntradaDoCanal['taxa'] = null): EntradaDoCanal => ({
  canal,
  custoDaFicha: porcao,
  embalagens,
  taxa,
});

const TAXA_20 = { comissaoBp: 2000, pagamentoBp: 0 };

describe('cenário de referência: compra e ficha', () => {
  it('5 kg por R$ 100,00 + R$ 10,00 de frete = R$ 22,00/kg (o preço da embalagem não é o custo de 1 kg)', () => {
    igual(custoPorUnidade(compra), 2200n, 1n);
  });

  it('1 kg, fator 1, rendimento 10 porções = R$ 22,00 a receita e R$ 2,20 a porção; 1.000 g dá o mesmo', () => {
    const f = ficha(1000, 10_000);
    igual(f.total, 2200n, 1n);
    igual(f.porRendimento, 220n, 1n);
    // "1" kg e "1000" g, lidos pelo mesmo leitor da ficha, viram a mesma quantidade na unidade base.
    const kg = lerQuantidadeNa('1', 'KG', 'base')!;
    const g = lerQuantidadeNa('1000', 'KG', 'menor')!;
    expect(kg).toBe(g);
    expect(compararFracoes(ficha(g, 10_000).porRendimento, f.porRendimento)).toBe(0);
  });
});

describe('cenário de referência: os três canais pela meta de CMV', () => {
  const porcao = ficha(1000, 10_000);

  it('Loja: físico R$ 2,20, meta 25% → sugere R$ 8,80; preço R$ 11,00 → CMV 20%, dentro; resultado R$ 8,80 (80%)', () => {
    const r = cmvDoCanal(entrada('LOJA', porcao), { metaBp: 2500, precoCentavos: 1100 });
    igual(r.fisico.valor, 220n, 1n);
    expect(r.sugerido).toMatchObject({ tipo: 'ok', centavos: 880 });
    if (r.sugerido.tipo === 'ok') expect(sp(contaDoSugeridoPorCmv(r.fisico.valor, 2500, r.sugerido))).toBe('R$ 2,20 ÷ 25% = R$ 8,80');
    igual(r.cmvBp, 2000n, 1n);
    expect(r.status).toBe('dentro');
    expect(r.motivo).toBeNull();
    expect(r.resultado.tipo).toBe('ok');
    if (r.resultado.tipo === 'ok') {
      expect(reais(r.resultado.valor)).toBe('R$ 8,80');
      igual(r.resultado.bp, 8000n, 1n);
      expect(r.resultado.parcelas).toEqual(['ingredientes']);
    }
    // O preço definido é preservado: a sugestão não o sobrescreve.
    expect(r.precoCentavos).toBe(1100);
  });

  it('Delivery próprio: embalagem R$ 0,30, físico R$ 2,50, meta 25% → R$ 10,00; preço R$ 12,50 → 20%; resultado R$ 10,00 (80%)', () => {
    const r = cmvDoCanal(entrada('DELIVERY_PROPRIO', porcao, [embalagem('Caixa', 30)]), { metaBp: 2500, precoCentavos: 1250 });
    igual(r.fisico.valor, 250n, 1n);
    igual(r.fisico.embalagens, 30n, 1n);
    expect(r.sugerido).toMatchObject({ tipo: 'ok', centavos: 1000 });
    igual(r.cmvBp, 2000n, 1n);
    expect(r.status).toBe('dentro');
    if (r.resultado.tipo !== 'ok') throw new Error('resultado deveria fechar');
    expect(reais(r.resultado.valor)).toBe('R$ 10,00');
    igual(r.resultado.bp, 8000n, 1n);
    expect(parcelasEmTexto('DELIVERY_PROPRIO', r.resultado.parcelas)).toBe('ingredientes e embalagens');
  });

  it('iFood: embalagem R$ 0,80, físico R$ 3,00, meta 30% → R$ 10,00 (a taxa NÃO entra); preço R$ 15,00 → 20%; taxa R$ 3,00; resultado R$ 9,00 (60%)', () => {
    const r = cmvDoCanal(entrada('IFOOD', porcao, [embalagem('Sacola', 80)], TAXA_20), { metaBp: 3000, precoCentavos: 1500 });
    igual(r.fisico.valor, 300n, 1n);
    expect(r.sugerido).toMatchObject({ tipo: 'ok', centavos: 1000 });
    igual(r.cmvBp, 2000n, 1n);
    expect(r.status).toBe('dentro');
    if (r.resultado.tipo !== 'ok') throw new Error('resultado deveria fechar');
    expect(reais(r.resultado.taxa)).toBe('R$ 3,00');
    expect(reais(r.resultado.valor)).toBe('R$ 9,00');
    igual(r.resultado.bp, 6000n, 1n);
    expect(parcelasEmTexto('IFOOD', r.resultado.parcelas)).toBe('ingredientes, embalagens e taxa do iFood');
  });

  it('a taxa hipotética não altera a sugestão por CMV (com e sem taxa, o mesmo sugerido)', () => {
    const com = cmvDoCanal(entrada('IFOOD', porcao, [embalagem('Sacola', 80)], TAXA_20), { metaBp: 3000, precoCentavos: 1500 });
    const sem = cmvDoCanal(entrada('IFOOD', porcao, [embalagem('Sacola', 80)], { comissaoBp: 0, pagamentoBp: 0 }), { metaBp: 3000, precoCentavos: 1500 });
    expect(com.sugerido).toEqual(sem.sugerido);
    expect(com.cmvBp).toEqual(sem.cmvBp);
  });

  it('o rótulo do resultado nunca é "lucro líquido"', () => {
    expect(ROTULO_DO_RESULTADO.toLowerCase()).not.toContain('lucro');
  });
});

describe('variações de aceite (ponto 2: sem dados nunca vira zero nem farol positivo)', () => {
  const porcao = ficha(1000, 10_000);

  it('sem meta: sem sugestão e "sem dados" com o motivo; o CMV ao preço ainda aparece', () => {
    const r = cmvDoCanal(entrada('LOJA', porcao), { metaBp: null, precoCentavos: 1100 });
    expect(r.sugerido).toEqual({ tipo: 'semMeta' });
    expect(r.status).toBe('semDados');
    expect(r.motivo).toBe('sem meta de CMV para o canal');
    igual(r.cmvBp, 2000n, 1n);
  });

  it('custo incompleto: sem sugestão, sem CMV, sem resultado; o motivo nomeia o que falta; o parcial fica identificado', () => {
    const r = cmvDoCanal(entrada('DELIVERY_PROPRIO', porcao, [embalagem('Caixa', null)]), { metaBp: 2500, precoCentavos: 1250 });
    expect(r.fisico.completo).toBe(false);
    igual(r.fisico.valor, 220n, 1n); // a parte conhecida, nunca apresentada como total
    expect(r.sugerido).toEqual({ tipo: 'incompleto', falta: ['Caixa'] });
    expect(r.cmvBp).toBeNull();
    expect(r.status).toBe('semDados');
    expect(r.motivo).toBe('falta preço em “Caixa”');
    expect(r.resultado).toEqual({ tipo: 'pendente', motivo: 'falta preço em “Caixa”' });
  });

  it('sem preço definido: a sugestão aparece, mas não vira preço praticado; CMV e resultado ficam sem dados', () => {
    const r = cmvDoCanal(entrada('LOJA', porcao), { metaBp: 2500, precoCentavos: null });
    expect(r.sugerido).toMatchObject({ tipo: 'ok', centavos: 880 });
    expect(r.cmvBp).toBeNull();
    expect(r.status).toBe('semDados');
    expect(r.motivo).toBe('preço de venda não definido');
    expect(r.resultado).toEqual({ tipo: 'pendente', motivo: 'preço de venda não definido' });
  });

  it('taxa do iFood não configurada: CMV, farol e sugestão continuam; só o resultado fica pendente', () => {
    const r = cmvDoCanal(entrada('IFOOD', porcao, [embalagem('Sacola', 80)], 'naoConfigurada'), { metaBp: 3000, precoCentavos: 1500 });
    expect(r.sugerido).toMatchObject({ tipo: 'ok', centavos: 1000 });
    igual(r.cmvBp, 2000n, 1n);
    expect(r.status).toBe('dentro');
    expect(r.resultado).toEqual({ tipo: 'pendente', motivo: 'taxa do iFood não configurada' });
  });

  it('canal não ofertado é diferente de dado ausente', () => {
    const r = cmvDoCanal(entrada('IFOOD', porcao, [], TAXA_20), { metaBp: null, precoCentavos: null, ofertado: false });
    expect(r.status).toBe('naoOfertado');
    expect(r.motivo).toBeNull();
  });

  it('acima da meta: preço baixo demais para a meta', () => {
    const r = cmvDoCanal(entrada('LOJA', porcao), { metaBp: 2500, precoCentavos: 800 });
    igual(r.cmvBp, 2750n, 1n);
    expect(r.status).toBe('acima');
  });

  it('exatamente na meta conta como dentro', () => {
    expect(cmvDoCanal(entrada('LOJA', porcao), { metaBp: 2500, precoCentavos: 880 }).status).toBe('dentro');
  });

  it('resultado negativo é marcado (o alerta objetivo continua, sem virar farol principal)', () => {
    const r = cmvDoCanal(entrada('IFOOD', porcao, [embalagem('Sacola', 80)], TAXA_20), { metaBp: 3000, precoCentavos: 350 });
    expect(r.status).toBe('acima');
    if (r.resultado.tipo !== 'ok') throw new Error('resultado deveria fechar');
    expect(r.resultado.negativo).toBe(true);
  });

  it('rendimento 10 → 20 com a mesma composição: receita segue R$ 22,00, porção R$ 1,10; preço definido não muda', () => {
    const vinte = ficha(1000, 20_000);
    igual(vinte.total, 2200n, 1n);
    igual(vinte.porRendimento, 110n, 1n);
    const r = cmvDoCanal(entrada('LOJA', vinte), { metaBp: 2500, precoCentavos: 1100 });
    expect(r.precoCentavos).toBe(1100);
    igual(r.cmvBp, 1000n, 1n);
    // A embalagem por porção continua a quantidade informada (1 un), independente do rendimento.
    const d = cmvDoCanal(entrada('DELIVERY_PROPRIO', vinte, [embalagem('Caixa', 30)]), { metaBp: 2500, precoCentavos: 1250 });
    igual(d.fisico.embalagens, 30n, 1n);
    igual(d.fisico.valor, 140n, 1n);
  });

  it('a sugestão arredonda PARA CIMA ao centavo', () => {
    const r = sugeridoPorCmv({ fisico: { valor: { num: 100n, den: 1n }, embalagens: { num: 0n, den: 1n }, completo: true, falta: [] }, metaBp: 3000 });
    expect(r).toMatchObject({ tipo: 'ok', centavos: 334 }); // 333,33… → 334
  });

  it('custo físico zero não sugere R$ 0,00 nem dá farol verde', () => {
    const zero = custoDaFicha([], 10_000);
    const r = cmvDoCanal(entrada('LOJA', zero), { metaBp: 2500, precoCentavos: 1000 });
    expect(r.sugerido).toEqual({ tipo: 'semCusto' });
    expect(r.status).toBe('semDados');
  });

  it('a conta do CMV recusa preço zero (nunca divide por zero)', () => {
    expect(() => cmvTeoricoBp({ num: 1n, den: 1n }, 0)).toThrow(RangeError);
  });

  it('meta fora do domínio é recusada pela conta', () => {
    expect(() => sugeridoPorCmv({ fisico: { valor: { num: 1n, den: 1n }, embalagens: { num: 0n, den: 1n }, completo: true, falta: [] }, metaBp: 10_000 })).toThrow(RangeError);
  });
});

describe('leitura da meta de CMV', () => {
  it('vazio = sem meta; aceita até 2 casas; recusa 0%, 100% e texto', () => {
    expect(lerMetasDeCmv({ LOJA: '25', DELIVERY_PROPRIO: '27,5', IFOOD: '' })).toEqual({ ok: true, dados: { LOJA: 2500, DELIVERY_PROPRIO: 2750, IFOOD: null } });
    const r = lerMetasDeCmv({ LOJA: '0', DELIVERY_PROPRIO: '100', IFOOD: 'trinta' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros['metaCmv-LOJA']).toMatch(/maior que 0%/);
      expect(r.erros['metaCmv-DELIVERY_PROPRIO']).toMatch(/abaixo de 100%/);
      expect(r.erros['metaCmv-IFOOD']).toMatch(/inválida/);
    }
  });

  it('a meta do iFood não depende da taxa estar configurada (a taxa não entra no CMV)', () => {
    expect(lerMetasDeCmv({ IFOOD: '30' })).toEqual({ ok: true, dados: { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: 3000 } });
  });
});

describe('a conta antiga por margem-alvo segue intacta (nenhuma margem é convertida em meta)', () => {
  it('precoDoCanal com margem-alvo continua dando o mesmo número de antes', () => {
    const porcao = ficha(1000, 10_000);
    const r = precoDoCanal(entrada('LOJA', porcao), { margemAlvoBp: 7500, precoProprioCentavos: null });
    // R$ 2,20 ÷ (1 − 75%) = R$ 8,80: só coincide com a meta de 25% porque a loja não tem taxa.
    expect(r.sugerido).toMatchObject({ tipo: 'ok', centavos: 880 });
  });
});
