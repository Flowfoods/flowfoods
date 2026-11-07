import { describe, expect, it } from 'vitest';
import { conferirIdentidadePagamentos, consultaPagamentos, normalizarPagamentosAnalytics, type IdentidadePagamentos, type ReciboPagamentos } from '@/lib/integracoes/ifood/analytics-pagamentos';

const identidade: IdentidadePagamentos = { ambiente: 'TEST', merchantId: '11111111-2222-4333-8444-555555555555', dia: '2026-11-06', fuso: 'America/Sao_Paulo', perfil: 'pagamentos', versaoContrato: 1 };
const raw = (mapa: string) => `{"data":[{"paymentMethod":${mapa}}],"currentPage":1,"size":1,"totalItems":1,"totalPages":1}`;
const recibo = (corpoOriginal: string): ReciboPagamentos => ({ identidade, paginaSolicitada: 1, versaoContrato: 1, corpoOriginal });
const ler = (texto: string) => normalizarPagamentosAnalytics(identidade, [recibo(texto)]);

describe('INT-1.8C · contrato marginal de pagamentos, somente bytes sintéticos', () => {
  it('monta terms completo sobre o dia, sem groupBy, recorte comercial ou pedido de receita', () => {
    expect(consultaPagamentos('2024-02-29')).toEqual({ page: 1, size: 1, filter: { referenceDate: { gte: '2024-02-29', lt: '2024-03-01' } }, agg: { terms: { paymentMethod: ['count'] } } });
    for (const dia of ['0000-01-01', '2026-02-30', '9999-12-31', '2026-1-1']) expect(() => consultaPagamentos(dia)).toThrow();
  });
  it('preserva contagens exatas, zero e métodos desconhecidos/protótipos como valores', () => {
    const lido = ler(raw('{"value":{"PIX":7,"__proto__":9007199254740991,"constructor":0,"null":2," Novo ":3}}'));
    expect(lido).toEqual({ versaoContrato: 1, parcelas: [
      { metodo: ' Novo ', ocorrencias: '3' }, { metodo: 'PIX', ocorrencias: '7' },
      { metodo: '__proto__', ocorrencias: '9007199254740991' }, { metodo: 'constructor', ocorrencias: '0' }, { metodo: 'null', ocorrencias: '2' },
    ] });
  });
  it('não confunde agregado ausente, mapa vazio e zero explícito; cardinality não vira denominador', () => {
    expect(ler(raw('null')).parcelas).toBeNull();
    expect(ler(raw('{"value":{}}')).parcelas).toEqual([]);
    expect(ler(raw('{"value":{"PIX":0},"cardinality":987}')).parcelas).toEqual([{ metodo: 'PIX', ocorrencias: '0' }]);
    expect(ler(raw('{"value":{"PIX":2},"cardinality":null}')).parcelas).toEqual([{ metodo: 'PIX', ocorrencias: '2' }]);
  });
  it.each(['9007199254740991.1', '1.00000000000000001', '0.00000000000000000000000000000000001', '1e-999', '1e999', '9007199254740992', '-1', 'null', '"2"', 'true'])('recusa contagem literal %s sem arredondar pelo JSON da fixture', numero => {
    expect(() => ler(raw(`{"value":{"PIX":${numero}}}`))).toThrow();
  });
  it('aceita somente representações numéricas exatamente inteiras e normaliza sem notação exponencial', () => {
    expect(ler(raw('{"value":{"A":1.0,"B":1e3,"C":0e-5}}')).parcelas).toEqual([
      { metodo: 'A', ocorrencias: '1' }, { metodo: 'B', ocorrencias: '1000' }, { metodo: 'C', ocorrencias: '0' },
    ]);
    expect(() => ler(raw('{"value":{"PIX":1}}').replace('"size":1', '"size":1.00000000000000001'))).toThrow();
    expect(() => ler(raw('{"value":{"PIX":1},"cardinality":1.00000000000000001}'))).toThrow();
  });
  it.each([
    '{"value":{"PIX":1,"PIX":2}}', '{"value":{"PIX":1,"\\u0050IX":2}}',
    '{"value":{"PIX":1},"value":{"PIX":2}}', '{"value":{"":1}}',
    '{"value":{"\\u0000":1}}', '{"value":{"\\ud800":1}}', '{"value":[]}', '{"value":{"PIX":1},"outro":1}',
  ])('recusa duplicata/shape/chave inválida: %s', agregado => expect(() => ler(raw(agregado))).toThrow());
  it('recusa duplicata de envelope mesmo quando o JSON.parse conservaria o valor desejado', () => {
    expect(() => ler(raw('{"value":{"PIX":1}}').replace('"currentPage":1', '"currentPage":8,"currentPage":1'))).toThrow();
  });
  it('limita quantidade e bytes UTF-8 sem cortar chaves', () => {
    const mapa = Object.fromEntries(Array.from({ length: 2000 }, (_, n) => [`M${n}`, 1]));
    expect(ler(raw(JSON.stringify({ value: mapa }))).parcelas).toHaveLength(2000);
    expect(() => ler(raw(JSON.stringify({ value: { ...mapa, extra: 1 } })))).toThrow();
    expect(ler(raw(JSON.stringify({ value: { ['ç'.repeat(400)]: 1 } }))).parcelas).toHaveLength(1);
    expect(() => ler(raw(JSON.stringify({ value: { ['ç'.repeat(401)]: 1 } })))).toThrow();
    expect(() => ler(' '.repeat(2 * 1024 * 1024) + raw('null'))).toThrow();
  });
  it.each(['[]', '{}', '{"data":[]}', raw('{"value":{"PIX":1}}').replace('"totalPages":1', '"totalPages":2'),
    raw('{"value":{"PIX":1}}').replace('"size":1', '"size":20'), raw('{"value":{"PIX":1}}').replace('"paymentMethod":', '"groupByKey":')])('não aceita fragmento agrupado ou envelope incompleto', texto => expect(() => ler(texto)).toThrow());
  it('recusa página duplicada, versão divergente e todas as dimensões de identidade trocadas', () => {
    const r = recibo(raw('null'));
    expect(() => normalizarPagamentosAnalytics(identidade, [r, r])).toThrow();
    expect(() => normalizarPagamentosAnalytics(identidade, [{ ...r, paginaSolicitada: 2 }])).toThrow();
    for (const alteracao of [{ ambiente: 'PRODUCAO' }, { merchantId: '22222222-2222-4333-8444-555555555555' }, { dia: '2026-11-05' }, { fuso: 'UTC' }, { versaoContrato: 2 }]) {
      expect(() => normalizarPagamentosAnalytics(identidade, [{ ...r, identidade: { ...identidade, ...alteracao } as IdentidadePagamentos }])).toThrow();
    }
    expect(() => conferirIdentidadePagamentos({ ...identidade, fuso: 'inexistente' })).toThrow();
    expect(() => conferirIdentidadePagamentos({ ...identidade, merchantId: 'NAO-UUID' })).toThrow();
  });
});
