/**
 * N.1 — custo médio ponderado da LOJA (decisão de Rodolfo, 23/10/2026, 10:58 UTC), regras puras.
 *
 * O aceite sintético do Notion (exemplo, não dado real):
 *   - A e B começam com 10 kg e R$ 100 (R$ 10/kg). A recebe 10 kg por R$ 200; B não compra.
 *     A: 20 kg / R$ 300 / R$ 15 por kg. B continua 10 kg / R$ 100 / R$ 10 por kg.
 *   - A sai 4 kg: R$ 60, sobra 16 kg / R$ 240. B sai 2 kg: R$ 20, sobra 8 kg / R$ 80.
 *   - Com R$ 20 de frete na entrada de A: R$ 220 de entrada e média R$ 16/kg (R$ 320 ÷ 20 kg).
 * E as regras de borda: saída que leva o saldo inteiro, saldo negativo, custo desconhecido, estorno e arredondamento.
 */
import { describe, expect, it } from 'vitest';
import { aplicarNosSaldos, chaveDoSaldo, proporcao, valorPelaMediaDaLoja, type MovimentoNovo, type SaldoValorado } from '@/lib/erp/estoque-campos';

const mov = (lojaId: string, tipo: MovimentoNovo['tipo'], kg: number, centavos: number, extra: Partial<MovimentoNovo> = {}): MovimentoNovo => ({
  lojaId,
  insumoId: 'frango',
  tipo,
  quantidadeMilesimos: Math.round(kg * 1000),
  valorCentavos: centavos,
  insumoNome: 'Frango',
  unidade: 'KG',
  motivo: null,
  chave: `${lojaId}:${tipo}:${kg}:${Math.random()}`,
  ...extra,
});
const saldo = (kg: number, centavos: number, valorIncompleto = false): SaldoValorado => ({ quantidadeMilesimos: Math.round(kg * 1000), valorCentavos: centavos, valorIncompleto });
const LOJAS = new Set(['A', 'B']);

describe('N.1 · aceite sintético do Notion', () => {
  const inicio = new Map([
    [chaveDoSaldo('A', 'frango'), saldo(10, 10000)],
    [chaveDoSaldo('B', 'frango'), saldo(10, 10000)],
  ]);

  it('a compra de A não mexe em B; as saídas valem pela média de cada loja', () => {
    // A: referência da rede R$ 20/kg nas saídas que vêm de fora (o caller manda) — o valor do livro ignora.
    const { linhas, finais } = aplicarNosSaldos(
      inicio,
      [mov('A', 'ENTRADA_COMPRA', 10, 20000), mov('A', 'REQUISICAO', -4, -8000), mov('B', 'REQUISICAO', -2, -4000)],
      LOJAS,
    );
    expect(linhas.map((l) => [l.lojaId, l.tipo, l.valorCentavos, l.valorMetodo])).toEqual([
      ['A', 'ENTRADA_COMPRA', 20000, 'INFORMADO'],
      ['A', 'REQUISICAO', -6000, 'MEDIA_LOJA'],
      ['B', 'REQUISICAO', -2000, 'MEDIA_LOJA'],
    ]);
    expect(finais.get(chaveDoSaldo('A', 'frango'))).toEqual({ quantidadeMilesimos: 16000, valorCentavos: 24000, valorIncompleto: false });
    expect(finais.get(chaveDoSaldo('B', 'frango'))).toEqual({ quantidadeMilesimos: 8000, valorCentavos: 8000, valorIncompleto: false });
  });

  it('frete elegível na entrada: média de R$ 16/kg em A, sem frete em dobro; B igual', () => {
    const { finais, linhas } = aplicarNosSaldos(inicio, [mov('A', 'ENTRADA_COMPRA', 10, 22000), mov('A', 'REQUISICAO', -1, -2000)], LOJAS);
    expect(linhas[1].valorCentavos).toBe(-1600);
    expect(finais.get(chaveDoSaldo('A', 'frango'))!.valorCentavos).toBe(32000 - 1600);
    expect(finais.get(chaveDoSaldo('B', 'frango'))!.valorCentavos).toBe(10000);
  });

  it('loja sem o método ligado: o valor que veio vai para o livro (como sempre foi)', () => {
    const { linhas } = aplicarNosSaldos(inicio, [mov('A', 'REQUISICAO', -4, -8000)], new Set());
    expect(linhas[0].valorCentavos).toBe(-8000);
    expect(linhas[0].valorMetodo).toBeNull();
  });
});

describe('N.1 · bordas da média móvel', () => {
  it('a saída que leva o saldo inteiro leva o valor inteiro (nada de centavo sobrando com quantidade zero)', () => {
    // 3 kg por R$ 10,00: média de R$ 3,333…/kg; três saídas de 1 kg.
    let s: SaldoValorado = saldo(3, 1000);
    const valores: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = valorPelaMediaDaLoja(s, { tipo: 'REQUISICAO', quantidadeMilesimos: -1000, valorCentavos: 0 });
      valores.push(r.valorCentavos);
      s = r.depois;
    }
    expect(valores).toEqual([-333, -334, -333]);
    expect(s).toEqual({ quantidadeMilesimos: 0, valorCentavos: 0, valorIncompleto: false });
  });

  it('entradas − saídas = valor final, ao centavo, com item barato e quantidades quebradas', () => {
    let s: SaldoValorado = saldo(0, 0);
    let entrou = 0;
    let saiu = 0;
    const passos: [number, number][] = [[1.237, 391], [0.013, 0], [2.5, 1003], [-0.333, 0], [-1.111, 0], [0.007, 3], [-0.001, 0], [-2.2, 0], [3.3, 1789], [-3.412, 0]];
    for (const [kg, c] of passos) {
      const m = { tipo: (kg > 0 ? 'ENTRADA_COMPRA' : 'REQUISICAO') as MovimentoNovo['tipo'], quantidadeMilesimos: Math.round(kg * 1000), valorCentavos: c };
      const r = valorPelaMediaDaLoja(s, m);
      if (r.valorCentavos > 0) entrou += r.valorCentavos;
      else saiu -= r.valorCentavos;
      s = r.depois;
    }
    expect(entrou - saiu).toBe(s.valorCentavos);
    expect(s.quantidadeMilesimos).toBe(0);
    expect(s.valorCentavos).toBe(0);
  });

  it('a saída que passa de zero: o saldo inteiro mais o excesso pela mesma média', () => {
    const r = valorPelaMediaDaLoja(saldo(2, 3000), { tipo: 'REQUISICAO', quantidadeMilesimos: -3000, valorCentavos: -9999 });
    expect(r.valorCentavos).toBe(-4500);
    expect(r.metodo).toBe('MEDIA_LOJA');
    expect(r.depois).toEqual({ quantidadeMilesimos: -1000, valorCentavos: -1500, valorIncompleto: false });
  });

  it('saldo já no vermelho: sem média da loja, a saída vai pela referência informada', () => {
    const r = valorPelaMediaDaLoja(saldo(-1, -1500), { tipo: 'REQUISICAO', quantidadeMilesimos: -1000, valorCentavos: -2000 });
    expect(r).toMatchObject({ valorCentavos: -2000, metodo: 'REFERENCIA' });
  });

  it('nunca divide por zero: saldo zero e saída sem referência ficam SEM_CUSTO', () => {
    const r = valorPelaMediaDaLoja(saldo(0, 0), { tipo: 'PERDA', quantidadeMilesimos: -500, valorCentavos: 0, semCusto: true });
    expect(r).toMatchObject({ valorCentavos: 0, metodo: 'SEM_CUSTO' });
    expect(r.depois.valorIncompleto).toBe(true);
  });

  it('custo desconhecido não é zero: a abertura sem custo deixa o saldo incompleto e a saída sem valor', () => {
    const ab = valorPelaMediaDaLoja(saldo(0, 0), { tipo: 'ABERTURA', quantidadeMilesimos: 5000, valorCentavos: 0, semCusto: true });
    expect(ab).toMatchObject({ valorCentavos: 0, metodo: 'SEM_CUSTO', depois: { valorIncompleto: true } });
    const sai = valorPelaMediaDaLoja(ab.depois, { tipo: 'REQUISICAO', quantidadeMilesimos: -2000, valorCentavos: -999 });
    expect(sai).toMatchObject({ valorCentavos: 0, metodo: 'SEM_CUSTO', depois: { quantidadeMilesimos: 3000, valorIncompleto: true } });
    // uma compra com custo não "conserta" sozinha a parte desconhecida: continua incompleto
    const compra = valorPelaMediaDaLoja(sai.depois, { tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: 1000, valorCentavos: 1200 });
    expect(compra.depois.valorIncompleto).toBe(true);
    // zerou: não sobra estoque com custo desconhecido
    const fim = valorPelaMediaDaLoja(compra.depois, { tipo: 'REQUISICAO', quantidadeMilesimos: -4000, valorCentavos: 0 });
    expect(fim.depois).toMatchObject({ quantidadeMilesimos: 0, valorIncompleto: false });
  });

  it('lote com insumo sem custo: entra o valor conhecido e o saldo do pré-preparo fica incompleto', () => {
    const r = valorPelaMediaDaLoja(saldo(0, 0), { tipo: 'PRODUCAO_ENTRADA', quantidadeMilesimos: 2000, valorCentavos: 1800, valorParcial: true });
    expect(r).toMatchObject({ valorCentavos: 1800, metodo: 'INFORMADO', depois: { valorIncompleto: true } });
  });

  it('estorno leva o valor do original, nunca o da média de hoje', () => {
    // entrou 10 kg por R$ 100; depois a média virou R$ 15; o estorno da entrada sai pelos R$ 100 originais.
    const r = valorPelaMediaDaLoja(saldo(20, 30000), { tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: -10000, valorCentavos: -10000, estornoDeId: 'm1' });
    expect(r).toMatchObject({ valorCentavos: -10000, metodo: 'ESTORNO', depois: { quantidadeMilesimos: 10000, valorCentavos: 20000 } });
  });

  it('sobra na contagem vale pela média da loja; sem base, pela referência', () => {
    expect(valorPelaMediaDaLoja(saldo(10, 15000), { tipo: 'CONTAGEM', quantidadeMilesimos: 1000, valorCentavos: 2000 })).toMatchObject({ valorCentavos: 1500, metodo: 'MEDIA_LOJA' });
    expect(valorPelaMediaDaLoja(saldo(0, 0), { tipo: 'CONTAGEM', quantidadeMilesimos: 1000, valorCentavos: 2000 })).toMatchObject({ valorCentavos: 2000, metodo: 'REFERENCIA' });
    expect(valorPelaMediaDaLoja(saldo(10, 15000), { tipo: 'CONTAGEM', quantidadeMilesimos: -1000, valorCentavos: -2000 })).toMatchObject({ valorCentavos: -1500, metodo: 'MEDIA_LOJA' });
  });
});

describe('N.1 · proporção em inteiros', () => {
  it('arredonda ao centavo, metade se afasta do zero, sem ponto flutuante', () => {
    expect(proporcao(1000, 1, 3)).toBe(333);
    expect(proporcao(1000, 2, 3)).toBe(667);
    expect(proporcao(5, 1, 2)).toBe(3);
    expect(proporcao(-5, 1, 2)).toBe(-3);
    expect(proporcao(2_000_000_000, 2_000_000_000, 4_000_000_000)).toBe(1_000_000_000);
    expect(() => proporcao(1, 1, 0)).toThrow();
  });
});
