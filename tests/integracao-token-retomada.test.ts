/** OAuth e HTTP reais com relógio, armazém e transporte sintéticos. Nenhuma chamada de rede/DB. */
import { describe, expect, it, vi } from 'vitest';
import { armazemEmMemoria, ErroDeAutenticacao, ServicoDeToken, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { criarClienteIfood } from '@/lib/integracoes/ifood/http';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import { classificar } from '@/lib/integracoes/ifood/respostas';
import type { PedidoHttp, RespostaHttp } from '@/lib/integracoes/ifood/transporte';
import { executarTarefaAnalytics, type RepositorioDoExecutorAnalytics } from '@/lib/integracoes/ifood/pipeline-executor';
import type { TarefaAnalytics } from '@/lib/integracoes/ifood/pipeline-tipos';

const AGORA = Date.parse('2026-11-07T12:00:00.000Z');
const APP: AppParaToken = { id: 'app-local-retomada', ambiente: 'TEST', clientId: 'cliente-local', nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: 'NAO_SE_APLICA' };
const ENV = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: 'b'.repeat(64), IFOOD_TEST_CLIENT_SECRET: 'segredo-ficticio-retomada' };
const chamada = { metodo: 'POST' as const, caminho: '/analytics/v1.0/merchants/11111111-2222-4333-8444-555555555555/orders/kpis', familia: 'analytics' as const, idempotente: true };
const json = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): RespostaHttp => ({ status, corpo: JSON.stringify(corpo), cabecalhos });
const cota = (header?: string, requestId = 'oauth-sintetico'): RespostaHttp => json(429, { accessToken: 'token-recusa-nao-expor', clientSecret: 'segredo-recusa-nao-expor' }, {
  'x-request-id': requestId, ...(header === undefined ? {} : { 'retry-after': header }),
});
function montar(respostas: RespostaHttp[]) {
  let agora = AGORA;
  const pedidos: PedidoHttp[] = [], sonos: number[] = [];
  const relogio = () => agora;
  const dormir = async (ms: number) => { sonos.push(ms); agora += ms; };
  const transporte = async (p: PedidoHttp): Promise<RespostaHttp> => {
    pedidos.push(p);
    if (!p.url.endsWith('/oauth/token')) return json(200, { dados: 'sinteticos' });
    const r = respostas.shift();
    if (!r) throw new Error('Tentativa OAuth além do roteiro autorizado.');
    return r;
  };
  const limitador = new Limitador(relogio, dormir);
  const armazem = armazemEmMemoria();
  const tokens = new ServicoDeToken({ transporte, armazem, limitador, env: ENV, relogio, dormir, aleatorio: () => 1 });
  const cliente = criarClienteIfood({ app: APP, tokens, transporte, limitador, env: ENV, relogio, dormir, maxTentativas: 6 });
  return { tokens, cliente, limitador, transporte, armazem, sonos, pedidos, relogio, avancar: (ms: number) => { agora += ms; }, oauth: () => pedidos.filter(p => p.url.endsWith('/oauth/token')), apis: () => pedidos.filter(p => !p.url.endsWith('/oauth/token')) };
}

describe('429 OAuth conserva retomada até o cliente HTTP', () => {
  it.each(['40', '600', 'Sat, 07 Nov 2026 12:10:00 GMT', '9'.repeat(400)])('prazo %s encerra sem sono nem Analytics e preserva classificação integral', async header => {
    const resposta = cota(header), m = montar([resposta]);
    const r = await m.cliente.chamar(chamada);
    expect(r).toMatchObject({ ok: false, status: 429, classificacao: classificar(429, resposta.cabecalhos, resposta.corpo, AGORA), requestId: 'oauth-sintetico', tentativas: 1 });
    expect(m.oauth()).toHaveLength(1); expect(m.apis()).toEqual([]); expect(m.sonos).toEqual([]);
    expect(m.armazem.dados.size).toBe(0);
    expect(JSON.stringify(r)).not.toMatch(/segredo-ficticio|token-recusa|segredo-recusa|clientSecret|accessToken/);
  });

  it('erro direto do token conserva metadados, sem mudar a mensagem clara do prazo', async () => {
    const m = montar([cota('46')]);
    const erro = await m.tokens.token(APP).catch(e => e);
    expect(erro).toBeInstanceOf(ErroDeAutenticacao);
    expect(erro).toMatchObject({ status: 429, requestId: 'oauth-sintetico', classificacaoRetomada: { tipo: 'limite', prazo: { esperarMs: 46_000, naoAntesDe: '2026-11-07T12:00:46.000Z' } } });
    expect(erro.message).toMatch(/esperar 46 s/); expect(erro).not.toHaveProperty('cause');
  });

  it('última tentativa 429 conserva o prazo da última resposta; não dorme após encerrar', async () => {
    const m = montar([cota('1', 'oauth-1'), cota('1', 'oauth-2'), cota('600', 'oauth-3')]);
    const r = await m.cliente.chamar(chamada);
    expect(r).toMatchObject({ ok: false, status: 429, requestId: 'oauth-3', classificacao: { tipo: 'limite', prazo: { esperarMs: 600_000, naoAntesDe: '2026-11-07T12:10:02.000Z' } } });
    expect(m.oauth()).toHaveLength(3); expect(m.apis()).toEqual([]); expect(m.sonos).toEqual([1000, 1000]);
  });

  it.each([undefined, 'invalido'])('última 429 sem prazo (%s) conserva limite/null para pausa conservadora', async header => {
    const m = montar([cota(header), cota(header), cota(header)]);
    expect(await m.cliente.chamar(chamada)).toMatchObject({ ok: false, status: 429, requestId: 'oauth-sintetico', classificacao: { tipo: 'limite', prazo: null } });
    expect(m.sonos).toEqual([1000, 2000]); expect(m.oauth()).toHaveLength(3); expect(m.apis()).toEqual([]);
  });

  it.each(['0', '3', '39', 'Sat, 07 Nov 2026 11:59:59 GMT'])('espera curta/expirada %s continua permitida dentro de40s', async header => {
    const m = montar([cota(header), json(200, { accessToken: 'token-ficticio-valido', expiresIn: 3600 })]);
    const r = await m.cliente.chamar(chamada);
    expect(r).toMatchObject({ ok: true, dados: { dados: 'sinteticos' } });
    expect(m.oauth()).toHaveLength(2); expect(m.apis()).toHaveLength(1);
    const esperado = /^\d+$/.test(header) ? Number(header) * 1000 : 0;
    expect(m.sonos).toEqual([esperado]);
    if (header === '39') expect(m.oauth()[1].tempoMaximoMs).toBe(1000);
  });

  it('orçamento acaba no limitador depois da espera429: não perde a última retomada nem emite nova chamada', async () => {
    const m = montar([cota('39')]);
    const esperarReal = m.limitador.esperarVez.bind(m.limitador);
    let oauths = 0;
    vi.spyOn(m.limitador, 'esperarVez').mockImplementation(async familia => {
      await esperarReal(familia);
      if (familia === 'autenticacao' && ++oauths === 2) m.avancar(1);
    });
    expect(await m.cliente.chamar(chamada)).toMatchObject({ ok: false, status: 429, classificacao: { tipo: 'limite', prazo: { naoAntesDe: '2026-11-07T12:00:39.000Z' } } });
    expect(m.oauth()).toHaveLength(1); expect(m.apis()).toEqual([]);
  });

  it.each(['id-valido.123:abc-def', 'x'.repeat(121), 'linha\nquebrada', '<script>', 'Bearer segredo'])('requestId é limitado e saneado: %s', async id => {
    const m = montar([cota('600', id)]);
    expect(await m.cliente.chamar(chamada)).toMatchObject({ ok: false, status: 429, requestId: id === 'id-valido.123:abc-def' ? id : null });
  });

  it('usa traceId como fallback de metadado, sem expor outros cabeçalhos', async () => {
    const m = montar([json(429, {}, { 'retry-after': '600', 'x-trace-id': 'trace-sintetico', 'authorization': 'Bearer nao-expor' })]);
    const r = await m.cliente.chamar(chamada);
    expect(r).toMatchObject({ ok: false, status: 429, requestId: 'trace-sintetico' });
    expect(JSON.stringify(r)).not.toContain('nao-expor');
  });

  it('executor recebe429OAuth e aguarda gravação da retomada antes de devolver falha', async () => {
    const m = montar([cota('600')]);
    const t: TarefaAnalytics = {
      id: 'tarefa-sintetica', parceiroId: 'homologacao-isolada', moduloId: 'modulo-sintetico', appId: APP.id, lojaId: 'loja-sintetica',
      geracao: 1, dono: 'dono-sintetico', perfil: 'diario', tipo: 'D1', fuso: 'America/Sao_Paulo', unidade: { moeda: 'BRL', unidade: 'REAL' },
      identidade: { ambiente: 'TEST', merchantId: '11111111-2222-4333-8444-555555555555', dia: '2026-11-06', perfil: 'diario' },
    };
    let liberar!: () => void, entrou!: () => void;
    const inicio = new Promise<void>(r => { entrou = r; });
    const persistencia = new Promise<void>(r => { liberar = r; });
    const repo: RepositorioDoExecutorAnalytics = {
      renovar: vi.fn(async () => {}), salvarPagina: vi.fn(async () => {}),
      publicar: vi.fn(async () => 'publicada' as const), verificarAcesso: vi.fn(async () => {}),
      publicarPagamentos: vi.fn(async () => 'publicada' as const),
      publicarComplementares: vi.fn(async () => 'publicada' as const),
      falhar: vi.fn(async () => { entrou(); await persistencia; }),
    };
    let concluida = false;
    const resultado = executarTarefaAnalytics(t, { repositorio: repo, http: { app: APP, tokens: m.tokens, limitador: m.limitador, transporte: m.transporte, env: ENV, relogio: m.relogio } })
      .then(r => { concluida = true; return r; });
    await inicio;
    expect(concluida).toBe(false);
    expect(repo.falhar).toHaveBeenCalledExactlyOnceWith(t, { codigo: 'limite', http: 429, requestId: 'oauth-sintetico', naoAntesDe: '2026-11-07T12:10:00.000Z' });
    expect(repo.salvarPagina).not.toHaveBeenCalled(); expect(repo.publicar).not.toHaveBeenCalled(); expect(m.apis()).toEqual([]);
    liberar(); expect(await resultado).toEqual({ estado: 'falhou', paginas: 0 });
  });
});

describe('erros de autenticação sem cota mantêm comportamento', () => {
  it.each([400, 401, 403])('credencial HTTP%i não repete nem vira uma recusa de módulo429', async status => {
    const m = montar([json(status, { error: 'credencial-sintetica' })]);
    expect(await m.cliente.chamar(chamada)).toMatchObject({ ok: false, status: null, classificacao: { tipo: 'nao-autenticado' }, requestId: null });
    expect(m.oauth()).toHaveLength(1); expect(m.apis()).toEqual([]); expect(m.sonos).toEqual([]);
  });

  it('resposta não quota após429 não herda indevidamente seus metadados', async () => {
    const m = montar([cota('1'), json(401, {})]);
    expect(await m.cliente.chamar(chamada)).toMatchObject({ ok: false, status: null, classificacao: { tipo: 'nao-autenticado' }, requestId: null });
    expect(m.oauth()).toHaveLength(2); expect(m.apis()).toEqual([]);
  });

  it('renovação após401 de negócio também propaga429 de OAuth sem terceira emissão de negócio', async () => {
    const m = montar([json(200, { accessToken: 'token-ficticio-primeiro', expiresIn: 3600 }), cota('600')]);
    // Cliente separado preserva o mesmo serviço real de token, variando só a resposta de negócio.
    const transporte = vi.fn(async (): Promise<RespostaHttp> => json(401, {}));
    const cliente = criarClienteIfood({ app: APP, tokens: m.tokens, limitador: m.limitador, transporte, env: ENV, relogio: m.relogio, maxTentativas: 1 });
    expect(await cliente.chamar(chamada)).toMatchObject({ ok: false, status: 429, classificacao: { tipo: 'limite', prazo: { naoAntesDe: '2026-11-07T12:10:00.000Z' } } });
    expect(m.oauth()).toHaveLength(2); expect(transporte).toHaveBeenCalledOnce(); expect(m.sonos).toEqual([]);
  });
});
