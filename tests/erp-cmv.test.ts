/**
 * ERP 2.3 · os dois CMVs (a conta pura, sem banco).
 *
 * O cenário é o da análise (Casa Alfa, Vila da Penha): setembro e outubro de 2026. Os números são conferíveis
 * à mão: estoque final de setembro R$ 11.700,00, de outubro R$ 13.550,00, CMV de compra R$ 25.800,00,
 * real R$ 23.950,00, diferença −R$ 1.850,00.
 */
import { describe, expect, it } from 'vitest';
import {
  apurarReal,
  cmvDoEscopo,
  cmvLidoDaFotografia,
  cmvParaGravar,
  cmvReal,
  eAgoraDaComparacao,
  seloDoCmv,
  estoqueFinalDoPeriodo,
  fraseDaComparacao,
  fraseDoSemPreco,
  LIMITE_DA_NOTA,
  valeDaLoja,
  type CmvDaLoja,
  type CmvDoDre,
  type ContextoDoReal,
  type DadosParaOReal,
  type FechoDeEstoque,
} from '@/lib/erp/cmv-campos';
import { compararCmv, painelDoCmv, somarComparacoes } from '@/lib/erp/cmv-comparacao';
import { montarDre } from '@/lib/erp/dre-campos';
import { planoEfetivo } from '@/lib/erp/dre-plano';

const R = (reais: number) => Math.round(reais * 100);

const SETEMBRO = { inicio: '2026-09-01', fim: '2026-09-30', nome: 'Setembro de 2026' };
const OUTUBRO = { inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' };

const fecho = (id: string, valor: number, depois = 0, antes = 0, semPreco: number | null = 0): FechoDeEstoque => ({
  id,
  fechadaEm: '2026-11-02T18:00:00.000Z',
  valorTotalCentavos: R(valor),
  itensSemPreco: semPreco,
  depoisCentavos: R(depois),
  antesCentavos: R(antes),
});

const abertura = { id: 'ab', status: 'FECHADA' as const, diaConcluida: '2026-09-01', valorTotalCentavos: R(10_000), itensSemPreco: 0 };

const ctx = (periodo: typeof OUTUBRO, anterior: typeof SETEMBRO | null, hoje: string): ContextoDoReal => ({
  periodo,
  anterior,
  proximoNome: periodo === OUTUBRO ? 'Novembro de 2026' : 'Outubro de 2026',
  hoje,
  encerrado: periodo.fim < hoje,
  abreEm: periodo.fim.slice(0, 8) + String(Number(periodo.fim.slice(8)) - 2).padStart(2, '0'),
});

describe('2.3 · o corte do estoque final (decisão 162)', () => {
  it('setembro: retrato R$ 12.000,00 menos a requisição de R$ 300,00 depois do retrato = R$ 11.700,00 (critério 2)', () => {
    expect(estoqueFinalDoPeriodo({ retratoCentavos: R(12_000), depoisCentavos: R(-300), antesCentavos: 0 })).toBe(R(11_700));
  });

  it('outubro: retrato R$ 14.100,00 menos o que entrou de novembro antes dele (1.000 − 400 − 50) = R$ 13.550,00 (critério 3)', () => {
    expect(estoqueFinalDoPeriodo({ retratoCentavos: R(14_100), depoisCentavos: 0, antesCentavos: R(1_000 - 400 - 50) })).toBe(R(13_550));
  });

  it('o real é inicial + compras − final', () => {
    expect(cmvReal({ inicialCentavos: R(11_700), comprasReaisCentavos: R(25_800), finalCentavos: R(13_550) })).toBe(R(23_950));
  });
});

describe('2.3 · apurar o real de uma loja', () => {
  const outubro: DadosParaOReal = {
    comprasReaisCentavos: R(25_800),
    abertura,
    fechoAnterior: fecho('fs', 12_000, -300),
    fechoDoPeriodo: fecho('fo', 14_100, 0, 550),
  };

  it('outubro encerrado: inicial R$ 11.700,00 (derivado do fechamento de setembro), final R$ 13.550,00, real R$ 23.950,00', () => {
    const { real, motivo } = apurarReal(outubro, ctx(OUTUBRO, SETEMBRO, '2026-11-05'));
    expect(motivo).toBeNull();
    expect(real).toMatchObject({ centavos: R(23_950), inicialCentavos: R(11_700), finalCentavos: R(13_550), comprasReaisCentavos: R(25_800), inicialDe: 'fechamento', fechamentoId: 'fo', aberturaId: 'ab' });
  });

  it('setembro: o inicial é a abertura concluída no primeiro dia (R$ 10.000,00): real R$ 20.300,00 (critério 9)', () => {
    const { real } = apurarReal({ comprasReaisCentavos: R(22_000), abertura, fechoAnterior: null, fechoDoPeriodo: fecho('fs', 12_000, -300) }, ctx(SETEMBRO, null, '2026-11-05'));
    expect(real).toMatchObject({ centavos: R(20_300), inicialCentavos: R(10_000), inicialDe: 'abertura' });
  });

  it('período em curso nunca tem real, mesmo com o fechamento já aplicado', () => {
    const r = apurarReal({ ...outubro, fechoDoPeriodo: fecho('fo', 14_100) }, ctx(OUTUBRO, SETEMBRO, '2026-10-17'));
    expect(r.real).toBeNull();
    expect(r.motivo).toBe('fecha na contagem de fechamento (abre em 29/10)');
    const dia29 = apurarReal(outubro, ctx(OUTUBRO, SETEMBRO, '2026-10-30'));
    expect(dia29.real).toBeNull();
    expect(dia29.motivo).toMatch(/depois que o período terminar/);
  });

  it('critério 11: sem o fechamento de setembro, o inicial falta; sem o de outubro, o final falta', () => {
    expect(apurarReal({ ...outubro, fechoAnterior: null }, ctx(OUTUBRO, SETEMBRO, '2026-11-05')).motivo).toBe('falta o fechamento de estoque de setembro de 2026 (estoque inicial)');
    expect(apurarReal({ ...outubro, fechoDoPeriodo: null }, ctx(OUTUBRO, SETEMBRO, '2026-11-05')).motivo).toBe('falta o fechamento de estoque de outubro de 2026');
    // Faltando os dois, o primeiro que a pessoa precisa resolver é o do mês anterior.
    expect(apurarReal({ ...outubro, fechoAnterior: null, fechoDoPeriodo: null }, ctx(OUTUBRO, SETEMBRO, '2026-11-05')).motivo).toMatch(/setembro/);
  });

  it('critério 11: estoque aberto no meio do período não tem real nele; o real começa no seguinte', () => {
    const meio = { id: 'a2', status: 'FECHADA' as const, diaConcluida: '2026-10-15', valorTotalCentavos: R(3_000), itensSemPreco: 0 };
    const r = apurarReal({ comprasReaisCentavos: 0, abertura: meio, fechoAnterior: null, fechoDoPeriodo: fecho('f', 3_000) }, ctx(OUTUBRO, SETEMBRO, '2026-11-05'));
    expect(r.real).toBeNull();
    expect(r.motivo).toBe('o estoque abriu em 15/10; o real começa em novembro de 2026');
  });

  it('estoque não aberto, em contagem de abertura ou aberto só depois do período', () => {
    const base = { comprasReaisCentavos: 0, fechoAnterior: null, fechoDoPeriodo: null };
    expect(apurarReal({ ...base, abertura: null }, ctx(OUTUBRO, SETEMBRO, '2026-11-05')).motivo).toBe('estoque não aberto');
    expect(apurarReal({ ...base, abertura: { id: 'x', status: 'ABERTA', diaConcluida: null, valorTotalCentavos: null, itensSemPreco: null } }, ctx(OUTUBRO, SETEMBRO, '2026-11-05')).motivo).toBe('estoque em contagem de abertura');
    expect(apurarReal({ ...base, abertura: { ...abertura, diaConcluida: '2026-11-03' } }, ctx(OUTUBRO, SETEMBRO, '2026-11-05')).motivo).toBe('o estoque só abriu em 03/11');
  });

  it('o corte do período anterior entra no inicial (nunca reavaliado): R$ 12.000,00 − R$ 300,00', () => {
    const { real } = apurarReal(outubro, ctx(OUTUBRO, SETEMBRO, '2026-11-05'));
    expect(real!.inicialCentavos).toBe(R(12_000) + R(-300));
  });
});

describe('2.3 · encadeamento: o inicial de um período é o final do anterior (critério 10)', () => {
  it('setembro + outubro = 10.000 + 22.000 + 25.800 − 13.550 = R$ 44.250,00', () => {
    const set = cmvReal({ inicialCentavos: R(10_000), comprasReaisCentavos: R(22_000), finalCentavos: R(11_700) });
    const out = cmvReal({ inicialCentavos: R(11_700), comprasReaisCentavos: R(25_800), finalCentavos: R(13_550) });
    expect(set).toBe(R(20_300));
    expect(out).toBe(R(23_950));
    expect(set + out).toBe(R(10_000 + 22_000 + 25_800 - 13_550));
    expect(set + out).toBe(R(44_250));
  });

  it('para N períodos quaisquer, a soma dos reais é o inicial do primeiro + as compras de todos − o final do último', () => {
    let semente = 12345;
    const sorteio = (max: number) => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) % max);
    for (let rodada = 0; rodada < 200; rodada++) {
      const n = 1 + sorteio(12);
      const inicial = sorteio(2_000_000);
      let estoque = inicial;
      let soma = 0;
      let compras = 0;
      for (let i = 0; i < n; i++) {
        const c = sorteio(3_000_000);
        // O estoque final do período vem do corte; o inicial do seguinte é ELE (pela regra, nunca outro número).
        const final = estoqueFinalDoPeriodo({ retratoCentavos: sorteio(3_000_000), depoisCentavos: sorteio(200_000) - 100_000, antesCentavos: sorteio(200_000) });
        soma += cmvReal({ inicialCentavos: estoque, comprasReaisCentavos: c, finalCentavos: final });
        compras += c;
        estoque = final;
      }
      expect(soma).toBe(inicial + compras - estoque);
    }
  });
});

describe('2.3 · qual CMV entra no resultado (decisão 165)', () => {
  const real = (centavos: number) => ({ centavos, inicialCentavos: R(11_700), finalCentavos: R(13_550), comprasReaisCentavos: R(25_800), inicialDe: 'fechamento' as const, retratoEm: '2026-11-02T18:00:00.000Z', fechamentoId: 'fo', aberturaId: 'ab', semPrecoInicial: 0, semPrecoFinal: 0 });
  const vp: CmvDaLoja = { lojaId: 'vp', lojaNome: 'Vila da Penha', compraCentavos: R(25_800), real: real(R(23_950)), motivoSemReal: null };
  const dl: CmvDaLoja = { lojaId: 'dl', lojaNome: 'Delivery', compraCentavos: R(4_000), real: null, motivoSemReal: 'estoque não aberto' };
  const ct: CmvDaLoja = { lojaId: 'ct', lojaNome: 'Centro', compraCentavos: null, real: null, motivoSemReal: 'estoque não aberto' };
  const receita: Record<string, number> = { vp: R(120_000), dl: R(30_000), ct: R(10_000) };
  const cmv: CmvDoDre = { lojas: [vp, dl, ct], parcial: false };
  const rec = (id: string) => receita[id] ?? 0;

  it('a loja usa o real quando apurado, senão a compra, senão nada', () => {
    expect(valeDaLoja(vp)).toEqual({ centavos: R(23_950), fonte: 'real' });
    expect(valeDaLoja(dl)).toEqual({ centavos: R(4_000), fonte: 'compras' });
    expect(valeDaLoja(ct)).toBeNull();
  });

  it('critério 4: VP = R$ 23.950,00, selo "real (contagem)"; compra R$ 25.800,00', () => {
    const e = cmvDoEscopo(cmv, { tipo: 'loja', lojaId: 'vp' }, rec);
    expect(e).toMatchObject({ centavos: R(23_950), fonte: 'real', nota: 'real (contagem)', semTexto: null });
    expect(e.compra.centavos).toBe(R(25_800));
    expect(e.real.centavos).toBe(R(23_950));
    expect((e.real.nota ?? '').replace(/\u00a0/g, ' ')).toBe('inicial R$ 11.700,00 + compras R$ 25.800,00 − final R$ 13.550,00');
  });

  it('critério 4: Centro sem nota e sem estoque é NULO com a frase (nunca R$ 0,00) e fica "sem contar o CMV"', () => {
    const e = cmvDoEscopo(cmv, { tipo: 'loja', lojaId: 'ct' }, rec);
    expect(e).toMatchObject({ centavos: null, fonte: null, nota: 'sem nota de compra no período', semTexto: 'o CMV' });
    expect(e.compra).toEqual({ centavos: null, nota: 'sem nota de compra no período' });
  });

  it('critério 6: a rede soma o que vale em cada loja, R$ 27.950,00, e o selo é "misto" com cada loja dita', () => {
    const e = cmvDoEscopo(cmv, { tipo: 'rede' }, rec);
    expect(e.centavos).toBe(R(23_950 + 4_000));
    expect(e.fonte).toBe('misto');
    expect(e.nota).toBe('misto: real em Vila da Penha; pelas compras em Delivery (estoque não aberto); sem o CMV de Centro');
    expect(e.semTexto).toBe('o CMV de Centro');
    expect(e.compra).toMatchObject({ centavos: R(25_800 + 4_000) });
    expect(e.real).toMatchObject({ centavos: R(23_950), nota: 'apurado em 1 de 3 lojas' });
  });

  it('a rede toda pelo real não é "misto", e loja parada (sem venda, nota nem real) não pesa', () => {
    const parada: CmvDaLoja = { lojaId: 'pr', lojaNome: 'Parada', compraCentavos: null, real: null, motivoSemReal: 'estoque não aberto' };
    const e = cmvDoEscopo({ lojas: [vp, parada], parcial: false }, { tipo: 'rede' }, rec);
    expect(e).toMatchObject({ centavos: R(23_950), fonte: 'real', nota: 'real (contagem)', semTexto: null });
  });

  it('critério 1: no período em curso, só a compra, com o selo "pelas compras · parcial"', () => {
    const parcial: CmvDoDre = { parcial: true, lojas: [{ lojaId: 'vp', lojaNome: 'Vila da Penha', compraCentavos: R(20_000), real: null, motivoSemReal: 'fecha na contagem de fechamento (abre em 29/10)' }] };
    const e = cmvDoEscopo(parcial, { tipo: 'loja', lojaId: 'vp' }, rec);
    expect(e).toMatchObject({ centavos: R(20_000), fonte: 'compras', nota: 'pelas compras · parcial' });
    expect(e.real).toEqual({ centavos: null, nota: 'fecha na contagem de fechamento (abre em 29/10)' });
  });

  it('selo comprido: primeiro perde o motivo, mantém os nomes das lojas; só depois vira contagem', () => {
    const lojas: CmvDaLoja[] = [
      { ...vp, lojaNome: 'Casa Vila da Penha' },
      { ...dl, lojaNome: 'Casa Vila da Penha Delivery' },
      { ...ct, lojaNome: 'Casa Centro' },
    ];
    const e = cmvDoEscopo({ lojas, parcial: false }, { tipo: 'rede' }, rec);
    expect(e.nota).toBe('misto: real em Casa Vila da Penha; pelas compras em Casa Vila da Penha Delivery; sem o CMV de Casa Centro');
    expect(e.nota.length).toBeLessThanOrEqual(LIMITE_DA_NOTA);
  });

  it('o selo cabe em 120 letras mesmo com 50 lojas (o banco recusa mais)', () => {
    const lojas: CmvDaLoja[] = Array.from({ length: 50 }, (_, i) => ({
      lojaId: `l${i}`,
      lojaNome: `Restaurante número ${i} da rede`,
      compraCentavos: i % 3 === 0 ? null : R(1_000),
      real: i % 5 === 0 ? { ...vp.real!, centavos: R(900) } : null,
      motivoSemReal: 'falta o fechamento de estoque de outubro de 2026',
    }));
    const e = cmvDoEscopo({ lojas, parcial: false }, { tipo: 'rede' }, () => R(1_000));
    expect(e.nota.length).toBeLessThanOrEqual(LIMITE_DA_NOTA);
    expect(e.nota).toMatch(/^misto: real em \d+ lojas?; pelas compras em \d+; sem o CMV de \d+$/);
    expect((e.real.nota ?? '').length).toBeLessThanOrEqual(LIMITE_DA_NOTA);
  });
});

describe('2.3 · compra × real (decisão 166)', () => {
  const real = (centavos: number, ini: number, fim: number, c: number) => ({ centavos, inicialCentavos: R(ini), finalCentavos: R(fim), comprasReaisCentavos: R(c), inicialDe: 'fechamento' as const, retratoEm: '', fechamentoId: 'f', aberturaId: 'a', semPrecoInicial: 0, semPrecoFinal: 3 });
  const outubro: CmvDaLoja = { lojaId: 'vp', lojaNome: 'Vila da Penha', compraCentavos: R(25_800), real: real(R(23_950), 11_700, 13_550, 25_800), motivoSemReal: null };
  const setembro: CmvDaLoja = { lojaId: 'vp', lojaNome: 'Vila da Penha', compraCentavos: R(22_500), real: real(R(20_300), 10_000, 11_700, 22_000), motivoSemReal: null };

  it('critério 5: outubro, −R$ 1.850,00 e −1,5 pp, "o estoque subiu R$ 1.850,00 (de R$ 11.700,00 para R$ 13.550,00)"', () => {
    const [c] = compararCmv({ lojas: [outubro], parcial: false }, () => R(120_000));
    expect(c.diferencaCentavos).toBe(R(-1_850));
    expect(c.diferencaBp).toBe(-154);
    const frase = c.frase.replace(/\u00a0/g, ' ');
    expect(frase).toContain('o estoque subiu R$ 1.850,00 (de R$ 11.700,00 para R$ 13.550,00)');
    expect(frase).toContain('dinheiro parado na prateleira');
    expect(frase).not.toContain('notas já estavam');
    expect(c.semPrecoFinal).toBe(3);
  });

  it('critério 9: setembro, −R$ 2.200,00 = estoque subiu R$ 1.700,00 + R$ 500,00 de notas que já estavam na contagem de abertura', () => {
    const [c] = compararCmv({ lojas: [setembro], parcial: false }, () => R(100_000));
    expect(c.diferencaCentavos).toBe(R(-2_200));
    expect(c.notasNaAberturaCentavos).toBe(R(500));
    const frase = c.frase.replace(/\u00a0/g, ' ');
    expect(frase).toContain('o estoque subiu R$ 1.700,00');
    expect(frase).toContain('R$ 500,00 de notas já estavam na contagem de abertura');
  });

  it('estoque que desce: "consumiu do que já tinha"; igual: "ficou igual"', () => {
    expect(fraseDaComparacao({ inicialCentavos: R(5_000), finalCentavos: R(4_000), notasNaAberturaCentavos: 0 })).toMatch(/o estoque desceu R\$.1\.000,00 .*consumiu do que já tinha/);
    expect(fraseDaComparacao({ inicialCentavos: R(5_000), finalCentavos: R(5_000), notasNaAberturaCentavos: 0 })).toMatch(/ficou igual/);
  });

  it('o painel soma as lojas comparadas e diz quem ficou só pelas compras, com o motivo', () => {
    const dl: CmvDaLoja = { lojaId: 'dl', lojaNome: 'Delivery', compraCentavos: R(4_000), real: null, motivoSemReal: 'estoque não aberto' };
    const ct: CmvDaLoja = { lojaId: 'ct', lojaNome: 'Centro', compraCentavos: null, real: null, motivoSemReal: 'estoque não aberto' };
    const parada: CmvDaLoja = { lojaId: 'pr', lojaNome: 'Parada', compraCentavos: null, real: null, motivoSemReal: 'estoque não aberto' };
    const rec = (id: string) => ({ vp: R(120_000), dl: R(30_000), ct: R(10_000) })[id as 'vp'] ?? 0;
    const p = painelDoCmv({ lojas: [outubro, dl, ct, parada], parcial: false }, rec);
    expect(p.comparacoes.map((c) => c.lojaId)).toEqual(['vp']);
    expect(p.total).toBeNull();
    expect(p.semReal.map((l) => [l.lojaNome, l.motivo])).toEqual([
      ['Centro', 'estoque não aberto'],
      ['Delivery', 'estoque não aberto'],
    ]);
    const duas = somarComparacoes(
      compararCmv({ lojas: [outubro, { ...outubro, lojaId: 'v2', lojaNome: 'Outra', compraCentavos: R(1_000), real: real(R(900), 100, 200, 1_000) }], parcial: false }, () => R(100_000)),
      R(200_000),
    );
    expect(duas.diferencaCentavos).toBe(R(23_950 + 900) - R(25_800 + 1_000));
  });
});

describe('2.3 · estoque sem preço e a fotografia', () => {
  it('o aviso conta os insumos sem preço; zero não avisa; nulo é "não registrado" (contagem de antes da 2.3)', () => {
    expect(fraseDoSemPreco(3, 'final')).toBe('estoque final sem o valor de 3 insumos sem preço');
    expect(fraseDoSemPreco(1, 'inicial')).toBe('estoque inicial sem o valor de 1 insumo sem preço');
    expect(fraseDoSemPreco(0, 'final')).toBeNull();
    expect(fraseDoSemPreco(null, 'final')).toBe('não sabemos quantos insumos estavam sem preço no fechamento');
    expect(fraseDoSemPreco(null, 'inicial', 'abertura')).toBe('não sabemos quantos insumos estavam sem preço na abertura');
  });

  it('o CMV vai e volta da fotografia sem perder nada; lixo vira "sem CMV", nunca um número inventado', () => {
    const real = { centavos: R(23_950), inicialCentavos: R(11_700), finalCentavos: R(13_550), comprasReaisCentavos: R(25_800), inicialDe: 'fechamento' as const, retratoEm: '2026-11-02T18:00:00.000Z', fechamentoId: 'fo', aberturaId: 'ab', semPrecoInicial: 0, semPrecoFinal: 3 };
    const cmv: CmvDoDre = { parcial: false, lojas: [{ lojaId: 'vp', lojaNome: 'Vila da Penha', compraCentavos: R(25_800), real, motivoSemReal: null }, { lojaId: 'ct', lojaNome: 'Centro', compraCentavos: null, real: null, motivoSemReal: 'estoque não aberto' }] };
    const gravado = JSON.parse(JSON.stringify(cmvParaGravar(cmv)));
    expect(gravado.lojas.vp.real.finalCentavos).toBe(R(13_550));
    expect(cmvLidoDaFotografia(gravado)).toEqual(cmv);
    for (const lixo of [null, 'x', 3, {}, { versao: 2, lojas: {} }, { versao: 1, lojas: 'x' }]) expect(cmvLidoDaFotografia(lixo)).toEqual({ lojas: [], parcial: false });
    expect(cmvLidoDaFotografia({ versao: 1, lojas: { a: { lojaNome: 'A', compraCentavos: 'muito', real: null } } }).lojas).toEqual([]);
  });
});

describe('2.3 · o CMV é SUBTRAÍDO na margem de contribuição e segue para os resultados', () => {
  const plano = planoEfetivo([]).map((l, i) => ({ ...l, id: `L${i}` }));
  const real = { centavos: R(23_950), inicialCentavos: R(11_700), finalCentavos: R(13_550), comprasReaisCentavos: R(25_800), inicialDe: 'fechamento' as const, retratoEm: '', fechamentoId: 'f', aberturaId: 'a', semPrecoInicial: 0, semPrecoFinal: 0 };
  const cmv: CmvDoDre = {
    parcial: false,
    lojas: [
      { lojaId: 'vp', lojaNome: 'Vila da Penha', compraCentavos: R(25_800), real, motivoSemReal: null },
      { lojaId: 'dl', lojaNome: 'Delivery', compraCentavos: R(4_000), real: null, motivoSemReal: 'estoque não aberto' },
      { lojaId: 'ct', lojaNome: 'Centro', compraCentavos: null, real: null, motivoSemReal: 'estoque não aberto' },
    ],
  };
  const receitas = [
    { lojaId: 'vp', canal: 'LOJA' as const, valorCentavos: R(120_000) },
    { lojaId: 'dl', canal: 'LOJA' as const, valorCentavos: R(30_000) },
    { lojaId: 'ct', canal: 'LOJA' as const, valorCentavos: R(10_000) },
  ];
  const linha = (r: ReturnType<typeof montarDre>, codigo: string) => r.linhas.find((l) => l.codigo === codigo)!;
  const aluguel = plano.find((l) => l.codigo === 'aluguel')!.id!;

  it('loja: margem = receita líquida − CMV (R$ 120.000,00 − R$ 23.950,00 = R$ 96.050,00) e o resultado herda, sem aviso', () => {
    const r = montarDre({ escopo: { tipo: 'loja', lojaId: 'vp', nome: 'Vila da Penha' }, plano, receitas, taxaIfood: null, despesas: [{ linhaId: aluguel, lojaId: 'vp', centavos: R(10_000) }], cmv });
    expect(linha(r, 'cmv').valorCentavos).toBe(R(23_950));
    expect(linha(r, 'receita-liquida').valorCentavos).toBe(R(120_000));
    expect(linha(r, 'margem-contribuicao')).toMatchObject({ valorCentavos: R(96_050), percentualBp: 8004, semContar: [] });
    expect(linha(r, 'resultado-operacional')).toMatchObject({ valorCentavos: R(86_050), semContar: [] });
    expect(linha(r, 'resultado-do-periodo')).toMatchObject({ valorCentavos: R(86_050), semContar: [] });
  });

  it('rede: o que vale em cada loja (R$ 27.950,00) sai da margem (R$ 160.000,00 − R$ 27.950,00 = R$ 132.050,00) e o aviso diz QUAL loja ficou sem CMV', () => {
    const r = montarDre({ escopo: { tipo: 'rede' }, plano, receitas, taxaIfood: null, despesas: [{ linhaId: aluguel, lojaId: null, centavos: R(1_000) }], cmv });
    expect(linha(r, 'cmv').valorCentavos).toBe(R(27_950));
    expect(linha(r, 'margem-contribuicao')).toMatchObject({ valorCentavos: R(132_050), semContar: ['o CMV de Centro'] });
    expect(linha(r, 'resultado-do-periodo')).toMatchObject({ valorCentavos: R(131_050), semContar: ['o CMV de Centro'] });
  });

  it('loja sem nota e sem estoque: o CMV não entra (nulo), a margem é a receita líquida e o aviso é "o CMV"', () => {
    const r = montarDre({ escopo: { tipo: 'loja', lojaId: 'ct', nome: 'Centro' }, plano, receitas, taxaIfood: null, despesas: [], cmv });
    expect(linha(r, 'cmv').valorCentavos).toBeNull();
    expect(linha(r, 'margem-contribuicao')).toMatchObject({ valorCentavos: R(10_000), semContar: ['o CMV'] });
  });

  it('rede × lojas: a soma dos resultados das lojas é o da rede (R$ 27.950,00 de CMV nos dois lados)', () => {
    const rede = montarDre({ escopo: { tipo: 'rede' }, plano, receitas, taxaIfood: null, despesas: [], cmv });
    const soma = ['vp', 'dl', 'ct'].reduce((t, id) => t + linha(montarDre({ escopo: { tipo: 'loja', lojaId: id, nome: id }, plano, receitas, taxaIfood: null, despesas: [], cmv }), 'resultado-do-periodo').valorCentavos!, 0);
    expect(soma).toBe(linha(rede, 'resultado-do-periodo').valorCentavos);
    expect(soma).toBe(R(160_000 - 27_950));
  });
});

describe('2.3 · o selo do CMV e o "e agora?"', () => {
  const e = (nota: string | null, valor: number | null) => seloDoCmv({ valorCentavos: valor, nota });
  it('completo (real) × parcial × só compras × misto × ausente: cada um com a sua palavra e o seu tom', () => {
    expect(e('real (contagem)', 1)).toEqual({ tom: 'ok', texto: 'CMV real' });
    expect(e('pelas compras · parcial', 1)).toEqual({ tom: 'alerta', texto: 'CMV parcial' });
    expect(e('pelas compras: falta o fechamento de estoque de outubro de 2026', 1)).toEqual({ tom: 'neutro', texto: 'CMV pelas compras' });
    expect(e('misto: real em A; pelas compras em B; sem o CMV de C', 1)).toEqual({ tom: 'alerta', texto: 'CMV misto' });
    expect(e('real (contagem); sem o CMV de Centro', 1)).toEqual({ tom: 'alerta', texto: 'Real, incompleto' });
    expect(e('sem nota de compra no período', null)).toEqual({ tom: 'erro', texto: 'Sem CMV' });
    expect(e('não apurado neste fechamento (fechado antes do CMV)', null)).toEqual({ tom: 'neutro', texto: 'Não apurado' });
  });
  it('estoque que sobe: conferir se comprou mais do que vendeu; que desce: conferir a próxima compra; igual: nada', () => {
    expect(eAgoraDaComparacao({ inicialCentavos: R(11_700), finalCentavos: R(13_550) })).toBe('Confira se comprou mais do que vendeu no mês.');
    expect(eAgoraDaComparacao({ inicialCentavos: R(5_000), finalCentavos: R(4_000) })).toBe('O estoque está baixando: confira a próxima compra.');
    expect(eAgoraDaComparacao({ inicialCentavos: R(5_000), finalCentavos: R(5_000) })).toBeNull();
  });
});
