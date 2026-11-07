import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import oficial from './fixtures/ifood-analytics-test-oficial-20261107.json';
import { conferirEvidenciaAnalyticsTest } from '@/lib/integracoes/ifood/analytics-evidencia';
import { consultaDoDia, consultaDistribuicoes, ErroContratoAnalytics, valorAnalyticsEmCentavos, type UnidadeMonetariaAnalytics } from '@/lib/integracoes/ifood/analytics';
import { diaSeguinte, ontemEmBrasilia, ontemNoFuso } from '@/lib/integracoes/ifood/datas';

// Metadados sintéticos para exercitar o diagnóstico; o corpo é a massa TEST oficial preservada.
const LOJA = '11111111-1111-4111-8111-111111111111';
const REAL: UnidadeMonetariaAnalytics = { moeda: 'BRL', unidade: 'REAL' };
function evidencia() {
  return { quando: '2026-11-07T16:17:51.372Z', dia: '2026-11-06', loja: LOJA, app: { ambiente: 'TEST' },
    passos: [{ nome: 'analytics-do-dia', metodo: 'POST', caminho: `/analytics/v1.0/merchants/${LOJA}/orders/kpis`,
      corpo: consultaDoDia('2026-11-06'), ok: true, status: 200, requestId: 'request-ficticio', resposta: structuredClone(oficial) }] };
}
describe('INT-1.5 · proveniência e diagnóstico de arquivo', () => {
  it('preserva o hash do corpo oficial extraído; não transforma primeira página em dia completo', () => {
    const texto = readFileSync(new URL('./fixtures/ifood-analytics-test-oficial-20261107.json', import.meta.url), 'utf8').trim();
    expect(createHash('sha256').update(texto).digest('hex')).toBe('3c78c4a9bd91d55b14c17de9c6ee3817c93940a0938fee950a62a122ca46f067');
    expect(conferirEvidenciaAnalyticsTest(evidencia())).toMatchObject({ estrutura: 'valida', cobertura: 'incompleto', paginasLidas: 1,
      paginasEsperadas: 5, gruposLidos: 20, gruposEsperados: 91, consultaDiariaCompativel: false, publicado: false });
  });
  it('não confunde prova HTTP com arquivo inválido, outro ambiente, caminho ou consulta', () => {
    const casos = [null, {}, { ...evidencia(), app: { ambiente: 'PRODUCAO' } }, { ...evidencia(), dia: '2026-02-30' }];
    for (const x of casos) expect(() => conferirEvidenciaAnalyticsTest(x)).toThrow(ErroContratoAnalytics);
    for (const alteracao of [{ status: 403 }, { ok: false }, { metodo: 'GET' }, { caminho: `/analytics/v1.0/merchants/22222222-2222-4222-8222-222222222222/orders/kpis` }, { corpo: consultaDoDia('2026-11-05') }, { corpo: { ...consultaDoDia('2026-11-06'), sort: { groupByKey: 'asc' } } }]) {
      const e = evidencia(); Object.assign(e.passos[0], alteracao);
      expect(() => conferirEvidenciaAnalyticsTest(e)).toThrow(ErroContratoAnalytics);
    }
  });
  it('rejeita duas respostas diárias e não inclui texto do corpo em erro', () => {
    const e = evidencia(); e.passos.push(structuredClone(e.passos[0]));
    expect(() => conferirEvidenciaAnalyticsTest(e)).toThrow(/única resposta/);
    expect(() => conferirEvidenciaAnalyticsTest({ token: 'SEGREDO_NAO_EXIBIR' })).toThrow('Arquivo não corresponde à evidência TEST do leitor.');
  });
  it('permite apenas equivalente semântico da consulta registrada, independente da ordem de chaves JSON', () => {
    const e = evidencia(); const c = e.passos[0].corpo;
    e.passos[0].corpo = { size: c.size, page: c.page, agg: c.agg, filter: c.filter };
    expect(conferirEvidenciaAnalyticsTest(e).http).toBe(200);
  });
});
describe('datas e dinheiro na fronteira do contrato', () => {
  it.each(['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '26-11-06', '9999-12-31'])('recusa data inexistente ou fora da faixa: %s', (dia) => {
    expect(diaSeguinte(dia)).toBeNull(); expect(() => consultaDoDia(dia)).toThrow(ErroContratoAnalytics);
  });
  it('bissexto e mudança do ano conservam intervalo civil', () => {
    expect(diaSeguinte('2024-02-29')).toBe('2024-03-01');
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01');
  });
  it('D-1 acompanha o fuso e não a mudança da data UTC', () => {
    const agora = Date.parse('2026-11-07T02:30:00Z');
    expect(ontemEmBrasilia(agora)).toBe('2026-11-05');
    expect(ontemNoFuso(agora, 'UTC')).toBe('2026-11-06');
    expect(ontemEmBrasilia(Date.parse('2026-11-07T03:00:00Z'))).toBe('2026-11-06');
  });
  it('mantém a segunda consulta como distribuições marginais, sem fabricar cruzamento', () => {
    expect(consultaDistribuicoes('2026-11-06').agg).toEqual({ terms: { paymentMethod: ['count'], orderCreationHour: ['count'], customerFirstOrderInMerchant: ['count'] } });
  });
  it.each([0.001, 1e-7, 0.1 + 0.2, -0.001, 1.005])('não decide arredondamento de subcentavos: %s', (n) => expect(() => valorAnalyticsEmCentavos(n, REAL)).toThrow());
  it('recusa números cujo parse já pode ter perdido centavos, ainda que o resultado caiba em inteiro seguro', () => {
    const arredondadoPeloParse = JSON.parse('90071992547409.91');
    expect(() => valorAnalyticsEmCentavos(arredondadoPeloParse, REAL)).toThrow(/precisão decimal/);
    expect(() => valorAnalyticsEmCentavos(2 ** 45, REAL)).toThrow();
    expect(() => valorAnalyticsEmCentavos(-(2 ** 45), REAL)).toThrow();
    expect(valorAnalyticsEmCentavos(2 ** 44, REAL)).toBe(1759218604441600);
  });
  it('converte decimal, expoente, zero e sinal sem parser brasileiro e sem piso/arredondamento', () => {
    expect([274.3, 19.99, 1e-2, -19.99, -0].map((n) => valorAnalyticsEmCentavos(n, REAL))).toEqual([27430, 1999, 1, -1999, 0]);
  });
});
