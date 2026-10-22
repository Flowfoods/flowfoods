/**
 * ERP I.2b · CMV real por categoria, compra × real, matriz, evolução e o desvio relativo — a CONTA pura (sem banco).
 *
 * A propriedade central: para qualquer combinação de lojas (umas com o real aberto por categoria, outras só pelas compras), de usos,
 * de receitas e de montantes, a soma de tudo o que o painel mostra (categorias, sem categoria, pré-preparos e variação do estoque)
 * é o CMV do DRE, ao centavo; a diferença de compra × real tem o sinal do pp; e a coluna de cada loja da matriz fecha no CMV dela.
 */
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATEGORIAS_PADRAO } from '@/lib/erp/categoria-campos';
import {
  categoriasLidasDaFotografia,
  categoriasParaGravar,
  CHAVE_DOS_PREPARADOS,
  dinheiroComSinal,
  metasDoModelo32,
  montarEvolucao,
  montarPainelDeCategorias,
  pontosComSinalDaDiferenca,
  realDoMontante,
  textoDoDesvioRelativo,
  type CategoriaDoPainel,
  type EntradaDoPainel,
  type LojaNoPainel,
  type MontantesDoEstoque,
  type RealDaLoja,
} from '@/lib/erp/cmv-categorias-campos';
import { FAIXAS_DO_FAROL } from '@/lib/erp/farol-campos';
import { orcamentoDaLoja, orcamentoDoEscopo, type LojaDoOrcamento } from '@/lib/erp/orcamento-campos';

const sp = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ');
const R = (reais: number) => Math.round(reais * 100);

const CATEGORIAS: CategoriaDoPainel[] = CATEGORIAS_PADRAO.map((c) => ({ id: `c-${c.chave}`, chave: c.chave, nome: c.nome, ordem: c.ordem, ativa: true, sistema: c.chave === 'OUTROS' }));
const id = (chave: string) => `c-${chave}`;
const M = (inicial: number, entradas: number, final: number): MontantesDoEstoque => ({ inicial: R(inicial), entradas: R(entradas), final: R(final) });

/** A VP do cenário da I.2b (setembro): real R$ 12.050,00 aberto por categoria. */
const REAL_VP: RealDaLoja = {
  categorias: new Map<string | null, MontantesDoEstoque>([
    [id('PROTEINA'), M(4_000, 8_600, 5_600)],
    [id('LATICINIOS'), M(3_000, 2_000, 2_500)],
    [id('HORTIFRUTI'), M(1_500, 2_600, 1_800)],
    [id('DESCARTAVEIS'), M(1_000, 400, 900)],
    [null, M(0, 200, 150)],
  ]),
  preparos: M(500, 0, 800),
};

function lojaVp(p: Partial<LojaNoPainel> = {}): LojaNoPainel {
  return {
    lojaId: 'vp',
    nome: 'Vila da Penha',
    receitaBrutaCentavos: R(100_000),
    compras: new Map<string | null, number>([[id('PROTEINA'), R(8_600)], [id('LATICINIOS'), R(2_000)], [id('HORTIFRUTI'), R(2_600)], [id('DESCARTAVEIS'), R(400)], [null, R(200)]]),
    real: REAL_VP,
    cmvCentavos: R(12_050),
    naoUsa: new Set(),
    metas: metasDoModelo32(CATEGORIAS),
    metaVemDe: 'rede',
    ...p,
  };
}

function entrada(lojas: LojaNoPainel[], p: Partial<EntradaDoPainel> = {}): EntradaDoPainel {
  return {
    categorias: CATEGORIAS,
    lojas,
    totalCentavos: lojas.reduce((s, l) => s + (l.cmvCentavos ?? 0), 0),
    receitaBrutaCentavos: lojas.reduce((s, l) => s + l.receitaBrutaCentavos, 0),
    notaDoCmv: 'real (contagem)',
    semContarDoCmv: [],
    motivoGeral: null,
    faixas: FAIXAS_DO_FAROL,
    encerrado: true,
    ...p,
  };
}

describe('I.2b · o real por categoria no painel', () => {
  it('o real de cada categoria é inicial + entradas − final; a soma, com sem categoria e pré-preparos, é o CMV real (R$ 12.050,00)', () => {
    const p = montarPainelDeCategorias(entrada([lojaVp()]));
    const por = Object.fromEntries(p.linhas.map((l) => [l.categoriaId ?? l.chave, l.realizadoCentavos]));
    expect(por[id('PROTEINA')]).toBe(R(7_000));
    expect(por[id('LATICINIOS')]).toBe(R(2_500));
    expect(por[id('HORTIFRUTI')]).toBe(R(2_300));
    expect(por[id('DESCARTAVEIS')]).toBe(R(500));
    expect(por['sem-categoria']).toBe(R(50));
    expect(por.preparos).toBe(-R(300));
    expect(p.linhas.reduce((s, l) => s + (l.realizadoCentavos ?? 0), 0)).toBe(R(12_050));
    expect(p.variacaoCentavos).toBe(0);
    expect(p.linhas.find((l) => l.tipo === 'variacao')).toBeUndefined();
    expect(p.linhas.find((l) => l.categoriaId === id('PROTEINA'))!.fonte).toBe('real');
  });

  it('sinal: o desvio da Proteína é realizado menos meta (7,00 % contra 11,00 % = −4,00 pp, −R$ 4.000,00), com o mesmo sinal nos dois', () => {
    const l = montarPainelDeCategorias(entrada([lojaVp()])).linhas.find((x) => x.categoriaId === id('PROTEINA'))!;
    expect(l).toMatchObject({ realizadoBp: 700, metaBp: 1100, metaCentavos: R(11_000), desvioBp: -400, desvioCentavos: -R(4_000) });
    expect(l.farol).toMatchObject({ tipo: 'cor', cor: 'AZUL' });
  });

  it('loja que ficou pelas compras: a variação do estoque explica a diferença para o real do DRE, e diz qual loja e por quê', () => {
    const centro: LojaNoPainel = {
      lojaId: 'ce',
      nome: 'Centro',
      receitaBrutaCentavos: R(20_000),
      compras: new Map<string | null, number>([[id('PROTEINA'), R(500)]]),
      cmvCentavos: R(300),
      motivoSemRealPorCategoria: 'o fechamento de estoque é de antes do retrato por insumo',
      naoUsa: new Set(),
      metas: metasDoModelo32(CATEGORIAS),
      metaVemDe: 'rede',
    };
    const p = montarPainelDeCategorias(entrada([lojaVp(), centro]));
    const v = p.linhas.find((l) => l.tipo === 'variacao')!;
    expect(v.realizadoCentavos).toBe(-R(200));
    expect(sp(v.nota)).toContain('Vale para Centro: o fechamento de estoque é de antes do retrato por insumo');
    expect(p.linhas.reduce((s, l) => s + (l.realizadoCentavos ?? 0), 0)).toBe(R(12_350));
    expect(p.linhas.find((l) => l.categoriaId === id('PROTEINA'))!.fonte).toBe('mista');
    expect(p.compraReal!.lojasComparadas).toEqual(['Vila da Penha']);
    expect(p.compraReal!.lojasDeFora).toEqual([{ nome: 'Centro', motivo: 'o fechamento de estoque é de antes do retrato por insumo' }]);
  });

  it('sem nenhuma loja com o real: nada de compra × real e a linha dos pré-preparos fica como na I.2a (sem valor)', () => {
    const p = montarPainelDeCategorias(entrada([lojaVp({ real: null, cmvCentavos: R(13_800) })], { encerrado: false }));
    expect(p.compraReal).toBeNull();
    expect(p.linhas.find((l) => l.tipo === 'preparos')!.realizadoCentavos).toBeNull();
    expect(p.linhas.find((l) => l.categoriaId === id('PROTEINA'))!.realizadoCentavos).toBe(R(8_600));
    expect(p.variacaoCentavos).toBe(0);
  });

  it('compra de insumo pré-preparo vai à linha dos pré-preparos, não à categoria dele (as duas formas de ler fecham no DRE)', () => {
    const compras = new Map<string | null, number>([[id('MERCEARIA'), R(1_000)], [CHAVE_DOS_PREPARADOS, R(300)]]);
    const p = montarPainelDeCategorias(entrada([lojaVp({ real: null, compras, cmvCentavos: R(1_300) })], { encerrado: false }));
    expect(p.linhas.find((l) => l.categoriaId === id('MERCEARIA'))!.realizadoCentavos).toBe(R(1_000));
    expect(p.linhas.find((l) => l.tipo === 'preparos')!.realizadoCentavos).toBe(R(300));
    expect(p.variacaoCentavos).toBe(0);
  });

  it('categoria sem consumo no período com o real aberto diz "sem consumo", não "sem compra"', () => {
    const real: RealDaLoja = { categorias: new Map([[id('PROTEINA'), M(1_000, 0, 1_000)]]), preparos: M(0, 0, 0) };
    const p = montarPainelDeCategorias(entrada([lojaVp({ real, cmvCentavos: 0 })]));
    const l = p.linhas.find((x) => x.categoriaId === id('PROTEINA'))!;
    expect(l.farol).toMatchObject({ tipo: 'sem', motivo: 'sem consumo no período' });
  });
});

describe('I.2b · o painel que não fecha com o DRE não tem cor (veto do Guardião)', () => {
  it('diferença que nenhuma loja explica (em curso, ou encerrado sem loja pelas compras): "Diferença que o painel não explica" e NENHUMA categoria com cor', () => {
    const compras = new Map<string | null, number>([[id('PROTEINA'), R(400)], [CHAVE_DOS_PREPARADOS, R(200)]]);
    // O DRE diz R$ 700,00 e o painel só acha R$ 600,00: R$ 100,00 não explicados.
    const p = montarPainelDeCategorias(entrada([lojaVp({ real: null, compras, cmvCentavos: R(700) })], { encerrado: false }));
    expect(p.linhas.find((l) => l.tipo === 'variacao')).toMatchObject({ nome: 'Diferença que o painel não explica', realizadoCentavos: R(100) });
    expect(sp(p.semCor)).toContain('o painel não fecha com o CMV do DRE (diferença de R$ 100,00');
    expect(p.linhas.filter((l) => l.farol?.tipo === 'cor')).toEqual([]);
    expect(p.maioresDesvios).toEqual([]);
    // Encerrado sem nenhuma loja que explique (nenhuma ficou pelas compras com motivo): também não fecha.
    expect(montarPainelDeCategorias(entrada([lojaVp({ real: null, compras, cmvCentavos: R(700) })], { encerrado: true })).semCor).not.toBeNull();
    // Encerrado COM a loja que ficou pelas compras e diz por quê: é variação do estoque, e as cores valem.
    const explicada = montarPainelDeCategorias(entrada([lojaVp({ real: null, compras, cmvCentavos: R(700), motivoSemRealPorCategoria: 'sem retrato' })], { encerrado: true }));
    expect(explicada.semCor).toBeNull();
    expect(explicada.linhas.some((l) => l.farol?.tipo === 'cor')).toBe(true);
  });

  it('matriz: a linha de variação aparece quando alguma loja tem variação, mesmo que a da rede some zero, e cada coluna fecha no CMV da loja', () => {
    const a: LojaNoPainel = lojaVp({ lojaId: 'a', nome: 'A', real: null, compras: new Map([[id('PROTEINA'), R(1_000)]]), cmvCentavos: R(1_100), motivoSemRealPorCategoria: 'sem retrato' });
    const b: LojaNoPainel = lojaVp({ lojaId: 'b', nome: 'B', real: null, compras: new Map([[id('PROTEINA'), R(1_000)]]), cmvCentavos: R(900), motivoSemRealPorCategoria: 'sem retrato' });
    const p = montarPainelDeCategorias(entrada([a, b]));
    expect(p.variacaoCentavos).toBe(0); // +100 e −100: a rede não tem variação
    expect(p.linhas.find((l) => l.tipo === 'variacao')).toBeUndefined();
    const m = p.matriz!;
    const v = m.linhas.find((l) => l.tipo === 'variacao')!;
    expect(v.celulas.map((c) => c?.centavos)).toEqual([R(100), -R(100)]);
    m.lojas.forEach((l, i) => expect(m.linhas.reduce((s, x) => s + (x.celulas[i]?.centavos ?? 0), 0)).toBe(l.cmvCentavos));
  });
});

describe('I.2b · desvio relativo (percentual da própria meta)', () => {
  it('Limpeza em 0,70 % contra 0,50 %: +0,20 pp é "na meta" pela régua em pontos, e +40,0% da meta pelo relativo — só leitura, a cor não muda', () => {
    const compras = new Map<string | null, number>([[id('LIMPEZA'), R(700)]]);
    const p = montarPainelDeCategorias(entrada([lojaVp({ real: null, compras, cmvCentavos: R(700) })], { encerrado: false }));
    const l = p.linhas.find((x) => x.categoriaId === id('LIMPEZA'))!;
    expect(l).toMatchObject({ desvioBp: 20, desvioCentavos: R(200), desvioRelativoBp: 4000 });
    expect(l.farol).toMatchObject({ tipo: 'cor', cor: 'VERDE' });
    expect(sp(textoDoDesvioRelativo(l.desvioRelativoBp!))).toBe('+40,0% da meta');
    // A ordem dos maiores desvios continua sendo a dos reais (não a do relativo).
    expect(p.maioresDesvios.find((x) => x.categoriaId === id('LIMPEZA'))).toBeUndefined();
  });

  it('o relativo tem o sinal do desvio, e meta zero (Outros) não tem relativo', () => {
    const real: RealDaLoja = { categorias: new Map([[id('LIMPEZA'), M(300, 0, 100)]]), preparos: M(0, 0, 0) };
    const p = montarPainelDeCategorias(entrada([lojaVp({ real, cmvCentavos: R(200) })]));
    const l = p.linhas.find((x) => x.categoriaId === id('LIMPEZA'))!;
    expect(l.desvioCentavos!).toBeLessThan(0);
    expect(l.desvioRelativoBp!).toBeLessThan(0);
    expect(p.linhas.find((x) => x.categoriaId === id('OUTROS'))?.desvioRelativoBp ?? null).toBeNull();
  });
});

describe('I.2b · compra × real por categoria', () => {
  it('Proteína: compra R$ 8.600, real R$ 7.000, diferença −R$ 1.600 (o estoque subiu de 4.000 para 5.600); total −R$ 1.750', () => {
    const c = montarPainelDeCategorias(entrada([lojaVp()])).compraReal!;
    const prot = c.linhas.find((l) => l.nome === 'Proteína')!;
    expect(prot).toMatchObject({ compraCentavos: R(8_600), realCentavos: R(7_000), diferencaCentavos: -R(1_600), diferencaBp: -160 });
    expect(sp(prot.frase)).toBe('o estoque subiu R$ 1.600,00 (de R$ 4.000,00 para R$ 5.600,00)');
    expect(c).toMatchObject({ totalCompraCentavos: R(13_800), totalRealCentavos: R(12_050), totalDiferencaCentavos: -R(1_750) });
    expect(c.linhas.find((l) => l.tipo === 'preparos')).toMatchObject({ compraCentavos: 0, diferencaCentavos: -R(300), realCentavos: -R(300) });
  });

  it('textos do sinal: dinheiro e pontos andam juntos (zero não leva sinal)', () => {
    expect(sp(dinheiroComSinal(-R(1_600)))).toBe('−R$ 1.600,00');
    expect(sp(dinheiroComSinal(R(500)))).toBe('+R$ 500,00');
    expect(pontosComSinalDaDiferenca(0)).toBe('0,00 pp');
    expect(sp(pontosComSinalDaDiferenca(-160))).toBe('−1,60 pp');
  });
});

describe('I.2b · matriz categoria × loja', () => {
  it('cada coluna fecha no CMV da loja e a rede é a soma; quem tem uma loja só não tem matriz', () => {
    const dl: LojaNoPainel = {
      lojaId: 'dl',
      nome: 'Unidade Tijuca',
      receitaBrutaCentavos: R(30_000),
      compras: new Map<string | null, number>([[id('PROTEINA'), R(1_000)]]),
      real: { categorias: new Map([[id('PROTEINA'), M(1_200, 1_000, 1_700)], [id('LATICINIOS'), M(800, 0, 700)]]), preparos: M(0, 0, 0) },
      cmvCentavos: R(600),
      naoUsa: new Set([id('BEBIDAS')]),
      metas: new Map([[id('PROTEINA'), 900]]),
      metaVemDe: 'loja',
    };
    const p = montarPainelDeCategorias(entrada([lojaVp(), dl]));
    const m = p.matriz!;
    expect(m.lojas.map((l) => l.nome)).toEqual(['Unidade Tijuca', 'Vila da Penha']);
    m.lojas.forEach((l, i) => expect(m.linhas.reduce((s, x) => s + (x.celulas[i]?.centavos ?? 0), 0)).toBe(l.cmvCentavos));
    expect(m.linhas.reduce((s, x) => s + x.rede.centavos, 0)).toBe(R(12_650));
    const prot = m.linhas.find((x) => x.nome === 'Proteína')!;
    expect(prot.celulas[0]).toMatchObject({ centavos: R(500), bp: 167, metaBp: 900 });
    expect(montarPainelDeCategorias(entrada([lojaVp()])).matriz).toBeNull();
  });
});

describe('I.2b · propriedade: o painel sempre fecha no CMV do DRE', () => {
  const montante = fc.record({ inicial: fc.integer({ min: 0, max: 500_000 }), entradas: fc.integer({ min: 0, max: 500_000 }), final: fc.integer({ min: 0, max: 500_000 }) });
  const lojaArb = (n: number) =>
    fc
      .record({
        abre: fc.boolean(),
        receita: fc.integer({ min: 0, max: 5_000_000 }),
        compras: fc.array(fc.tuple(fc.constantFrom<string | null>(...CATEGORIAS.map((c) => c.id), null, CHAVE_DOS_PREPARADOS), fc.integer({ min: 0, max: 300_000 })), { maxLength: 6 }),
        reais: fc.array(fc.tuple(fc.constantFrom<string | null>(...CATEGORIAS.map((c) => c.id), null), montante), { maxLength: 6 }),
        prep: montante,
        naoUsa: fc.array(fc.constantFrom(...CATEGORIAS.map((c) => c.id)), { maxLength: 3 }),
        metas: fc.array(fc.tuple(fc.constantFrom(...CATEGORIAS.map((c) => c.id)), fc.integer({ min: 0, max: 3_000 })), { maxLength: 5 }),
      })
      .map((x): LojaNoPainel => {
        const compras = new Map<string | null, number>();
        for (const [k, v] of x.compras) compras.set(k, v);
        const categorias = new Map<string | null, MontantesDoEstoque>();
        for (const [k, m] of x.reais) categorias.set(k, m);
        const real: RealDaLoja | null = x.abre ? { categorias, preparos: x.prep } : null;
        const totalReal = x.abre ? Array.from(categorias.values()).reduce((s, m) => s + realDoMontante(m), 0) + realDoMontante(x.prep) : null;
        const totalCompras = Array.from(compras.values()).reduce((s, v) => s + v, 0);
        // O DRE da loja é o real (quando existe um real do DRE, abra ou não por categoria) ou as compras; aqui o real do DRE da loja que não abriu é sorteado perto das compras.
        const cmv = totalReal ?? totalCompras + (x.receita % 7 === 0 ? 12_345 : 0);
        return {
          lojaId: `l${n}`,
          nome: `Loja ${n}`,
          receitaBrutaCentavos: x.receita,
          compras,
          real,
          cmvCentavos: cmv,
          motivoSemRealPorCategoria: x.abre ? null : x.receita % 7 === 0 ? 'sem retrato' : null,
          naoUsa: new Set(x.naoUsa),
          metas: new Map(x.metas),
          metaVemDe: 'rede',
        };
      });

  it('para qualquer combinação: Σ das linhas = CMV do DRE; pp com o sinal do R$; matriz fecha por coluna', () => {
    fc.assert(
      fc.property(fc.tuple(lojaArb(1), lojaArb(2), lojaArb(3)), fc.integer({ min: 1, max: 3 }), (tres, quantas) => {
        const lojas = tres.slice(0, quantas);
        const e = entrada(lojas);
        const p = montarPainelDeCategorias(e);
        const soma = p.linhas.reduce((s, l) => s + (l.realizadoCentavos ?? 0), 0);
        expect(soma).toBe(e.totalCentavos);
        for (const l of p.linhas) {
          if (l.desvioCentavos !== null && l.desvioBp !== null) expect(Math.sign(l.desvioBp) === 0 || Math.sign(l.desvioBp) === Math.sign(l.desvioCentavos)).toBe(true);
          if (l.desvioRelativoBp !== null && l.desvioCentavos !== null) expect(Math.sign(l.desvioRelativoBp) === 0 || Math.sign(l.desvioRelativoBp) === Math.sign(l.desvioCentavos)).toBe(true);
        }
        for (const c of p.compraReal?.linhas ?? []) {
          if (c.diferencaCentavos !== null && c.diferencaBp !== null) expect(Math.sign(c.diferencaBp) === 0 || Math.sign(c.diferencaBp) === Math.sign(c.diferencaCentavos)).toBe(true);
        }
        if (p.compraReal) {
          expect(p.compraReal.linhas.reduce((s, c) => s + (c.diferencaCentavos ?? 0), 0)).toBe(p.compraReal.totalDiferencaCentavos);
        }
        if (p.matriz) p.matriz.lojas.forEach((l, i) => expect(p.matriz!.linhas.reduce((s, x) => s + (x.celulas[i]?.centavos ?? 0), 0)).toBe(l.cmvCentavos));
      }),
      { numRuns: 300 },
    );
  });
});

describe('I.2b · a fotografia v5 (categorias, versão 2)', () => {
  it('ida e volta: o painel do fechado é o do ao vivo, com o real; reclassificar/renomear depois não o muda', () => {
    const lojas = [lojaVp()];
    const aoVivo = montarPainelDeCategorias(entrada(lojas));
    const json = JSON.parse(JSON.stringify(categoriasParaGravar(CATEGORIAS, lojas)));
    expect(json.versao).toBe(2);
    expect(json.lojas.vp.real).toBeTruthy();
    const lida = categoriasLidasDaFotografia(json, () => R(100_000))!;
    const fechado = montarPainelDeCategorias(entrada(lida.lojas.map((l) => ({ ...l, cmvCentavos: R(12_050) })), { categorias: lida.categorias }));
    const resumo = (p: typeof aoVivo) => p.linhas.map((l) => [l.chave, l.realizadoCentavos, l.metaBp, l.desvioBp, l.fonte]);
    expect(resumo(fechado)).toEqual(resumo(aoVivo));
    expect(JSON.stringify(fechado.compraReal)).toBe(JSON.stringify(aoVivo.compraReal));
  });

  it('a fotografia v4 (categorias versão 1, só compras) é lida como está: sem real, sem inventar', () => {
    const v1 = { versao: 1, lojas: { vp: { nome: 'Vila da Penha', origem: 'rede', semCategoriaCentavos: R(200), categorias: [{ id: id('PROTEINA'), chave: 'PROTEINA', nome: 'Proteína', ordem: 10, ativa: true, sistema: false, compraCentavos: R(8_600), metaBp: 1100, usa: true }] } } };
    const lida = categoriasLidasDaFotografia(v1, () => R(100_000))!;
    expect(lida.lojas[0].real ?? null).toBeNull();
    expect(lida.lojas[0].compras.get(id('PROTEINA'))).toBe(R(8_600));
  });

  it('real gravado com número quebrado ou faltando é descartado inteiro (a loja fica pelas compras)', () => {
    const lojas = [lojaVp()];
    const json = JSON.parse(JSON.stringify(categoriasParaGravar(CATEGORIAS, lojas)));
    json.lojas.vp.categorias.find((c: { id: string }) => c.id === id('PROTEINA')).finalCentavos = 1.5;
    expect(categoriasLidasDaFotografia(json, () => 0)!.lojas[0].real).toBeNull();
    const json2 = JSON.parse(JSON.stringify(categoriasParaGravar(CATEGORIAS, lojas)));
    delete json2.lojas.vp.real;
    expect(categoriasLidasDaFotografia(json2, () => 0)!.lojas[0].real).toBeNull();
    expect(categoriasLidasDaFotografia({ versao: 3, lojas: {} }, () => 0)).toBeNull();
  });
});

describe('I.2b · evolução', () => {
  const periodo = (inicio: string, nome: string, realizado: number | null, extra: Partial<Parameters<typeof montarEvolucao>[0][number]> = {}) => {
    const lojas = realizado === null ? [] : [lojaVp({ real: null, compras: new Map<string | null, number>([[id('PROTEINA'), R(realizado)]]), cmvCentavos: R(realizado) })];
    return {
      inicio,
      nome,
      situacao: 'encerrado' as const,
      antigo: false,
      semFaturamento: realizado === null,
      totalCentavos: realizado === null ? null : R(realizado),
      totalBp: realizado === null ? null : Math.round((realizado * 10_000) / 100_000),
      metaTotalBp: 3200,
      desvioTotalBp: null,
      painel: montarPainelDeCategorias(entrada(lojas, { encerrado: true })),
      ...extra,
    };
  };

  it('sai do mais antigo ao mais novo, uma célula por período, e o que não tem dado fica vazio com o motivo (nunca zero)', () => {
    const e = montarEvolucao([periodo('2026-10-01', 'Outubro', 3_000, { situacao: 'em-curso' }), periodo('2026-09-01', 'Setembro', 8_000, { situacao: 'fechado' }), periodo('2026-08-01', 'Agosto', null), periodo('2026-07-01', 'Julho', 5_000, { antigo: true, painel: null })]);
    expect(e.periodos.map((p) => p.nome)).toEqual(['Julho', 'Agosto', 'Setembro', 'Outubro']);
    expect(e.periodos[0].semDado).toBe('não apurado por categoria (fechado antes da I.2)');
    expect(e.periodos[1].semDado).toBe('sem faturamento nem compras');
    expect(e.periodos[2].semDado).toBeNull();
    const prot = e.linhas.find((l) => l.nome === 'Proteína')!;
    expect(prot.celulas.map((c) => c?.realizadoCentavos ?? null)).toEqual([null, null, R(8_000), R(3_000)]);
    expect(prot.celulas[2]).toMatchObject({ realizadoBp: 800, metaBp: 1100, desvioBp: -300 });
    const total = e.linhas[e.linhas.length - 1];
    expect(total.tipo).toBe('total');
    expect(total.celulas.map((c) => c?.realizadoCentavos ?? null)).toEqual([R(5_000), null, R(8_000), R(3_000)]);
  });
});

describe('I.2b · meta total por loja no orçamento (campos)', () => {
  const loja = (id: string, nome: string, prev: number): LojaDoOrcamento => ({
    lojaId: id,
    nome,
    canais: ['LOJA'],
    primeiroLancamento: '2026-01-01',
    graos: Array.from({ length: 21 }, (_, k) => ({ data: `2026-10-${String(k + 1).padStart(2, '0')}`, canal: 'LOJA' as const, valorCentavos: R(prev / 31) })),
    compradoCentavos: 0,
    compradoAteOntemCentavos: 0,
  });
  const periodo = { inicio: '2026-10-01', fim: '2026-10-31' } as Parameters<typeof orcamentoDaLoja>[1];

  it('cada loja usa a sua meta; a rede soma os tetos e, com metas diferentes, diz que é mista (média ponderada pela receita prevista)', () => {
    const penha = orcamentoDaLoja(loja('vp', 'Vila da Penha', 62_000), periodo, '2026-10-22', 3200);
    const delivery = orcamentoDaLoja(loja('dl', 'Delivery', 31_000), periodo, '2026-10-22', 3000);
    expect(penha.conta!.metaBp).toBe(3200);
    expect(delivery.conta!.metaBp).toBe(3000);
    const rede = orcamentoDoEscopo([penha, delivery]);
    expect(rede.conta!.tetoCentavos).toBe(penha.conta!.tetoCentavos + delivery.conta!.tetoCentavos);
    expect(rede.conta!.metaMista).toBe(true);
    expect(rede.conta!.metaBp).toBeGreaterThan(3000);
    expect(rede.conta!.metaBp).toBeLessThan(3200);
    expect(rede.ritmoMetaBp).not.toBeNull();
  });

  it('metas iguais: a rede não é mista e o resultado é o de sempre; sem meta em nenhuma, sem número', () => {
    const a = orcamentoDaLoja(loja('vp', 'Vila da Penha', 62_000), periodo, '2026-10-22', 3000);
    const b = orcamentoDaLoja(loja('dl', 'Delivery', 31_000), periodo, '2026-10-22', 3000);
    const r = orcamentoDoEscopo([a, b]);
    expect(r.conta!.metaBp).toBe(3000);
    expect(r.conta!.metaMista).toBeUndefined();
    const sem = orcamentoDoEscopo([orcamentoDaLoja(loja('vp', 'Vila da Penha', 62_000), periodo, '2026-10-22', null)]);
    expect(sem.conta).toBeNull();
  });
});

describe('I.2b · teste-guarda: o real por categoria não lê a embalagem por canal (a 1.9 é custo teórico, nunca entra no DRE)', () => {
  it.each(['src/lib/erp/cmv-categorias-real.ts', 'src/lib/erp/cmv-categorias.ts', 'src/lib/erp/cmv-categorias-campos.ts', 'src/lib/erp/cmv.ts'])('%s', (arquivo) => {
    expect(readFileSync(arquivo, 'utf8')).not.toMatch(/ProdutoEmbalagem|produtoEmbalagem/);
  });
});
