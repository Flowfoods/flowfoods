import { describe, expect, it } from 'vitest';
import { armazemEmMemoria, ServicoDeToken, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { criarClienteIfood } from '@/lib/integracoes/ifood/http';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import { chamadaDaListagemReview, chamadaDoDetalheReview, conferirDetalheReview, conferirPaginaReview } from '@/lib/integracoes/ifood/review-leitura';
import type { PedidoHttp, Transporte } from '@/lib/integracoes/ifood/transporte';

const loja = 'd05ecab0-7bb7-4a5e-badf-0c6111111111';
const outraLoja = 'd05ecab0-7bb7-4a5e-badf-0c6222222222';
const avaliacaoId = (numero: number) => `8fcac37a-47dd-4dc4-a802-${String(numero).padStart(12, '0')}`;
const criadaEm = '2026-11-20T12:10:00.000Z';
const periodo = { merchantId: loja, de: '2026-11-20T09:00:00-03:00', ate: '2026-11-20T18:00:00-03:00' };
const escolha = { merchantId: loja, reviewId: avaliacaoId(1) };

const avaliacao = (i = 1, campos: Record<string, unknown> = {}) => ({
  id: avaliacaoId(i), createdAt: criadaEm, score: 2, status: 'NOT_REPLIED', version: 'V2', visibility: 'PRIVATE', replies: [], ...campos,
});
const pagina = (reviews: unknown[], campos: Record<string, unknown> = {}) => ({
  page: 0, size: 10, reviews, total: reviews.length, pageCount: reviews.length ? 1 : 0, ...campos,
});

describe('Review v2 · solicitações de leitura', () => {
  it('usa o caminho e os nomes v2, datas UTC, contagem e tamanho de fronteira', () => {
    expect(chamadaDaListagemReview({ ...periodo, pagina: 2, tamanho: 50, ordem: 'ASC' })).toEqual({
      metodo: 'GET', familia: 'review', caminho: `/review/v2.0/merchants/${loja}/reviews`,
      consulta: { page: '2', pageSize: '50', addCount: 'true', dateFrom: '2026-11-20T12:00:00.000Z',
        dateTo: '2026-11-20T21:00:00.000Z', sort: 'ASC', sortBy: 'CREATED_AT' },
    });
    expect(chamadaDaListagemReview(periodo).consulta).toMatchObject({ page: '1', pageSize: '10', sort: 'DESC' });
    expect(chamadaDoDetalheReview(escolha)).toEqual({
      metodo: 'GET', familia: 'review', caminho: `/review/v2.0/merchants/${loja}/reviews/${escolha.reviewId}`,
    });
  });

  it.each([
    { tamanho: 51 }, { tamanho: 0 }, { tamanho: 10.5 }, { pagina: 0 }, { pagina: -1 }, { pagina: '2' },
    { de: '2026-11-20T09:00:00' }, { de: '2026-11-31T09:00:00Z' }, { ate: '2026-11-20T11:59:59Z' },
    { size: 100 }, { startDate: '2026-11-20T12:00:00Z' }, { merchantId: `${loja}/reviews?` },
  ])('recusa parâmetros fora do contrato (%j)', campos => {
    expect(() => chamadaDaListagemReview({ ...periodo, ...campos })).toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });

  it('recusa um caminho de detalhe fora dos IDs informados', () => {
    expect(() => chamadaDoDetalheReview({ ...escolha, reviewId: '../summary' })).toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });

  it('mantém a fração de segundo em UTC e recusa limites invertidos no mesmo milissegundo', () => {
    const de = '2026-11-20T09:00:00.1234-03:00';
    const ate = '2026-11-20T12:00:00.1239Z';
    expect(chamadaDaListagemReview({ ...periodo, de, ate }).consulta).toMatchObject({
      dateFrom: '2026-11-20T12:00:00.1234Z', dateTo: '2026-11-20T12:00:00.1239Z',
    });
    expect(() => chamadaDaListagemReview({ ...periodo, de: ate, ate: de })).toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });
});

describe('Review v2 · conferência da listagem', () => {
  it('preserva página solicitada e offset informado e aceita a última página com o tamanho efetivo', () => {
    const r = conferirPaginaReview({ ...periodo, pagina: 2 }, pagina([avaliacao()], { page: 10, size: 1, total: 11, pageCount: 2 }));
    expect(r).toMatchObject({ estado: 'observada', merchantIdSolicitado: loja, paginaSolicitada: 2, paginaInformada: 10, tamanhoInformado: 1, total: 11, paginas: 2 });
    expect(r.avaliacoes[0]).toEqual({ id: avaliacaoId(1), criadaEm, nota: 2, status: 'NOT_REPLIED', versao: 'V2',
      visibilidade: 'PRIVATE', temRespostaDaLoja: false });
  });

  it.each([0, 1])('considera vazia a primeira página com total zero e pageCount=%i', pageCount => {
    expect(conferirPaginaReview(periodo, pagina([], { size: 0, pageCount }))).toMatchObject({ estado: 'vazia', total: 0, avaliacoes: [] });
  });

  it('separa falta de contagem de página solicitada além do total', () => {
    expect(conferirPaginaReview(periodo, pagina([], { pageCount: undefined }))).toMatchObject({ estado: 'contagem-incompleta', total: 0, paginas: null });
    expect(conferirPaginaReview(periodo, pagina([avaliacao()], { total: undefined }))).toMatchObject({ estado: 'contagem-incompleta', total: null });
    expect(conferirPaginaReview({ ...periodo, pagina: 3 }, pagina([], { page: 20, total: 11, pageCount: 2 }))).toMatchObject({
      estado: 'fora-das-paginas', total: 11, avaliacoes: [],
    });
  });

  it.each([
    pagina([avaliacao()], { size: 50 }), pagina([avaliacao()], { total: 0 }), pagina([], { total: 11, pageCount: 1 }),
    pagina([avaliacao()], { total: 11, pageCount: 2 }), pagina([], { total: 0, pageCount: 2 }),
    pagina([avaliacao()], { total: undefined, pageCount: 0 }),
  ])('recusa contagens e tamanhos incompatíveis (%j)', resposta => {
    expect(() => conferirPaginaReview(periodo, resposta)).toThrow(expect.objectContaining({ codigo: 'PAGINACAO' }));
  });

  it('recusa avaliações fora do período e IDs repetidos na mesma página', () => {
    expect(() => conferirPaginaReview(periodo, pagina([avaliacao(1, { createdAt: '2026-11-20T08:59:59.999-03:00' })])))
      .toThrow(expect.objectContaining({ codigo: 'PERIODO' }));
    expect(() => conferirPaginaReview(periodo, pagina([avaliacao(), avaliacao(1, { id: avaliacaoId(1).toUpperCase() })])))
      .toThrow(expect.objectContaining({ codigo: 'IDENTIDADE' }));
  });

  it('distingue o fim do intervalo de uma avaliação posterior no mesmo milissegundo', () => {
    const consulta = { ...periodo, ate: '2026-11-20T09:00:00.123-03:00' };
    const observada = (createdAt: string) => conferirPaginaReview(consulta, pagina([avaliacao(1, { createdAt })]));
    expect(observada('2026-11-20T12:00:00.123000Z').estado).toBe('observada');
    expect(() => observada('2026-11-20T12:00:00.123999Z')).toThrow(expect.objectContaining({ codigo: 'PERIODO' }));
  });

  it('recusa corpo de erro e objeto sem replies em uma resposta bem sucedida', () => {
    for (const corpo of [{ status: 400, errorType: 'INVALID_PARAMETER' }, pagina([avaliacao(1, { replies: undefined })])]) {
      expect(() => conferirPaginaReview(periodo, corpo)).toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
    }
  });
});

describe('Review v2 · conferência do detalhe', () => {
  it('vincula ID e loja e detecta resposta da loja mesmo com status NOT_REPLIED', () => {
    const r = conferirDetalheReview(escolha, avaliacao(1, { merchant: { id: loja.toUpperCase(), name: 'Loja fictícia' },
      replies: [{ from: 'MERCHANT', text: 'Resposta privada de teste' }], customerName: 'Pessoa de teste', comment: 'Avaliação de teste',
    }));
    expect(r).toEqual({ estado: 'conferido', merchantId: loja, avaliacao: { id: avaliacaoId(1), criadaEm, nota: 2, status: 'NOT_REPLIED',
      versao: 'V2', visibilidade: 'PRIVATE', temRespostaDaLoja: true } });
  });

  it('diferencia identidade ausente ou incorreta e autores ainda desconhecidos', () => {
    expect(conferirDetalheReview(escolha, avaliacao())).toEqual({ estado: 'loja-nao-confirmada' });
    expect(() => conferirDetalheReview(escolha, avaliacao(1, { merchant: { id: outraLoja } }))).toThrow(expect.objectContaining({ codigo: 'IDENTIDADE' }));
    expect(() => conferirDetalheReview(escolha, avaliacao(2, { merchant: { id: loja } }))).toThrow(expect.objectContaining({ codigo: 'IDENTIDADE' }));
    const dados = avaliacao(1, { merchant: { id: loja }, replies: [{ from: 'OUTRO' }], status: null, version: null, visibility: null });
    expect(conferirDetalheReview(escolha, dados)).toMatchObject({ avaliacao: { temRespostaDaLoja: null, status: null, versao: null, visibilidade: null } });
  });
});

it('envia apenas GET de Review pelo cliente existente com transporte simulado e conserva 404 como falha', async () => {
  const registros: PedidoHttp[] = [];
  const app: AppParaToken = { id: 'review-local', clientId: 'cliente-sintetico', ambiente: 'TEST',
    nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: 'NAO_SE_APLICA' };
  const env = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: 'b'.repeat(64), IFOOD_TEST_CLIENT_SECRET: 'fixture-local' };
  const transporte: Transporte = async pedido => {
    if (pedido.url.endsWith('/oauth/token')) return { status: 200, cabecalhos: {}, corpo: '{"accessToken":"token-sintetico","expiresIn":3600}' };
    registros.push(pedido);
    return pedido.url.includes('?')
      ? { status: 200, cabecalhos: {}, corpo: JSON.stringify(pagina([avaliacao()])) }
      : { status: 404, cabecalhos: {}, corpo: '{"errorType":"NOT_FOUND"}' };
  };
  const limitador = new Limitador();
  const tokens = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte, limitador, env });
  const cliente = criarClienteIfood({ app, tokens, limitador, transporte, env, maxTentativas: 1 });
  const lista = await cliente.chamar(chamadaDaListagemReview(periodo));
  expect(lista.ok && conferirPaginaReview(periodo, lista.dados)).toMatchObject({ estado: 'observada' });
  await expect(cliente.chamar(chamadaDoDetalheReview(escolha))).resolves.toMatchObject({ ok: false, status: 404 });
  expect(registros.map(p => p.metodo)).toEqual(['GET', 'GET']);
  expect([...new URL(registros[0].url).searchParams.keys()]).toEqual(['page', 'pageSize', 'addCount', 'dateFrom', 'dateTo', 'sort', 'sortBy']);
});
