import { describe, expect, it, vi } from 'vitest';
import { consultarEventosFinancialV3, consultarLiquidacoesFinancialV3 } from '../src/lib/integracoes/ifood/financial-v3-consultas';
import { lerJsonFinancialV3, NumeroJsonFinancial } from '../src/lib/integracoes/ifood/financial-v3-json';
import type { PedidoHttp } from '../src/lib/integracoes/ifood/transporte';

const pedido = { merchantId: '00000000-0000-4000-8000-000000000001', inicio: '2026-02-01', fim: '2026-02-28' };
const resposta = (corpo: unknown, status = 200) => ({ status, cabecalhos: {}, corpo: JSON.stringify(corpo) });
const evento = { name: 'ORDER_COMMISSION', amount: { value: '-3.00' }, hasTransferImpact: true };
const pagina = (page: number, hasNextPage: boolean) => ({ page, size: 100, hasNextPage, financialEvents: [evento] });
const liquidacao = { merchantId: pedido.merchantId, beginDate: pedido.inicio, endDate: pedido.fim, balance: 0, settlements: [] };

describe('clientes Financial v3 com transporte simulado', () => {
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
