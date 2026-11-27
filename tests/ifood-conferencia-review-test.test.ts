import { describe, expect, it, vi } from 'vitest';
import type { AppDeIntegracao } from '@/lib/integracoes/core/apps';
import { armazemEmMemoria, ServicoDeToken } from '@/lib/integracoes/ifood/auth';
import { executarConferenciaReviewTest, type EvidenciaConferenciaReviewTest } from '@/lib/integracoes/ifood/conferencia-review-test';
import { CAMINHO_DAS_LOJAS } from '@/lib/integracoes/ifood/leitura-test';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import type { PedidoHttp, Transporte } from '@/lib/integracoes/ifood/transporte';

const APP: AppDeIntegracao = {
  id: 'app-teste-registrado', provedor: 'IFOOD', ambiente: 'TEST', categoria: 'TEST', modulos: ['REVIEW'],
  nome: 'nome-interno-sintetico', clientId: 'client-id-sintetico', nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET',
  estadoHomologacao: 'NAO_SE_APLICA', criadoEm: new Date(0), atualizadoEm: new Date(0),
};
const SEGREDO = 'segredo-da-fixture-local';
const TOKEN = 'token-da-fixture-local';
const ENV = {
  SERVICO_DA_INTEGRACAO: '1', INTEGRACAO_IFOOD_ATIVA: 'true',
  IFOOD_TEST_CLIENT_SECRET: SEGREDO, INTEGRACAO_CHAVE_CIFRAGEM: 'b'.repeat(64),
};
const LOJA = 'ab72fb80-5546-4ebd-8c2a-000000000001';
const OUTRA_LOJA = 'ab72fb80-5546-4ebd-8c2a-000000000002';
const AVALIACAO = 'ab72fb80-5546-4ebd-8c2a-000000000005';
const OUTRA_AVALIACAO = 'ab72fb80-5546-4ebd-8c2a-000000000006';
const API = '/review/v2.0/merchants/' + LOJA;
const TOKEN_PATH = '/authentication/v1.0/oauth/token';
const LISTA = API + '/reviews';
const DETALHE = LISTA + '/' + AVALIACAO;
const RESUMO = API + '/summary';
const DE = '2026-11-01T00:00:00-03:00';
const ATE = '2026-11-25T23:59:59-03:00';
const ARGUMENTOS = ['--app-id', APP.id, '--loja', LOJA.toUpperCase(), '--de', DE, '--ate', ATE];
const AGORA = Date.parse('2026-11-27T12:00:00Z');
const COMENTARIO = 'Comentário sintético privado';
const REVISAO = {
  id: AVALIACAO, createdAt: '2026-11-12T21:10:05.12345Z', score: 2,
  version: 'V2', visibility: 'PRIVATE', status: 'NOT_REPLIED', comment: COMENTARIO,
  customer: { id: 'id-consumidor-sintetico', name: 'Nome sintético', email: 'pessoa@example.invalid' },
  replies: [{ from: 'CUSTOMER', text: 'Resposta sintética privada' }],
};

function json(dados: unknown, requestId = 'request-001', status = 200) {
  return { status, cabecalhos: { 'x-request-id': requestId }, corpo: JSON.stringify(dados) };
}

function montar(opcoes: {
  app?: AppDeIntegracao | null;
  env?: Readonly<Record<string, string | undefined>>;
  respostas?: Record<string, ReturnType<typeof json>>;
  aposPedido?: (caminho: string) => void | Promise<void>;
  agora?: () => number;
  falhaDeAuditoria?: boolean;
} = {}) {
  const respostas = {
    [TOKEN_PATH]: json({ accessToken: TOKEN, expiresIn: 3600 }),
    [CAMINHO_DAS_LOJAS]: json([{ id: OUTRA_LOJA, name: 'Outra loja sintética' }, { id: LOJA.toUpperCase(), name: 'Loja sintética' }], 'lojas-1'),
    [LISTA]: json({ page: 0, size: 10, total: 1, pageCount: 1, reviews: [REVISAO] }, 'lista-1'),
    [DETALHE]: json({ ...REVISAO, merchant: { id: LOJA, name: 'Nome sintético na resposta' } }, 'detalhe-1'),
    [RESUMO]: json({ totalReviewsCount: 18, validReviewsCount: 15, score: 4.1 }, 'resumo-1'),
    ...opcoes.respostas,
  };
  const pedidos: PedidoHttp[] = [];
  const transporte: Transporte = async pedido => {
    pedidos.push(pedido);
    const caminho = new URL(pedido.url).pathname;
    await opcoes.aposPedido?.(caminho);
    if (!respostas[caminho]) throw new Error('Caminho fora da fixture.');
    return respostas[caminho];
  };
  const buscarApp = vi.fn(async () => opcoes.app === undefined ? APP : opcoes.app);
  const registrar = vi.fn(async (_dados: EvidenciaConferenciaReviewTest) => {
    if (opcoes.falhaDeAuditoria) throw new Error(SEGREDO);
  });
  const armazem = armazemEmMemoria();
  return {
    buscarApp, registrar, pedidos, armazem,
    caminhos: () => pedidos.map(pedido => new URL(pedido.url).pathname),
    executar: (args = ARGUMENTOS) => executarConferenciaReviewTest(args, {
      env: opcoes.env ?? ENV, buscarApp, armazem, transporte, registrar,
      agora: opcoes.agora ?? (() => AGORA),
    }),
  };
}

function emitirToken(armazem: ReturnType<typeof armazemEmMemoria>, agora: () => number, valor: string) {
  const servico = new ServicoDeToken({
    armazem, env: ENV, relogio: agora, limitador: new Limitador(agora),
    transporte: async () => json({ accessToken: valor, expiresIn: 3600 }),
  });
  return servico.token({
    id: APP.id, ambiente: 'TEST', clientId: APP.clientId, nomeDoSegredo: APP.nomeDoSegredo, homologacao: APP.estadoHomologacao,
  });
}

function evidencia(resultado: Awaited<ReturnType<typeof executarConferenciaReviewTest>>) {
  if (resultado.codigo === 2) throw new Error('A fixture foi recusada antes da leitura.');
  return resultado.evidencia;
}

describe('guardas da conferência Review TEST', () => {
  it.each([
    { args: ARGUMENTOS.slice(0, -1) },
    { args: [...ARGUMENTOS.slice(0, -2), '--de', ATE] },
    { args: [...ARGUMENTOS.slice(0, -2), '--dados-sinteticos', ATE] },
    { args: ['--app-id', 'app?id=outro', ...ARGUMENTOS.slice(2)] },
    { args: [...ARGUMENTOS.slice(0, 3), LOJA + '/reviews', ...ARGUMENTOS.slice(4)] },
    { args: [...ARGUMENTOS.slice(0, 5), '2026-11-01T03:00:00', ...ARGUMENTOS.slice(6)] },
    { args: [...ARGUMENTOS.slice(0, 5), '2026-11-29T03:00:00Z', ...ARGUMENTOS.slice(6)] },
    { args: [...ARGUMENTOS.slice(0, 4), '--de', '2026-11-01T03:00:00.0002Z', '--ate', '2026-11-01T03:00:00.0001Z'] },
  ])('recusa argumentos ausentes, duplicados ou inválidos antes de buscar o app', async ({ args }) => {
    const m = montar();
    await expect(m.executar(args)).resolves.toEqual({ codigo: 2, motivo: 'argumentos-invalidos' });
    expect(m.buscarApp).not.toHaveBeenCalled();
    expect(m.pedidos).toHaveLength(0);
    expect(m.registrar).not.toHaveBeenCalled();
  });

  it.each([
    { motivo: 'fora-do-worker', env: { ...ENV, SERVICO_DA_INTEGRACAO: undefined } },
    { motivo: 'integracao-desligada', env: { ...ENV, INTEGRACAO_IFOOD_ATIVA: 'false' } },
    { motivo: 'app-nao-encontrado', app: null },
    { motivo: 'app-nao-encontrado', app: { ...APP, id: 'outro-app' } },
    { motivo: 'app-fora-do-teste', app: { ...APP, ambiente: 'PRODUCAO', estadoHomologacao: 'HOMOLOGADO' } },
    { motivo: 'app-fora-do-teste', app: { ...APP, categoria: 'AVALIACOES' } },
    { motivo: 'review-nao-cadastrado', app: { ...APP, modulos: ['MERCHANT'] } },
    { motivo: 'segredo-fora-do-teste', app: { ...APP, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET' } },
    { motivo: 'cofre-incompleto', env: { ...ENV, IFOOD_TEST_CLIENT_SECRET: undefined } },
    { motivo: 'cofre-incompleto', env: { ...ENV, INTEGRACAO_CHAVE_CIFRAGEM: 'invalida' } },
    { motivo: 'cofre-incompleto', env: { ...ENV, IFOOD_API_BASE: 'https://example.invalid' } },
  ] satisfies Array<Parameters<typeof montar>[0] & { motivo: string }>)('recusa $motivo com zero tráfego e zero auditoria', async ({ motivo, ...opcoes }) => {
    const m = montar(opcoes);
    await expect(m.executar()).resolves.toEqual({ codigo: 2, motivo });
    expect(m.pedidos).toHaveLength(0);
    expect(m.registrar).not.toHaveBeenCalled();
  });
});

it('confere apenas a primeira página, um detalhe devolvido e o resumo com o mesmo token', async () => {
  const reviews = [REVISAO, ...Array.from({ length: 9 }, (_, i) => ({
    ...REVISAO, id: 'ab72fb80-5546-4ebd-8c2a-00000000001' + i,
  }))];
  const m = montar({ respostas: { [LISTA]: json({ page: 0, size: 10, total: 11, pageCount: 2, reviews }, 'lista-1') } });
  const r = await m.executar();
  expect(r).toMatchObject({ codigo: 0, auditoria: 'registrada' });
  const prova = evidencia(r);
  expect(prova).toMatchObject({
    ambiente: 'TEST', appId: APP.id, merchantId: LOJA, quando: new Date(AGORA).toISOString(),
    periodoDaListagem: { de: DE, ate: ATE }, paginaSolicitada: 1, resultado: 'amostra-conferida',
    passos: {
      lojas: { estado: 'loja-confirmada', lojasRecebidas: 2, http: 200, requestId: 'lojas-1' },
      listagem: { estado: 'observada', avaliacoesRecebidas: 10, total: 11, paginas: 2, http: 200, requestId: 'lista-1' },
      detalhe: { estado: 'conferido', http: 200, requestId: 'detalhe-1' },
      resumo: { estado: 'conferido', totalAvaliacoes: 18, avaliacoesValidas: 15, notaDisponivel: true, http: 200, requestId: 'resumo-1' },
    },
  });
  expect(m.buscarApp).toHaveBeenCalledExactlyOnceWith(APP.id);
  expect(m.registrar).toHaveBeenCalledExactlyOnceWith(prova);
  expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS, LISTA, DETALHE, RESUMO]);
  for (const pedido of m.pedidos.slice(1)) {
    expect(pedido.metodo).toBe('GET');
    expect(pedido.corpo).toBeUndefined();
    expect(pedido.cabecalhos).toMatchObject({ 'x-request-homologation': 'true', Authorization: 'Bearer ' + TOKEN });
  }
  expect(Object.fromEntries(new URL(m.pedidos[2].url).searchParams)).toEqual({
    page: '1', pageSize: '10', addCount: 'true', dateFrom: '2026-11-01T03:00:00.000Z',
    dateTo: '2026-11-26T02:59:59.000Z', sort: 'DESC', sortBy: 'CREATED_AT',
  });
  expect(new URL(m.pedidos[4].url).search).toBe('');
  for (const privado of [SEGREDO, TOKEN, APP.nome, APP.clientId, OUTRA_LOJA, AVALIACAO, COMENTARIO,
    'Nome sintético', 'pessoa@example.invalid', 'id-consumidor-sintetico', 'Resposta sintética privada', 'Loja sintética']) {
    expect(JSON.stringify(r)).not.toContain(privado);
    expect(JSON.stringify(m.registrar.mock.calls)).not.toContain(privado);
  }
});

it('distingue janela vazia de uma página sem contagens e consulta o resumo em ambas', async () => {
  for (const [contagem, dados, codigo] of [
    ['vazia', { total: 0, pageCount: 0 }, 0],
    ['contagem-incompleta', { total: 0 }, 1],
  ] as const) {
    const m = montar({ respostas: {
      [LISTA]: json({ page: 0, size: 10, reviews: [], ...dados }),
      [RESUMO]: json({ totalReviewsCount: 0, score: 0 }),
    } });
    const r = await m.executar();
    expect(r.codigo).toBe(codigo);
    expect(evidencia(r)).toMatchObject({
      resultado: codigo === 0 ? 'janela-vazia-confirmada' : 'inconclusiva',
      passos: {
        listagem: { estado: contagem, avaliacoesRecebidas: 0, total: 0, paginas: codigo === 0 ? 0 : null },
        detalhe: { estado: 'sem-avaliacao-na-pagina' },
        resumo: { estado: 'conferido', totalAvaliacoes: 0, avaliacoesValidas: null, notaDisponivel: false },
      },
    });
    expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS, LISTA, RESUMO]);
    expect(m.registrar).toHaveBeenCalledOnce();
  }
});

it('mantém uma página com avaliações e contagens ausentes como inconclusiva após conferir o detalhe', async () => {
  const m = montar({ respostas: { [LISTA]: json({ page: 0, size: 10, pageCount: 1, reviews: [REVISAO] }) } });
  const r = await m.executar();
  expect(r.codigo).toBe(1);
  expect(evidencia(r)).toMatchObject({
    resultado: 'inconclusiva',
    passos: {
      listagem: { estado: 'contagem-incompleta', avaliacoesRecebidas: 1, total: null, paginas: 1 },
      detalhe: { estado: 'conferido' },
      resumo: { estado: 'conferido' },
    },
  });
  expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS, LISTA, DETALHE, RESUMO]);
});

it('para no Merchant se a loja for ausente ou a lista estiver fora do contrato', async () => {
  for (const [estado, resposta] of [
    ['loja-nao-confirmada', [{ id: OUTRA_LOJA }]],
    ['erro-contrato', [{ id: LOJA }, { name: 'Loja sem identificador' }]],
    ['erro-contrato', { id: LOJA }],
  ] as const) {
    const m = montar({ respostas: { [CAMINHO_DAS_LOJAS]: json(resposta) } });
    const r = await m.executar();
    expect(r.codigo).toBe(1);
    expect(evidencia(r).passos).toMatchObject({ lojas: { estado }, listagem: { estado: 'nao-consultado' } });
    expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS]);
    expect(m.registrar).toHaveBeenCalledOnce();
  }
});

it.each([
  { passo: 'lojas', caminho: CAMINHO_DAS_LOJAS, antes: [] },
  { passo: 'listagem', caminho: LISTA, antes: [CAMINHO_DAS_LOJAS] },
  { passo: 'detalhe', caminho: DETALHE, antes: [CAMINHO_DAS_LOJAS, LISTA] },
] as const)('preserva o 403 em $passo e não sonda outros caminhos', async ({ passo, caminho, antes }) => {
  const m = montar({ respostas: { [caminho]: json({ error: { message: COMENTARIO } }, 'recusado-1', 403) } });
  const r = await m.executar();
  expect(r.codigo).toBe(1);
  expect(evidencia(r).passos[passo]).toEqual({ estado: 'acesso-negado', http: 403, requestId: 'recusado-1', origem: 'endpoint' });
  expect(m.caminhos()).toEqual([TOKEN_PATH, ...antes, caminho]);
  expect(m.registrar).toHaveBeenCalledOnce();
  expect(JSON.stringify(r)).not.toContain(COMENTARIO);
});

it('preserva HTTP 401 do endpoint sem ir à autenticação nem a outras consultas após a falha', async () => {
  const m = montar({ respostas: { [LISTA]: json({}, 'auth-1', 401) } });
  const r = await m.executar();
  expect(r.codigo).toBe(1);
  expect(evidencia(r).passos.listagem).toMatchObject({ estado: 'acesso-negado', http: 401, requestId: 'auth-1', origem: 'endpoint' });
  expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS, LISTA]);
});

it('separa recusa no OAuth de uma resposta do Merchant e não a registra como consulta', async () => {
  const m = montar({ respostas: { [TOKEN_PATH]: json({ error: { message: SEGREDO } }, SEGREDO, 403) } });
  const r = await m.executar();
  expect(r).toMatchObject({ codigo: 1, auditoria: 'nao-registrada' });
  expect(evidencia(r).passos.lojas).toEqual({ estado: 'acesso-negado', http: 403, requestId: null, origem: 'autenticacao' });
  expect(m.caminhos()).toEqual([TOKEN_PATH]);
  expect(m.registrar).not.toHaveBeenCalled();
  expect(JSON.stringify(r)).not.toContain(SEGREDO);
});

it('para antes de usar outro token quando o token da lista deixa de servir', async () => {
  let agora = AGORA;
  const m = montar({
    agora: () => agora,
    aposPedido: caminho => { if (caminho === CAMINHO_DAS_LOJAS) agora += 3_500_000; },
  });
  const r = await m.executar();
  expect(r.codigo).toBe(1);
  expect(evidencia(r).passos.listagem).toMatchObject({ estado: 'autenticacao-inconclusiva', http: null });
  expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS]);
});

it('renova um token vencido pelo serviço compartilhado antes da primeira consulta', async () => {
  const m = montar();
  await emitirToken(m.armazem, () => AGORA - 3_700_000, 'token-antigo-de-fixture');
  const r = await m.executar();
  expect(r.codigo).toBe(0);
  expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS, LISTA, DETALHE, RESUMO]);
  expect(m.pedidos[1].cabecalhos.Authorization).toBe('Bearer ' + TOKEN);
});

it('preserva o recibo e a auditoria se outra execução gravar um token entre Merchant e Review', async () => {
  let agora = AGORA;
  const m = montar({
    agora: () => agora,
    aposPedido: async caminho => {
      if (caminho !== CAMINHO_DAS_LOJAS) return;
      agora += 3_500_000;
      await emitirToken(m.armazem, () => agora, 'token-concorrente-de-fixture');
    },
  });
  const r = await m.executar();
  expect(r).toMatchObject({ codigo: 1, auditoria: 'registrada' });
  expect(evidencia(r).passos).toMatchObject({
    lojas: { estado: 'loja-confirmada', http: 200, requestId: 'lojas-1' },
    listagem: { estado: 'autenticacao-inconclusiva', http: null, requestId: null },
    detalhe: { estado: 'nao-consultado' },
    resumo: { estado: 'nao-consultado' },
  });
  expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS]);
  expect(m.registrar).toHaveBeenCalledExactlyOnceWith(evidencia(r));
  expect(JSON.stringify(r)).not.toContain('token-concorrente-de-fixture');
});

it.each([
  { campos: { merchant: { id: OUTRA_LOJA } }, estado: 'erro-identidade' },
  { campos: { merchant: { id: LOJA }, id: OUTRA_AVALIACAO }, estado: 'erro-identidade' },
  { campos: { merchant: {} }, estado: 'loja-nao-confirmada' },
])('contém a divergência de identidade do detalhe ($estado)', async ({ campos, estado }) => {
  const m = montar({ respostas: { [DETALHE]: json({ ...REVISAO, ...campos }, 'pessoa@example.invalid') } });
  const r = await m.executar();
  expect(r.codigo).toBe(1);
  expect(evidencia(r).passos).toMatchObject({ detalhe: { estado, http: 200, requestId: null }, resumo: { estado: 'nao-consultado' } });
  expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS, LISTA, DETALHE]);
  expect(JSON.stringify(r)).not.toContain(OUTRA_LOJA);
  expect(JSON.stringify(r)).not.toContain(OUTRA_AVALIACAO);
});

it('informa falha de contrato na listagem em HTTP 200 e não consulta detalhe ou resumo', async () => {
  const m = montar({ respostas: { [LISTA]: json({ page: 0, size: 10, total: 0, pageCount: 0, reviews: [REVISAO] }, TOKEN) } });
  const r = await m.executar();
  expect(r.codigo).toBe(1);
  expect(evidencia(r).passos.listagem).toMatchObject({ estado: 'erro-contrato', codigoContrato: 'PAGINACAO', http: 200, requestId: null });
  expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS, LISTA]);
});

it('distingue resumo indisponível de zero com a listagem vazia confirmada', async () => {
  const m = montar({ respostas: {
    [LISTA]: json({ page: 0, size: 10, total: 0, pageCount: 0, reviews: [] }),
    [RESUMO]: json({ error: { message: COMENTARIO } }, 'resumo-404', 404),
  } });
  const r = await m.executar();
  expect(r.codigo).toBe(1);
  expect(evidencia(r)).toMatchObject({
    resultado: 'inconclusiva',
    passos: { listagem: { estado: 'vazia' }, resumo: { estado: 'indisponivel', http: 404, requestId: 'resumo-404' } },
  });
  expect(evidencia(r).passos.resumo).not.toHaveProperty('totalAvaliacoes');
  expect(m.caminhos()).toEqual([TOKEN_PATH, CAMINHO_DAS_LOJAS, LISTA, RESUMO]);
});

it('devolve o recibo sanitizado se a auditoria falhar', async () => {
  const m = montar({ falhaDeAuditoria: true });
  const r = await m.executar();
  expect(r).toMatchObject({ codigo: 1, auditoria: 'falhou', evidencia: { resultado: 'amostra-conferida' } });
  expect(JSON.stringify(r)).not.toContain(SEGREDO);
});
