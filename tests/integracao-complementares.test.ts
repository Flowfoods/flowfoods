import { describe, expect, it } from 'vitest';
import { consultaComplementares, normalizarComplementaresAnalytics, type IdentidadeComplementares } from '@/lib/integracoes/ifood/analytics-complementares';

const id: IdentidadeComplementares = { ambiente: 'TEST', merchantId: '11111111-2222-4333-8444-555555555555', dia: '2026-10-19', fuso: 'America/Sao_Paulo', perfil: 'complementares', versaoContrato: 1 };
const corpo = (horarios: unknown = { value: { '0': 2, '23': 3 } }, primeiros: unknown = { value: { true: 1, false: 4 } }) => ({ data: [{ orderCreationHour: horarios, customerFirstOrderInMerchant: primeiros }], currentPage: 1, size: 1, totalItems: 1, totalPages: 1 });
const ler = (valor: unknown = corpo()) => raw(JSON.stringify(valor));
const raw = (texto: string) => normalizarComplementaresAnalytics(id, [{ identidade: id, paginaSolicitada: 1, versaoContrato: 1, corpoOriginal: texto }]);

describe('INT-1.8D · dois termos marginais exatos', () => {
  it('consulta só os dois termos, sem pagamento, groupBy ou métricas', () => {
    expect(consultaComplementares('2026-10-19')).toEqual({ page: 1, size: 1, filter: { referenceDate: { gte: '2026-10-19', lt: '2026-10-20' } }, agg: { terms: { orderCreationHour: ['count'], customerFirstOrderInMerchant: ['count'] } } });
  });
  it('normaliza ambas sem inferir unicidade nem unir denominadores', () => {
    expect(ler()).toEqual({ versaoContrato: 1, horarios: [{ termo: '0', ocorrencias: '2' }, { termo: '23', ocorrencias: '3' }], primeirosPedidos: [{ termo: 'false', ocorrencias: '4' }, { termo: 'true', ocorrencias: '1' }] });
  });
  it.each([[null, null], [null, { value: {} }], [{ value: {} }, null], [{ value: {} }, { value: {} }]])('ausência de cada distribuição é independente %#', (h, p) => {
    expect(ler(corpo(h, p))).toEqual({ versaoContrato: 1, horarios: h === null ? null : [], primeirosPedidos: p === null ? null : [] });
  });
  it('preserva horas não canônicas, chaves novas/protótipos e zero sem coercão', () => {
    expect(ler(corpo({ value: { '01': 0, '24': 7, ['__proto__']: 2 } }, { value: { TRUE: 4, constructor: 0, 'null': 3, true: 2 } }))).toEqual({
      versaoContrato: 1, horarios: [{ termo: '01', ocorrencias: '0' }, { termo: '24', ocorrencias: '7' }, { termo: '__proto__', ocorrencias: '2' }],
      primeirosPedidos: [{ termo: 'TRUE', ocorrencias: '4' }, { termo: 'constructor', ocorrencias: '0' }, { termo: 'null', ocorrencias: '3' }, { termo: 'true', ocorrencias: '2' }],
    });
  });
  it('MAX_SAFE exato, expoente inteiro e cardinalidade não mudam as contagens', () => {
    const texto = JSON.stringify(corpo({ value: { '9': Number.MAX_SAFE_INTEGER }, cardinality: 400 }, { value: { true: 100 }, cardinality: null })).replace('"true":100', '"true":1e2');
    expect(raw(texto)).toMatchObject({ horarios: [{ termo: '9', ocorrencias: '9007199254740991' }], primeirosPedidos: [{ termo: 'true', ocorrencias: '100' }] });
  });
  it.each(['9007199254740991.1', '1.00000000000000001', '0.0000000000000000001', '9007199254740992', '1e400', '-1'])('recusa léxico numérico original %s', n => {
    expect(() => raw(`{"data":[{"orderCreationHour":{"value":{"9":${n}}},"customerFirstOrderInMerchant":null}],"currentPage":1,"size":1,"totalItems":1,"totalPages":1}`)).toThrow();
  });
  it.each([null, '1', true, 0.5])('recusa contagem não inteira numérica: %j', n => {
    expect(() => ler(corpo({ value: { '9': n } }))).toThrow();
  });
  it.each([
    { data: [{ orderCreationHour: null }] }, { data: [{ customerFirstOrderInMerchant: null }] },
    { data: [{ ...corpo().data[0], paymentMethod: null }] }, { data: [] }, { data: [corpo().data[0], corpo().data[0]] },
    { currentPage: 2 }, { size: 2 }, { totalPages: 2 }, { totalItems: 0 }, { error: { message: 'sem acesso' } },
  ])('recusa envelope ou campos incompatíveis %#', extra => { expect(() => ler({ ...corpo(), ...extra })).toThrow(); });
  it.each([{ value: null }, { value: [], cardinality: 0 }, { value: {}, extra: true }, { value: {}, cardinality: -1 }])('recusa mapa incompatível %#', v => {
    expect(() => ler(corpo(null, v))).toThrow();
  });
  it.each(['{"true":1,"true":2}', '{"true":1,"\\u0074rue":2}'])('recusa chaves repetidas após escapes', mapa => {
    expect(() => raw(`{"data":[{"orderCreationHour":null,"customerFirstOrderInMerchant":{"value":${mapa}}}],"currentPage":1,"size":1,"totalItems":1,"totalPages":1}`)).toThrow();
  });
  it.each(['', '\u0000', '\ud800', 'ç'.repeat(401)])('recusa chave vazia/Unicode/limite %#', termo => {
    expect(() => ler(corpo({ value: { [termo]: 1 } }))).toThrow();
  });
  it('recusa mais de 2000 termos e corpo acima de2MiB', () => {
    expect(() => ler(corpo({ value: Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`novo-${i}`, 1])) }))).toThrow();
    expect(() => raw(' '.repeat(2 * 1024 * 1024) + JSON.stringify(corpo()))).toThrow();
  });
  it('recusa identidade/recibo de outro dia, fuso, perfil ou página', () => {
    for (const identidade of [{ ...id, dia: '0000-01-01' }, { ...id, merchantId: 'invalido' }, { ...id, fuso: 'UTC' }]) {
      expect(() => normalizarComplementaresAnalytics(id, [{ identidade, paginaSolicitada: 1, versaoContrato: 1, corpoOriginal: JSON.stringify(corpo()) }])).toThrow();
    }
    expect(() => normalizarComplementaresAnalytics(id, [])).toThrow();
    expect(() => normalizarComplementaresAnalytics(id, [{ identidade: id, paginaSolicitada: 2, versaoContrato: 1, corpoOriginal: JSON.stringify(corpo()) }])).toThrow();
  });
});
