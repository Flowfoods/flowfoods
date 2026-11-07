import { describe, expect, it } from 'vitest';
import { diaAnalytics, dinheiroAnalytics, instanteAnalytics, percentualAnalytics, quantidadeAnalytics, ticketAnalytics } from '@/components/erp/telas/integracoes/formato-analytics';

describe('INT-1.8B · apresentação exata do Analytics', () => {
  it.each([
    ['0', 'R$ 0,00'], ['1', 'R$ 0,01'], ['-1', '−R$ 0,01'],
    ['9007199254740993', 'R$ 90.071.992.547.409,93'],
    ['-18014398509481986', '−R$ 180.143.985.094.819,86'],
    ['123456789012345678901234567890', 'R$ 1.234.567.890.123.456.789.012.345.678,90'],
  ])('formata %s centavos sem perda em Number', (valor, esperado) => expect(dinheiroAnalytics(valor)).toBe(esperado));

  it('contagem acima de MAX_SAFE e sinal permanecem exatos', () => {
    expect(quantidadeAnalytics('9007199254740993')).toBe('9.007.199.254.740.993');
    expect(quantidadeAnalytics('-9007199254740993')).toBe('−9.007.199.254.740.993');
  });

  it.each([
    ['1', '2', 'R$ 0,01'], ['-1', '2', '−R$ 0,01'], ['-1', '3', 'R$ 0,00'],
    ['9007199254740993', '2', 'R$ 45.035.996.273.704,97'],
    ['-9007199254740993', '2', '−R$ 45.035.996.273.704,97'],
    ['10000', '3', 'R$ 33,33'],
  ])('ticket %s/%s arredonda somente a fração final e simetricamente', (numerador, denominador, esperado) => {
    const fracao = { numerador, denominador };
    expect(ticketAnalytics(fracao)).toBe(esperado);
    expect(fracao).toEqual({ numerador, denominador });
  });

  it('percentual usa razão ponderada e uma casa, sem média de percentuais ou expoente', () => {
    expect(percentualAnalytics({ numerador: '1', denominador: '3' })).toBe('33,3%');
    expect(percentualAnalytics({ numerador: '1', denominador: '2000' })).toBe('0,1%');
    expect(percentualAnalytics({ numerador: '-1', denominador: '2000' })).toBe('−0,1%');
    expect(percentualAnalytics({ numerador: '9007199254740993', denominador: '18014398509481986' })).toBe('50,0%');
    expect(percentualAnalytics({ numerador: '0', denominador: '10' })).toBe('0,0%');
  });

  it.each(['', '01', '-0', '1.2', '1e3', 'NaN', 'Infinity', ' 5'])('recusa inteiro não canônico %j em vez de inventar número', valor => {
    expect(() => dinheiroAnalytics(valor)).toThrow(RangeError);
    expect(() => quantidadeAnalytics(valor)).toThrow(RangeError);
  });

  it.each(['0', '-1'])('zero/negativo no denominador %s não vira 0 nem Infinity', denominador => {
    expect(() => ticketAnalytics({ numerador: '10', denominador })).toThrow(RangeError);
    expect(() => percentualAnalytics({ numerador: '10', denominador })).toThrow(RangeError);
  });

  it('datas civis e instantes são apresentados com semânticas separadas', () => {
    expect(diaAnalytics('2024-02-29')).toBe('29/02/2024');
    expect(instanteAnalytics('2026-11-07T02:30:00Z')).toBe('06/11/2026, 23:30');
    expect(instanteAnalytics('invalido')).toBe('Data não disponível');
  });
});
