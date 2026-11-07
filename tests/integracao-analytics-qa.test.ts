/** QA independente de INT-1.5: puro, sem API, banco, credencial ou publicação. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  conferirConsultaDiaria, conferirPaginasAnalytics, consultaDistribuicoes, consultaDoDia, consultaMinima,
  ErroContratoAnalytics, lerPaginaAnalytics, normalizarDiaAnalytics, somarCentavosAnalytics, valorAnalyticsEmCentavos,
  type BucketAnalytics, type CodigoContratoAnalytics, type IdentidadeAnalytics, type PaginaRecebidaAnalytics, type UnidadeMonetariaAnalytics,
} from '@/lib/integracoes/ifood/analytics';

const REAL = { moeda: 'BRL', unidade: 'REAL' } as const;
const CENTAVO = { moeda: 'BRL', unidade: 'CENTAVO' } as const;
const IDENTIDADE: IdentidadeAnalytics = { ambiente: 'TEST', merchantId: 'aaaa1111-bbbb-2222-cccc-333333333333', dia: '2026-11-06', perfil: 'diario' };
const TEXTO_OFICIAL = readFileSync(new URL('./fixtures/ifood-analytics-test-oficial-20261107.json', import.meta.url), 'utf8').trim();
const OFICIAL: unknown = JSON.parse(TEXTO_OFICIAL);

function recusa(f: () => unknown, codigo: CodigoContratoAnalytics) {
  expect(f).toThrow(ErroContratoAnalytics);
  expect(f).toThrow(expect.objectContaining({ codigo }));
}

/** Fixture SINTÉTICA diária; os nomes QA não provêm da resposta oficial. */
function bucket(id: number, count = 1): BucketAnalytics {
  return {
    groupByKey: { value: { orderStatus: 'CONCLUDED', salesChannel: 'IFOOD', deliveredBy: 'MERCHANT_DELIVERY', category: `QA-${id}` }, count },
    gmv: { sum: 0.1 }, gmvWithoutDelivery: { sum: 0.1 }, netDeliveryFee: { sum: 0 },
    paymentTotalValue: { sum: 0.1 }, benefitByTypePartnerTotalValue: { sum: 0 }, refundedTotalValue: { sum: 0 },
  };
}
function envelope(data: BucketAnalytics[], currentPage = 1, size = data.length, totalItems = data.length, totalPages = data.length ? 1 : 0) {
  return { data, currentPage, size, totalItems, totalPages };
}
function recibo(resposta: unknown, paginaSolicitada = 1, identidade = IDENTIDADE): PaginaRecebidaAnalytics {
  return { identidade: { ...identidade }, paginaSolicitada, resposta };
}
function noventaEUmGrupos(): PaginaRecebidaAnalytics[] {
  return Array.from({ length: 5 }, (_, pagina) => recibo(
    envelope(Array.from({ length: pagina === 4 ? 11 : 20 }, (_v, i) => bucket(pagina * 20 + i)), pagina + 1, 20, 91, 5), pagina + 1,
  ));
}

describe('INT-1.5 QA independente · fixture oficial preservada', () => {
  it('preserva o hash autorizado e aceita20 grupos raw, sem criar category ou métricas ausentes', () => {
    expect(createHash('sha256').update(TEXTO_OFICIAL).digest('hex')).toBe('3c78c4a9bd91d55b14c17de9c6ee3817c93940a0938fee950a62a122ca46f067');
    const p = lerPaginaAnalytics(OFICIAL, 1);
    expect(p).toEqual(OFICIAL);
    expect(p).toMatchObject({ currentPage: 1, size: 20, totalItems: 91, totalPages: 5 });
    expect(p.data).toHaveLength(20);
    expect(p.data[0].groupByKey.value).toEqual({ dayOfWeek: 'WEDNESDAY', deliveredBy: 'MERCHANT_DELIVERY', orderStatus: 'CONCLUDED', paymentMethod: 'VOUCHER', salesChannel: 'IFOOD' });
    for (const b of p.data) {
      expect(b.groupByKey.value).not.toHaveProperty('category');
      for (const k of ['netDeliveryFee', 'paymentTotalValue', 'benefitByTypePartnerTotalValue', 'refundedTotalValue']) expect(b).not.toHaveProperty(k);
    }
    expect(p.data.reduce((s, b) => s + b.groupByKey.count, 0)).toBe(1085);
    expect(p.data[0].gmvWithoutDelivery).toEqual({ sum: 274.3, avg: 137.15 });
  });

  it('página oficial aceita é incompleta e incompatível diária; nunca representa91 pedidos ou snapshot', () => {
    const perfilHomologacao = { ...IDENTIDADE, perfil: 'homologacao' as const };
    const r = recibo(OFICIAL, 1, perfilHomologacao);
    expect(conferirPaginasAnalytics(perfilHomologacao, [r])).toMatchObject({ estado: 'incompleto', paginasLidas: 1, paginasEsperadas: 5, itensLidos: 20, totalItens: 91 });
    const contrato = conferirConsultaDiaria(lerPaginaAnalytics(OFICIAL, 1));
    expect(contrato.compativel).toBe(false);
    expect(contrato.problemas).toEqual([
      'Dimensões diferentes das quatro solicitadas para o dia.',
      'Tipo de dimensão diária incompatível.',
      'Soma solicitada ausente: netDeliveryFee.',
      'Soma solicitada ausente: paymentTotalValue.',
      'Soma solicitada ausente: benefitByTypePartnerTotalValue.',
      'Soma solicitada ausente: refundedTotalValue.',
    ]);
    recusa(() => normalizarDiaAnalytics(perfilHomologacao, [r], REAL), 'CONSULTA_INCOMPATIVEL');
    recusa(() => normalizarDiaAnalytics(IDENTIDADE, [recibo(OFICIAL)], REAL), 'INCOMPLETO');
  });
});

describe('INT-1.5 QA independente · consultas e grão', () => {
  it('dia bissexto e virada do ano têm limites exclusivos corretos e métricas/grão explícitos, sem sort', () => {
    const q = consultaDoDia('2024-02-29', 3, 20);
    expect(q).toEqual({
      filter: { referenceDate: { gte: '2024-02-29', lt: '2024-03-01' } },
      agg: { groupBy: { fields: ['orderStatus', 'salesChannel', 'deliveredBy', 'category'] }, metrics: {
        gmv: ['sum'], gmvWithoutDelivery: ['sum'], netDeliveryFee: ['sum'], paymentTotalValue: ['sum'], benefitByTypePartnerTotalValue: ['sum'], refundedTotalValue: ['sum'],
      } }, page: 3, size: 20,
    });
    expect(consultaDoDia('2026-12-31').filter.referenceDate.lt).toBe('2027-01-01');
    expect(consultaMinima('2026-11-06').agg).toEqual({ metrics: { gmv: ['sum'] }, terms: { orderStatus: ['count'] } });
    expect(consultaDistribuicoes('2026-11-06').agg).toEqual({ terms: { paymentMethod: ['count'], orderCreationHour: ['count'], customerFirstOrderInMerchant: ['count'] } });
    for (const consulta of [q, consultaMinima('2026-11-06'), consultaDistribuicoes('2026-11-06')]) expect(consulta).not.toHaveProperty('sort');
  });

  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '0000-01-01', '9999-12-31'])('não normaliza data inválida %s', dia => {
    for (const construir of [consultaDoDia, consultaMinima, consultaDistribuicoes]) recusa(() => construir(dia), 'DATA');
  });

  it.each([[0, 20], [1.5, 20], [1001, 20], [1, 0], [1, 10001], [1, NaN]])('recusa paginação solicitada inválida %s/%s', (page, size) => {
    recusa(() => consultaDoDia('2026-11-06', page, size), 'PARAMETROS');
  });

  it('enums novos sobrevivem, sem atribuir rótulo conhecido ou descartar a receita', () => {
    const b = bucket(1, 3);
    b.groupByKey.value = { orderStatus: 'FUTURE_STATUS', salesChannel: 'FUTURE_CHANNEL', deliveredBy: 'FUTURE_LOGISTICS', category: 'FUTURE_CATEGORY' };
    const p = lerPaginaAnalytics(envelope([b]), 1);
    expect(conferirConsultaDiaria(p)).toEqual({ compativel: true, problemas: [] });
    const dia = normalizarDiaAnalytics(IDENTIDADE, [recibo(p)], REAL);
    expect(dia.linhas[0].dimensoes).toEqual(b.groupByKey.value);
    expect(dia.pedidos).toBe(3);
    expect(dia.identidade.ambiente).toBe('TEST');
  });

  it('dimensão adicional altera o grão: raw preserva, diário recusa', () => {
    const b = bucket(1);
    b.groupByKey.value.paymentMethod = 'FUTURE_PAYMENT';
    b.novaMetrica = { sum: 123.4567 };
    const p = lerPaginaAnalytics(envelope([b]), 1);
    expect(p.data[0]).toEqual(b);
    expect(conferirConsultaDiaria(p).compativel).toBe(false);
    recusa(() => normalizarDiaAnalytics(IDENTIDADE, [recibo(p)], REAL), 'CONSULTA_INCOMPATIVEL');
  });
});

describe('INT-1.5 QA independente · completude e recibos', () => {
  it('prefixo4/5 não basta; quinta página fecha91grupos sem depender da ordem de chaves', () => {
    const recebidas = noventaEUmGrupos();
    expect(conferirPaginasAnalytics(IDENTIDADE, recebidas.slice(0, 4))).toMatchObject({ estado: 'incompleto', paginasLidas: 4, itensLidos: 80, totalItens: 91 });
    recusa(() => normalizarDiaAnalytics(IDENTIDADE, recebidas.slice(0, 4), REAL), 'INCOMPLETO');
    expect(conferirPaginasAnalytics(IDENTIDADE, recebidas)).toMatchObject({ estado: 'completo', paginasLidas: 5, paginasEsperadas: 5, itensLidos: 91, totalItens: 91 });
    const dia = normalizarDiaAnalytics(IDENTIDADE, recebidas, REAL);
    expect(dia.linhas).toHaveLength(91);
    expect(dia.pedidos).toBe(91);
    expect(somarCentavosAnalytics(dia.linhas.map(l => l.centavos.gmv))).toBe(910);
  });

  it('pedidos vêm de count2+3=5, não dos2buckets/totalItems', () => {
    const dia = normalizarDiaAnalytics(IDENTIDADE, [recibo(envelope([bucket(1, 2), bucket(2, 3)]))], REAL);
    expect(dia.pedidos).toBe(5);
    expect(dia.linhas.map(l => l.pedidos)).toEqual([2, 3]);
  });

  it('vazio explícito é diferente de nenhuma resposta ou página curta', () => {
    expect(conferirPaginasAnalytics(IDENTIDADE, [])).toMatchObject({ estado: 'incompleto', totalItens: null, paginasEsperadas: null });
    recusa(() => normalizarDiaAnalytics(IDENTIDADE, [], REAL), 'INCOMPLETO');
    const vazio = recibo(envelope([]));
    expect(normalizarDiaAnalytics(IDENTIDADE, [vazio], REAL)).toEqual({ identidade: IDENTIDADE, estado: 'vazio-oficial', linhas: [], pedidos: 0 });
    recusa(() => conferirPaginasAnalytics(IDENTIDADE, [recibo(envelope([], 1, 20, 91, 5))]), 'PAGINACAO');
  });

  it.each([100, 500, 10000])('vazio oficial com size solicitado%s continua vazio explícito', size => {
    const vazio = recibo(envelope([], 1, size, 0, 0));
    expect(normalizarDiaAnalytics(IDENTIDADE, [vazio], REAL)).toEqual({ identidade: IDENTIDADE, estado: 'vazio-oficial', linhas: [], pedidos: 0 });
  });

  it('repetir página não avança, pular/reordenar páginas não fecha o conjunto', () => {
    const paginas = noventaEUmGrupos();
    recusa(() => conferirPaginasAnalytics(IDENTIDADE, [paginas[0], paginas[0]]), 'PAGINA_REPETIDA');
    recusa(() => conferirPaginasAnalytics(IDENTIDADE, [paginas[0], paginas[2]]), 'PAGINACAO');
    recusa(() => conferirPaginasAnalytics(IDENTIDADE, [paginas[1], paginas[0]]), 'PAGINACAO');
  });

  it('o mesmo grupo em páginas diferentes é detectado mesmo reordenando suas chaves', () => {
    const um = bucket(1);
    const repetido = bucket(2);
    repetido.groupByKey.value = { category: 'QA-1', deliveredBy: 'MERCHANT_DELIVERY', salesChannel: 'IFOOD', orderStatus: 'CONCLUDED' };
    recusa(() => conferirPaginasAnalytics(IDENTIDADE, [recibo(envelope([um], 1, 1, 2, 2)), recibo(envelope([repetido], 2, 1, 2, 2), 2)]), 'GRUPO_REPETIDO');
  });

  it.each([
    { ambiente: 'PRODUCAO' as const }, { merchantId: 'dddd4444-eeee-5555-ffff-666666666666' }, { dia: '2026-11-05' }, { perfil: 'homologacao' as const },
  ])('recibo de outra identidade não entra no conjunto: %j', troca => {
    const paginas = noventaEUmGrupos();
    paginas[1] = { ...paginas[1], identidade: { ...IDENTIDADE, ...troca } };
    recusa(() => conferirPaginasAnalytics(IDENTIDADE, paginas), 'IDENTIDADE');
  });

  it.each([{ totalItems: 92 }, { totalPages: 6 }, { size: 19 }, { currentPage: 3 }])('metadados mistos não parecem completos: %j', troca => {
    const paginas = noventaEUmGrupos();
    paginas[1] = { ...paginas[1], resposta: { ...(paginas[1].resposta as object), ...troca } };
    recusa(() => conferirPaginasAnalytics(IDENTIDADE, paginas), 'PAGINACAO');
  });

  it('página truncada e última página com linhas faltantes não viram cobertura', () => {
    const paginas = noventaEUmGrupos();
    paginas[0] = recibo(envelope(Array.from({ length: 19 }, (_, i) => bucket(i)), 1, 20, 91, 5));
    recusa(() => conferirPaginasAnalytics(IDENTIDADE, paginas), 'PAGINACAO');
    const ultima = noventaEUmGrupos();
    ultima[4] = recibo(envelope(Array.from({ length: 10 }, (_, i) => bucket(80 + i)), 5, 20, 91, 5), 5);
    recusa(() => conferirPaginasAnalytics(IDENTIDADE, ultima), 'PAGINACAO');
  });

  it('marcar um diagnóstico incompleto como completo não contorna revalidação dos recibos', () => {
    const diagnostico = conferirPaginasAnalytics(IDENTIDADE, noventaEUmGrupos().slice(0, 1));
    diagnostico.estado = 'completo';
    recusa(() => normalizarDiaAnalytics(IDENTIDADE, diagnostico as unknown as PaginaRecebidaAnalytics[], REAL), 'PAGINACAO');
  });

  it('corpo com erro e count inválido recusam, sem fabricar zero', () => {
    recusa(() => lerPaginaAnalytics({ ...envelope([bucket(1)]), error: { code: 'ANY_ERROR' } }, 1), 'ESQUEMA');
    for (const count of [null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const b = bucket(1);
      const resposta = envelope([{ ...b, groupByKey: { ...b.groupByKey, count } } as unknown as BucketAnalytics]);
      recusa(() => lerPaginaAnalytics(resposta, 1), 'ESQUEMA');
    }
  });
});

describe('INT-1.5 QA independente · dinheiro sem arredondamento implícito', () => {
  it('0.1+0.2 em origem viram10+20=30centavos;1.15 não perde um centavo', () => {
    expect([0.1, 0.2, 1.15, 0.29, -0.29].map(v => valorAnalyticsEmCentavos(v, REAL))).toEqual([10, 20, 115, 29, -29]);
    expect(somarCentavosAnalytics([valorAnalyticsEmCentavos(0.1, REAL), valorAnalyticsEmCentavos(0.2, REAL)])).toBe(30);
    recusa(() => valorAnalyticsEmCentavos(0.1 + 0.2, REAL), 'PRECISAO_MONETARIA');
  });

  it('unidade explícita muda100reais→10000 e100centavos→100; ausência não ganha default', () => {
    expect(valorAnalyticsEmCentavos(100, REAL)).toBe(10000);
    expect(valorAnalyticsEmCentavos(100, CENTAVO)).toBe(100);
    for (const unidade of [undefined, null, {}, { moeda: 'USD', unidade: 'REAL' }, { moeda: 'BRL', unidade: 'REAL_INFERIDO' }]) {
      recusa(() => valorAnalyticsEmCentavos(100, unidade as UnidadeMonetariaAnalytics), 'UNIDADE_MONETARIA');
    }
  });

  it('null, ausência e zero são estados diferentes em métricas e soma', () => {
    expect(valorAnalyticsEmCentavos(null, REAL)).toBeNull();
    expect(valorAnalyticsEmCentavos(0, REAL)).toBe(0);
    recusa(() => valorAnalyticsEmCentavos(undefined, REAL), 'PRECISAO_MONETARIA');
    const b = bucket(1);
    b.gmv = null;
    b.gmvWithoutDelivery = { sum: null };
    const dia = normalizarDiaAnalytics(IDENTIDADE, [recibo(envelope([b]))], REAL);
    expect(dia.linhas[0].centavos).toEqual({ gmv: null, gmvWithoutDelivery: null, netDeliveryFee: 0, paymentTotalValue: 10, benefitByTypePartnerTotalValue: 0, refundedTotalValue: 0 });
    expect(somarCentavosAnalytics([0, null, 10])).toBeNull();
    expect(somarCentavosAnalytics([0, 0])).toBe(0);
    delete b.refundedTotalValue;
    const p = lerPaginaAnalytics(envelope([b]), 1);
    expect(p.data[0]).not.toHaveProperty('refundedTotalValue');
    recusa(() => normalizarDiaAnalytics(IDENTIDADE, [recibo(p)], REAL), 'CONSULTA_INCOMPATIVEL');
  });

  it('somente avg não substitui sum; sum subcentavo é recusado e avg extra é preservada', () => {
    const b = bucket(1);
    b.gmv = { avg: 1.25 };
    recusa(() => normalizarDiaAnalytics(IDENTIDADE, [recibo(envelope([b]))], REAL), 'CONSULTA_INCOMPATIVEL');
    b.gmv = { sum: 1.005, avg: 0.5025 };
    expect(lerPaginaAnalytics(envelope([b]), 1).data[0].gmv).toEqual({ sum: 1.005, avg: 0.5025 });
    recusa(() => normalizarDiaAnalytics(IDENTIDADE, [recibo(envelope([b]))], REAL), 'PRECISAO_MONETARIA');
  });

  it.each([0.001, -0.001, 1.005, 1e-7])('rejeita subcentavo %s sem arredondar para zero/centavo', valor => {
    recusa(() => valorAnalyticsEmCentavos(valor, REAL), 'PRECISAO_MONETARIA');
  });

  it.each([NaN, Infinity, -Infinity, '1.23', '', false])('recusa valor monetário inválido %s', valor => {
    recusa(() => valorAnalyticsEmCentavos(valor, REAL), 'PRECISAO_MONETARIA');
  });

  it('centavos inteiros no limite seguro são preservados; overflow individual e soma recusam', () => {
    expect(valorAnalyticsEmCentavos(Number.MAX_SAFE_INTEGER, CENTAVO)).toBe(Number.MAX_SAFE_INTEGER);
    expect(valorAnalyticsEmCentavos(Number.MIN_SAFE_INTEGER, CENTAVO)).toBe(Number.MIN_SAFE_INTEGER);
    recusa(() => valorAnalyticsEmCentavos(Number.MAX_SAFE_INTEGER + 1, CENTAVO), 'PRECISAO_MONETARIA');
    recusa(() => valorAnalyticsEmCentavos(1e308, REAL), 'LIMITE_NUMERICO');
    recusa(() => somarCentavosAnalytics([Number.MAX_SAFE_INTEGER, 1]), 'LIMITE_NUMERICO');
    expect(somarCentavosAnalytics([Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1])).toBe(1);
  });

  it('REAL no limite±2**45 é recusado antes de confiar em centavos já perdidos pelo Number', () => {
    const arredondadoPeloJson: unknown = JSON.parse('90071992547409.91');
    expect(arredondadoPeloJson).toBe(90071992547409.9);
    for (const valor of [arredondadoPeloJson, 2 ** 45, -(2 ** 45)]) {
      expect(() => valorAnalyticsEmCentavos(valor, REAL)).toThrow(ErroContratoAnalytics);
    }
    expect(valorAnalyticsEmCentavos(35184372088831.99, REAL)).toBe(3518437208883199);
    expect(valorAnalyticsEmCentavos(-35184372088831.99, REAL)).toBe(-3518437208883199);
    expect(valorAnalyticsEmCentavos(Number.MAX_SAFE_INTEGER, CENTAVO)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('soma dos pedidos também recusa overflow em vez de arredondar contagem', () => {
    const resposta = envelope([bucket(1, Number.MAX_SAFE_INTEGER), bucket(2, 1)]);
    recusa(() => normalizarDiaAnalytics(IDENTIDADE, [recibo(resposta)], REAL), 'LIMITE_NUMERICO');
  });
});
