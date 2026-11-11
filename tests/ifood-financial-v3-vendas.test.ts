import { describe, expect, it } from 'vitest';
import { ErroVendasV3, lerPaginaVendasV3 } from '@/lib/integracoes/ifood/financial-v3-vendas';

const merchantId = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const pedido = { merchantId, inicio: '2026-10-05', fim: '2026-10-11', page: 1 };
const envelope = (campos: Record<string, unknown> = {}) => ({
  page: 1, size: 100, total: 0, pageCount: 0, beginSalesDate: pedido.inicio, endSalesDate: pedido.fim, sales: [], ...campos,
});
const ler = (campos: Record<string, unknown> = {}) => lerPaginaVendasV3(JSON.stringify(envelope(campos)), pedido);
const erro = (codigo: string) => expect.objectContaining({ name: 'ErroVendasV3', codigo });
const identificada = { id: 'pedido/sintético:001', merchant: { id: merchantId.toUpperCase() } };
const venda = (campos: Record<string, unknown> = {}) => ler({ total: 1, pageCount: 1, sales: [{ ...identificada, ...campos }] }).vendas[0];

describe('Página de vendas Financial v3', () => {
  it('lê uma página vazia em objeto e no exemplo em lista unitária', () => {
    expect(ler()).toEqual({
      formato: 'OBJETO', page: 1, size: 100, total: 0, pageCount: 0, inicio: pedido.inicio, fim: pedido.fim, vendas: [],
    });
    expect(lerPaginaVendasV3(JSON.stringify([envelope({ pageCount: 1 })]), pedido)).toMatchObject({
      formato: 'ARRAY_UNITARIO', pageCount: 1, vendas: [],
    });
  });

  it.each(['page', 'size', 'beginSalesDate', 'endSalesDate', 'sales', 'total', 'pageCount'])(
    'exige o campo documentado %s', campo => {
      expect(() => ler({ [campo]: undefined })).toThrow(erro('ESTRUTURA'));
    },
  );

  it('confere o eco do intervalo e da página', () => {
    expect(() => ler({ beginSalesDate: '2026-10-04' })).toThrow(erro('PERIODO_DIVERGENTE'));
    expect(() => ler({ endSalesDate: '2026-10-13' })).toThrow(erro('PERIODO_DIVERGENTE'));
    expect(() => ler({ endSalesDate: '2026-02-29' })).toThrow(erro('ESTRUTURA'));
    expect(() => ler({ page: 0 })).toThrow(erro('PAGINACAO'));
    expect(() => ler({ page: 2 })).toThrow(erro('PAGINACAO'));
  });

  it('aceita size zero em páginas vazias com total zero ou positivo, e recusa vendas que excedem size', () => {
    expect(ler({ size: 0 })).toMatchObject({ size: 0, total: 0, vendas: [] });
    const p = JSON.stringify(envelope({ page: 2, size: 0, total: 4, pageCount: 3 }));
    expect(lerPaginaVendasV3(p, { ...pedido, page: 2 })).toMatchObject({ size: 0, total: 4, pageCount: 3, vendas: [] });
    expect(() => ler({ size: 0, total: 1, pageCount: 1, sales: [identificada] })).toThrow(erro('PAGINACAO'));
  });

  it.each([[], [envelope(), envelope()], [null], null, { data: envelope() }].map(resposta => [resposta] as const))(
    'recusa a resposta ambígua ou sem envelope de venda (%#)', resposta => {
      expect(() => lerPaginaVendasV3(JSON.stringify(resposta), pedido)).toThrow(ErroVendasV3);
    },
  );

  it('confere a entrada de consulta antes de aceitar uma página vazia', () => {
    for (const campos of [{ merchantId: 'inválido' }, { inicio: '2026-02-30' }, { fim: '2026-10-04' }, { page: 0 }, { page: 1.2 }]) {
      expect(() => lerPaginaVendasV3(JSON.stringify(envelope()), { ...pedido, ...campos })).toThrow(erro('PEDIDO'));
    }
  });

  it.each(['1.000000000000000000000000001', '1e-50000', '9007199254740992', '1e50000', '-1', '0.001'])(
    'recusa contador não representável como inteiro seguro (%s)', valor => {
      const corpo = JSON.stringify(envelope()).replace('"size":100', '"size":' + valor);
      expect(() => lerPaginaVendasV3(corpo, pedido)).toThrow(erro('PAGINACAO'));
    },
  );

  it('aceita notação equivalente nos contadores sem arredondar', () => {
    const corpo = JSON.stringify(envelope()).replace('"size":100', '"size":1.00e2').replace('"total":0', '"total":-0.000');
    expect(lerPaginaVendasV3(corpo, pedido)).toMatchObject({ total: 0, size: 100 });
  });

  it('mantém o erro sanitizado em JSON inválido ou com chaves duplicadas', () => {
    for (const texto of ['dado-sintetico-sem-json', '{"sales":[],"sales":"dado-sintetico"}']) {
      expect(() => lerPaginaVendasV3(texto, pedido)).toThrow(erro('JSON_INVALIDO'));
      expect(() => lerPaginaVendasV3(texto, pedido)).not.toThrow(/dado-sintetico/);
    }
  });

  it('lê os campos documentados sem inferir receita, taxa, moeda, recebimento ou data local', () => {
    const r = venda({
      shortId: '0010', createdAt: '2026-10-04T22:15:59.123456-03:00', type: 'TIPO', category: 'CATEGORIA',
      salesChannel: 'CANAL', currentStatus: 'ESTADO',
      saleGrossValue: { bag: '55.20', deliveryFee: 0, serviceFee: '1.00' },
      billingSummary: { saleBalance: 71.19, billingEntries: [{ name: 'FUTURO', value: '-20.30' }, { name: 'FUTURO', value: 0 }] },
      payments: { methods: [
        { method: 'METODO', type: 'TIPO', currency: 'XTS', liability: 'ENTIDADE', value: 5.03 },
        { value: '100.0700' },
      ] },
    });
    expect(r).toEqual({
      id: identificada.id, numeroCurto: '0010', criadaEm: '2026-10-04T22:15:59.123456-03:00',
      tipo: 'TIPO', categoria: 'CATEGORIA', canal: 'CANAL', estado: 'ESTADO',
      valorBruto: { itensCentavos: 5520n, entregaCentavos: 0n, servicoCentavos: 100n },
      faturamento: { saldoVendaCentavos: 7119n, lancamentos: [{ nome: 'FUTURO', valorCentavos: -2030n }, { nome: 'FUTURO', valorCentavos: 0n }] },
      metodosPagamento: [
        { metodo: 'METODO', tipo: 'TIPO', moeda: 'XTS', responsabilidade: 'ENTIDADE', valorCentavos: 503n },
        { metodo: null, tipo: null, moeda: null, responsabilidade: null, valorCentavos: 10007n },
      ],
    });
  });

  it('preserva ausências de objetos, valores e listas, incluindo lista vazia e zero explícito', () => {
    expect(venda()).toEqual({
      id: identificada.id, numeroCurto: null, criadaEm: null, tipo: null, categoria: null, canal: null, estado: null,
      valorBruto: null, faturamento: null, metodosPagamento: null,
    });
    expect(venda({ saleGrossValue: {}, billingSummary: {}, payments: {} })).toMatchObject({
      valorBruto: { itensCentavos: null, entregaCentavos: null, servicoCentavos: null },
      faturamento: { saldoVendaCentavos: null, lancamentos: null }, metodosPagamento: null,
    });
    expect(venda({ billingSummary: { saleBalance: '0', billingEntries: [] }, payments: { methods: [] } })).toMatchObject({
      faturamento: { saldoVendaCentavos: 0n, lancamentos: [] }, metodosPagamento: [],
    });
  });

  it('mantém precisão de centavos maiores que Number e do token exponencial do exemplo numérico', () => {
    const sales = [{ ...identificada, saleGrossValue: { bag: 31, deliveryFee: '9007199254740993123.45', serviceFee: 51 } }];
    const texto = JSON.stringify(envelope({ total: 1, pageCount: 1, sales }))
      .replace('"bag":31', '"bag":9007199254740993123.45').replace('"serviceFee":51', '"serviceFee":-1.25e2');
    expect(lerPaginaVendasV3(texto, pedido).vendas[0].valorBruto).toEqual({
      itensCentavos: 900719925474099312345n, entregaCentavos: 900719925474099312345n, servicoCentavos: -12500n,
    });
  });

  it('omite dados extras de merchant, cliente, cartão, transação, eventos e cancelamento em todos os níveis', () => {
    const privado = 'dado-sintetico-privado';
    expect(venda({
      merchant: { id: merchantId, name: privado, document: privado }, customer: { id: privado }, events: [privado], cancellation: privado,
      saleGrossValue: { total: privado }, billingSummary: { billingEntries: [{ document: privado }] },
      payments: { methods: [{ card: privado, account: privado, transactionId: privado }] },
    })).toEqual({
      ...venda(), valorBruto: { itensCentavos: null, entregaCentavos: null, servicoCentavos: null },
      faturamento: { saldoVendaCentavos: null, lancamentos: [{ nome: null, valorCentavos: null }] },
      metodosPagamento: [{ metodo: null, tipo: null, moeda: null, responsabilidade: null, valorCentavos: null }],
    });
  });

  it('confere a loja de todas as vendas e recusa identidade ausente mesmo se o restante da página é válido', () => {
    const outraVenda = { ...identificada, id: 'outra', merchant: { id: 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb' } };
    expect(() => ler({ total: 2, pageCount: 1, sales: [identificada, outraVenda] })).toThrow(erro('MERCHANT_DIVERGENTE'));
    for (const campos of [{ id: '' }, { id: '  ' }, { id: undefined }, { id: 7 }, { merchant: undefined }, { merchant: {} }, { merchant: { id: 2 } }]) {
      expect(() => venda(campos)).toThrow(erro('ESTRUTURA'));
    }
  });

  it.each([
    [{ createdAt: '2026-10-06' }, 'ESTRUTURA'], [{ createdAt: '2026-10-06T15:00:00' }, 'ESTRUTURA'],
    [{ createdAt: '2026-02-30T05:00:00Z' }, 'ESTRUTURA'], [{ createdAt: '2026-10-06T24:00:00Z' }, 'ESTRUTURA'],
    [{ shortId: 1 }, 'ESTRUTURA'], [{ type: 'x'.repeat(257) }, 'LIMITE_LOCAL'], [{ billingSummary: [] }, 'ESTRUTURA'],
    [{ saleGrossValue: { bag: {} } }, 'VALOR_MONETARIO'], [{ saleGrossValue: { serviceFee: '1e2' } }, 'VALOR_MONETARIO'],
    [{ billingSummary: { saleBalance: '0,01' } }, 'VALOR_MONETARIO'], [{ billingSummary: { billingEntries: false } }, 'ESTRUTURA'],
    [{ billingSummary: { billingEntries: [{ value: '1.001' }] } }, 'SUBCENTAVO'],
    [{ payments: { methods: [{ value: 1.001 }] } }, 'SUBCENTAVO'], [{ payments: { methods: [false] } }, 'ESTRUTURA'],
  ] as const)('recusa campo inválido com erro sanitizado (%#)', (campos, codigo) => {
    expect(() => venda(campos)).toThrow(erro(codigo));
  });

  it('limita o total cumulativo de vendas, lançamentos e meios por página', () => {
    const itens = Array.from({ length: 5000 }, () => ({}));
    expect(() => venda({ billingSummary: { billingEntries: itens }, payments: { methods: itens } })).toThrow(erro('LIMITE_LOCAL'));
  });
});
