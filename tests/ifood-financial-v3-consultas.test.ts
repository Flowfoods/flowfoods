import { describe, expect, it, vi } from 'vitest';
import { consultarAntecipacoesFinancialV3, consultarEventosFinancialV3, consultarLiquidacoesFinancialV3, consultarVendasFinancialV3 } from '../src/lib/integracoes/ifood/financial-v3-consultas';
import { lerJsonFinancialV3, NumeroJsonFinancial } from '../src/lib/integracoes/ifood/financial-v3-json';
import type { PedidoHttp, Transporte } from '../src/lib/integracoes/ifood/transporte';

const pedido = { merchantId: '00000000-0000-4000-8000-000000000001', inicio: '2026-02-01', fim: '2026-02-28' };
const resposta = (corpo: unknown, status = 200) => ({ status, cabecalhos: {}, corpo: JSON.stringify(corpo) });
const evento = { name: 'ORDER_COMMISSION', amount: { value: '-3.00' }, hasTransferImpact: true };
const pagina = (page: number, hasNextPage: boolean) => ({ page, size: 100, hasNextPage, financialEvents: [evento] });
const liquidacao = { merchantId: pedido.merchantId, beginDate: pedido.inicio, endDate: pedido.fim, balance: 0, settlements: [] };

describe('clientes Financial v3 com transporte simulado', () => {
  it('sinaliza o recebedor de outra loja, inclusive em página posterior, sem expor o identificador', async () => {
    const outraLoja = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
    const resultado = await consultarEventosFinancialV3(pedido, async requisicao => {
      const page = Number(new URL(requisicao.url).searchParams.get('page'));
      const receiver = { merchantId: page === 1 ? pedido.merchantId : outraLoja };
      return resposta({ ...pagina(page, page === 1), financialEvents: [{ ...evento, receiver }] });
    });
    expect(resultado.eventos.map(e => e.recebedorForaDaLoja)).toEqual([undefined, true]);
    expect(resultado.eventos[1]).not.toHaveProperty('receiver');
    expect(Object.values(resultado.eventos[1])).not.toContain(outraLoja);
  });

  it('lê páginas consecutivas da mesma loja e período e preserva ocorrências iguais', async () => {
    const get = vi.fn(async (p: PedidoHttp) => {
      const u = new URL(p.url);
      expect(p.metodo).toBe('GET');
      expect(p.cabecalhos).toEqual({ accept: 'application/json' });
      expect(u.origin + u.pathname).toBe('https://merchant-api.ifood.com.br/financial/v3.0/merchants/' + pedido.merchantId + '/financial-events');
      expect(Object.fromEntries(u.searchParams)).toEqual({ beginDate: pedido.inicio, endDate: pedido.fim,
        page: String(get.mock.calls.length), size: '100' });
      return resposta(pagina(get.mock.calls.length, get.mock.calls.length === 1));
    });
    const resultado = await consultarEventosFinancialV3(pedido, get);
    expect(get).toHaveBeenCalledTimes(2);
    expect(resultado.paginasLidas).toBe(2);
    expect(resultado.eventos.map(e => e.valorCentavos)).toEqual([-300n, -300n]);
    expect(resultado.consulta).toEqual(pedido);
  });

  it.each([[204, 1], [401, 2], [403, 2], [429, 2], [500, 2]])('interrompe no HTTP %d sem devolver a primeira página isolada', async (status, parada) => {
    let n = 0;
    const get = vi.fn(async () => ++n === parada ? resposta({ detalhe: 'conteudo-privado-ficticio' }, status) : resposta(pagina(1, true)));
    await expect(consultarEventosFinancialV3(pedido, get)).rejects.toMatchObject({ codigo: 'HTTP', status });
    expect(get).toHaveBeenCalledTimes(parada);
  });

  it('recusa próxima página vazia, repetição do número e sequência sem fim', async () => {
    await expect(consultarEventosFinancialV3(pedido, async () => resposta({ ...pagina(1, true), financialEvents: [] })))
      .rejects.toMatchObject({ codigo: 'PAGINACAO' });
    let repetidas = 0;
    await expect(consultarEventosFinancialV3(pedido, async () => { repetidas++; return resposta(pagina(1, true)); })).rejects.toThrow();
    expect(repetidas).toBe(2);
    let semFim = 0;
    await expect(consultarEventosFinancialV3(pedido, async () => resposta(pagina(++semFim, true)))).rejects.toMatchObject({ codigo: 'PAGINACAO' });
    expect(semFim).toBe(100);
  });

  it.each([['APURACAO','CalculationDate'], ['PAGAMENTO','PaymentDate']] as const)('monta o par de datas de %s sem paginação de Events', async (filtro, sufixo) => {
    const get = vi.fn(async (p: PedidoHttp) => {
      const url = new URL(p.url);
      expect(p.metodo).toBe('GET');
      expect(url.pathname).toBe('/financial/v3.0/merchants/' + pedido.merchantId + '/settlements');
      expect(Object.fromEntries(url.searchParams)).toEqual({ ['begin' + sufixo]: pedido.inicio, ['end' + sufixo]: pedido.fim });
      return resposta([liquidacao]);
    });
    expect(await consultarLiquidacoesFinancialV3({ ...pedido, filtro }, get)).toMatchObject({ filtro, liquidacoes: { saldoCentavos: 0n, formato: 'ARRAY_UNITARIO' } });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('permite 33 datas inclusivas em Events e recusa a 34ª antes do transporte', async () => {
    const get = vi.fn(async () => resposta(pagina(1, false)));
    await consultarEventosFinancialV3({ ...pedido, inicio: '2028-02-01', fim: '2028-03-04' }, get);
    await expect(consultarEventosFinancialV3({ ...pedido, inicio: '2028-02-01', fim: '2028-03-05' }, get))
      .rejects.toMatchObject({ codigo: 'CONSULTA_INVALIDA' });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('recusa loja, data, ordem e filtro inválidos antes de usar o transporte', async () => {
    const get = vi.fn(async () => resposta(liquidacao));
    for (const invalido of [{ merchantId: 'loja' }, { inicio: '2026-02-30' }, { inicio: '2026-03-01' }]) {
      await expect(consultarEventosFinancialV3({ ...pedido, ...invalido }, get)).rejects.toMatchObject({ codigo: 'CONSULTA_INVALIDA' });
    }
    await expect(consultarLiquidacoesFinancialV3({ ...pedido, filtro: 'ambas' as 'APURACAO' }, get)).rejects.toMatchObject({ codigo: 'CONSULTA_INVALIDA' });
    expect(get).not.toHaveBeenCalled();
  });

  it('não propaga mensagem do transporte ou corpo de erro do provedor', async () => {
    await expect(consultarEventosFinancialV3(pedido, async () => { throw new Error('sigilo-ficticio'); }))
      .rejects.toMatchObject({ codigo: 'TRANSPORTE', message: 'A consulta Financial v3 não foi concluída.' });
    await expect(consultarLiquidacoesFinancialV3({ ...pedido, filtro: 'PAGAMENTO' }, async () => resposta('sigilo-ficticio', 403)))
      .rejects.toMatchObject({ codigo: 'HTTP', status: 403, message: 'A consulta Financial v3 não foi concluída.' });
  });
});

describe('consulta de antecipações Financial v3', () => {
  const envelope = { merchantId: pedido.merchantId, beginDate: pedido.inicio, endDate: pedido.fim, balance: 0, settlements: [] };

  it.each([
    ['APURACAO', 'beginCalculationDate', 'endCalculationDate', 'OBJETO'],
    ['PAGAMENTO_ANTECIPADO', 'beginAnticipatedPaymentDate', 'endAnticipatedPaymentDate', 'ARRAY_UNITARIO'],
  ] as const)('consulta %s uma vez e mantém a cobertura pendente mesmo com lista vazia', async (filtro, inicio, fim, formato) => {
    const get = vi.fn<Transporte>().mockResolvedValue(resposta(formato === 'OBJETO' ? envelope : [envelope]));
    const resultado = await consultarAntecipacoesFinancialV3({ ...pedido, filtro }, get);
    expect(get).toHaveBeenCalledTimes(1);
    const [p] = get.mock.calls[0];
    const url = new URL(p.url);
    expect(p.metodo).toBe('GET');
    expect(url.origin + url.pathname).toBe(`https://merchant-api.ifood.com.br/financial/v3.0/merchants/${pedido.merchantId}/anticipations`);
    expect(url.searchParams.size).toBe(2);
    expect(Object.fromEntries(url.searchParams)).toEqual({ [inicio]: pedido.inicio, [fim]: pedido.fim });
    expect(p.cabecalhos).toEqual({ accept: 'application/json' });
    expect(p.corpo).toBeUndefined();
    expect(resultado).toMatchObject({ filtro, antecipacoes: { ...pedido, formato, saldoCentavos: 0n, grupos: [], cobertura: 'NAO_COMPROVADA' } });
  });

  it.each([{ merchantId: '00000000-0000-4000-8000-000000000002' }, { beginDate: '2026-02-02' }, { endDate: '2026-02-27' }])('recusa resposta de fora do escopo sem misturá-la com o pedido', async divergencia => {
    const get = vi.fn(async () => resposta({ ...envelope, ...divergencia }));
    await expect(consultarAntecipacoesFinancialV3({ ...pedido, filtro: 'PAGAMENTO_ANTECIPADO' }, get)).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('recusa filtro de Settlement, loja e intervalo inválidos antes do transporte', async () => {
    const get = vi.fn(async () => resposta(envelope));
    const consulta = { ...pedido, filtro: 'APURACAO' as const };
    for (const entrada of [{ ...consulta, filtro: 'PAGAMENTO' as 'APURACAO' }, { ...consulta, merchantId: '' },
      { ...consulta, fim: '2026-02-29' }, { ...consulta, inicio: '2026-03-01' }]) {
      await expect(consultarAntecipacoesFinancialV3(entrada, get)).rejects.toMatchObject({ codigo: 'CONSULTA_INVALIDA' });
    }
    expect(get).not.toHaveBeenCalled();
  });

  it.each([204, 403])('propaga o HTTP %d sem interpretar o corpo como lista de antecipações', async status => {
    const get = vi.fn(async () => resposta(envelope, status));
    await expect(consultarAntecipacoesFinancialV3({ ...pedido, filtro: 'APURACAO' }, get)).rejects.toMatchObject({ codigo: 'HTTP', status });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('consulta de vendas Financial v3', () => {
  const venda = (n: number) => ({ id: 'venda-sintetica-' + n, merchant: { id: pedido.merchantId } });
  const pagina = (page: number, ids: number[]) => ({
    page, size: 2, total: 3, pageCount: 2, beginSalesDate: pedido.inicio, endSalesDate: pedido.fim, sales: ids.map(venda),
  });
  const semCorpo = { status: 204, cabecalhos: {}, corpo: '' };

  it('envia somente as datas de venda e a página a partir de 1, aceitando última página menor', async () => {
    const get = vi.fn<Transporte>().mockResolvedValueOnce(resposta(pagina(1, [1, 2]))).mockResolvedValueOnce(resposta([pagina(2, [3])]));
    const resultado = await consultarVendasFinancialV3(pedido, get);
    expect(get).toHaveBeenCalledTimes(2);
    for (const [i, [req]] of get.mock.calls.entries()) {
      const url = new URL(req.url);
      expect(url.origin + url.pathname).toBe('https://merchant-api.ifood.com.br/financial/v3.0/merchants/' + pedido.merchantId + '/sales');
      expect(Array.from(url.searchParams)).toEqual([['beginSalesDate', pedido.inicio], ['endSalesDate', pedido.fim], ['page', String(i + 1)]]);
      expect(req.metodo).toBe('GET');
      expect(req.cabecalhos).toEqual({ accept: 'application/json' });
      expect(req.corpo).toBeUndefined();
    }
    expect(resultado).toMatchObject({ estado: 'PAGINAS_LIDAS', consulta: pedido, cobertura: 'NAO_COMPROVADA', paginasLidas: 2, totalInformado: 3 });
    if (resultado.estado !== 'PAGINAS_LIDAS') throw new Error('Resultado inesperado na fixture.');
    expect(resultado.vendas.map(v => v.id)).toEqual([1, 2, 3].map(n => venda(n).id));
  });

  it.each([1, 2])('retorna 204 na página %i como inconclusivo, sem registros parciais nem total', async parada => {
    const get = vi.fn<Transporte>();
    if (parada === 2) get.mockResolvedValueOnce(resposta({ ...pagina(1, [1, 2]), total: 5, pageCount: 3 }));
    get.mockResolvedValueOnce(semCorpo);
    expect(await consultarVendasFinancialV3(pedido, get)).toEqual({
      estado: 'INCONCLUSIVO_204', consulta: pedido, cobertura: 'NAO_COMPROVADA', paginaSemConteudo: parada,
    });
    expect(get).toHaveBeenCalledTimes(parada);
  });

  it.each([0, 1, 2])('respeita resposta 200 vazia com pageCount %i, sem presumir cobertura', async pageCount => {
    const get = vi.fn<Transporte>().mockResolvedValueOnce(resposta({ ...pagina(1, []), total: 0, pageCount }));
    if (pageCount === 2) get.mockResolvedValueOnce(resposta({ ...pagina(2, []), total: 0, pageCount }));
    const paginasLidas = Math.max(1, pageCount);
    expect(await consultarVendasFinancialV3(pedido, get)).toEqual({
      estado: 'PAGINAS_LIDAS', consulta: pedido, cobertura: 'NAO_COMPROVADA', paginasLidas, totalInformado: 0, vendas: [],
    });
    expect(get).toHaveBeenCalledTimes(paginasLidas);
  });

  it('percorre páginas 200 parciais ou vazias e aceita size variável quando a contagem final fecha', async () => {
    const get = vi.fn<Transporte>()
      .mockResolvedValueOnce(resposta({ ...pagina(1, [1]), size: 4, pageCount: 3 }))
      .mockResolvedValueOnce(resposta({ ...pagina(2, []), size: 0, pageCount: 3 }))
      .mockResolvedValueOnce(resposta({ ...pagina(3, [2, 3]), size: 2, pageCount: 3 }));
    const resultado = await consultarVendasFinancialV3(pedido, get);
    expect(resultado).toMatchObject({ estado: 'PAGINAS_LIDAS', paginasLidas: 3, totalInformado: 3,
      vendas: [1, 2, 3].map(n => ({ id: venda(n).id })) });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('consulta as 100 páginas declaradas mesmo quando o total de vendas já apareceu na primeira', async () => {
    const get = vi.fn<Transporte>(async req => {
      const page = Number(new URL(req.url).searchParams.get('page'));
      return resposta({ ...pagina(page, page === 1 ? [1] : []), size: 1, total: 1, pageCount: 100 });
    });
    expect(await consultarVendasFinancialV3(pedido, get)).toMatchObject({ estado: 'PAGINAS_LIDAS', paginasLidas: 100, totalInformado: 1 });
    expect(get).toHaveBeenCalledTimes(100);
  });

  it.each([
    { total: 4 }, { pageCount: 3 }, { page: 1 }, { sales: [] }, { sales: [venda(3), venda(4)] },
    { beginSalesDate: '2026-02-02' }, { endSalesDate: '2026-02-27' },
    { sales: [{ ...venda(3), merchant: { id: '00000000-0000-4000-8000-000000000002' } }] },
  ])('interrompe se os metadados ou o intervalo mudam durante a consulta', async alteracao => {
    const get = vi.fn<Transporte>().mockResolvedValueOnce(resposta(pagina(1, [1, 2])))
      .mockResolvedValueOnce(resposta({ ...pagina(2, [3]), ...alteracao }));
    await expect(consultarVendasFinancialV3(pedido, get)).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it.each([
    { ids: [1, 1], segunda: [3], parada: 1 },
    { ids: [1, 2], segunda: [2], parada: 2 },
  ])('recusa o mesmo id de venda repetido dentro da página ou entre páginas', async cenario => {
    const get = vi.fn<Transporte>().mockResolvedValueOnce(resposta(pagina(1, cenario.ids)))
      .mockResolvedValueOnce(resposta(pagina(2, cenario.segunda)));
    await expect(consultarVendasFinancialV3(pedido, get)).rejects.toMatchObject({ codigo: 'PAGINACAO' });
    expect(get).toHaveBeenCalledTimes(cenario.parada);
  });

  it.each([
    { total: 3, pageCount: 1 }, { total: 1, pageCount: 0, sales: [] },
    { size: 1 }, { total: 101, size: 1, pageCount: 101, sales: [venda(1)] },
    { total: 10_001, size: 10_001, pageCount: 1, sales: [venda(1)] },
  ])('recusa paginação incompatível ou maior que os limites locais sem buscar outra página', async alteracao => {
    const get = vi.fn<Transporte>().mockResolvedValueOnce(resposta({ ...pagina(1, [1, 2]), ...alteracao }));
    await expect(consultarVendasFinancialV3(pedido, get)).rejects.toMatchObject({ codigo: 'PAGINACAO' });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('retém exatamente 10.000 vendas sem lançamentos nem meios de pagamento em duas páginas', async () => {
    const get = vi.fn<Transporte>(async req => {
      const page = Number(new URL(req.url).searchParams.get('page'));
      const sales = Array.from({ length: 5_000 }, (_, i) => venda((page - 1) * 5_000 + i + 1));
      return resposta({ ...pagina(page, []), size: 5_000, total: 10_000, sales });
    });
    const resultado = await consultarVendasFinancialV3(pedido, get);
    if (resultado.estado !== 'PAGINAS_LIDAS') throw new Error('Resultado inesperado na fixture.');
    expect(resultado.vendas).toHaveLength(10_000);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it.each([4_998, 4_999])('conta lançamentos e %i meios de pagamento no teto acumulado das páginas', async meios => {
    const primeira = { ...venda(1), billingSummary: { billingEntries: Array.from({ length: 5_000 }, () => ({})) } };
    const segunda = { ...venda(2), payments: { methods: Array.from({ length: meios }, () => ({})) } };
    const get = vi.fn<Transporte>().mockResolvedValueOnce(resposta({ ...pagina(1, []), size: 1, total: 2, sales: [primeira] }))
      .mockResolvedValueOnce(resposta({ ...pagina(2, []), size: 1, total: 2, sales: [segunda] }));
    const resultado = consultarVendasFinancialV3(pedido, get);
    if (meios === 4_998) await expect(resultado).resolves.toMatchObject({ estado: 'PAGINAS_LIDAS', totalInformado: 2 });
    else await expect(resultado).rejects.toMatchObject({ codigo: 'PAGINACAO' });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('aceita localmente 90 datas inclusivas e recusa 91, data inválida e merchant inválido antes do GET', async () => {
    const get = vi.fn<Transporte>().mockResolvedValue(semCorpo);
    const bissexto = { ...pedido, inicio: '2028-01-01', fim: '2028-03-30' };
    expect((await consultarVendasFinancialV3(bissexto, get)).estado).toBe('INCONCLUSIVO_204');
    for (const erro of [{ fim: '2028-03-31' }, { inicio: '2028-02-30' }, { fim: '2027-11-30' }, { merchantId: 'loja' }]) {
      await expect(consultarVendasFinancialV3({ ...bissexto, ...erro }, get)).rejects.toMatchObject({ codigo: 'CONSULTA_INVALIDA' });
    }
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([204, 401, 403, 429, 500])('trata HTTP %i com corpo como erro sem devolver os dados da página anterior', async status => {
    const get = vi.fn<Transporte>().mockResolvedValueOnce(resposta(pagina(1, [1, 2])))
      .mockResolvedValueOnce(resposta('conteudo-privado-ficticio', status));
    await expect(consultarVendasFinancialV3(pedido, get)).rejects.toMatchObject({
      codigo: 'HTTP', status, message: 'A consulta Financial v3 não foi concluída.',
    });
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('leitura exata do JSON Financial', () => {
  it('preserva a escrita do decimal e distingue número de string', () => {
    expect(lerJsonFinancialV3('[9007199254740993.01,"1",1e-2]')).toEqual([new NumeroJsonFinancial('9007199254740993.01'), '1', new NumeroJsonFinancial('1e-2')]);
    const observacao = '{[ } " : ' + String.fromCharCode(92);
    expect(lerJsonFinancialV3(JSON.stringify({ observacao }))).toEqual({ observacao });
  });
  it('recusa chave duplicada equivalente após decodificação e limita a profundidade', () => {
    const barra = String.fromCharCode(92);
    expect(() => lerJsonFinancialV3('{"a":[{"x":1,"' + barra + 'u0078":2}]}')).toThrow('Resposta JSON Financial incompatível');
    expect(() => lerJsonFinancialV3('['.repeat(33) + '0' + ']'.repeat(33))).toThrow('Resposta JSON Financial incompatível');
    expect(() => lerJsonFinancialV3('{"sigilo-ficticio":')).toThrow(/^Resposta JSON Financial incompatível ou acima do limite local\.$/);
  });
});
