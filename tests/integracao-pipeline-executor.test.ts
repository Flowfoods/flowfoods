/** Executor real + cliente HTTP real; somente repositório e transporte em memória, nenhum banco/rede. */
import { describe, expect, it, vi } from 'vitest';
import { armazemEmMemoria, ServicoDeToken, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { METRICAS_DIARIAS } from '@/lib/integracoes/ifood/analytics';
import { executarTarefaAnalytics, type RepositorioDoExecutorAnalytics } from '@/lib/integracoes/ifood/pipeline-executor';
import { ErroPipelineAnalytics, LIMITE_BYTES_JANELA, type TarefaAnalytics } from '@/lib/integracoes/ifood/pipeline-tipos';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import { FalhaDeRede, type PedidoHttp, type RespostaHttp } from '@/lib/integracoes/ifood/transporte';

const AGORA = Date.parse('2026-11-07T12:00:00.000Z');
const ENV = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: 'b'.repeat(64), IFOOD_TEST_CLIENT_SECRET: 'segredo-ficticio-executor' };
const APP: AppParaToken = { id: 'app-local', clientId: 'cliente-local', ambiente: 'TEST', nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: 'NAO_SE_APLICA' };
const tarefa = (): TarefaAnalytics => ({
  id: 'job-local', parceiroId: 'parceiro-homologacao', moduloId: 'modulo-local', appId: APP.id, lojaId: 'loja-local',
  geracao: 1, dono: 'posse-local', perfil: 'diario', tipo: 'D1',
  identidade: { ambiente: 'TEST', merchantId: '11111111-2222-4333-8444-555555555555', dia: '2026-11-06', perfil: 'diario' },
  fuso: 'America/Sao_Paulo', unidade: { moeda: 'BRL', unidade: 'REAL' },
});
const tarefaPagamentos = (): TarefaAnalytics => ({ ...tarefa(), perfil: 'pagamentos',
  identidade: { ambiente: 'TEST', merchantId: '11111111-2222-4333-8444-555555555555', dia: '2026-11-06',
    fuso: 'America/Sao_Paulo', perfil: 'pagamentos', versaoContrato: 1 },
});
const grupo = (id: string) => ({
  groupByKey: { value: { orderStatus: id, salesChannel: 'NOVO', deliveredBy: null, category: null }, count: 7 },
  ...Object.fromEntries(METRICAS_DIARIAS.map(nome => [nome, { sum: 1.99 }])),
});
function pagina(n = 1, total = 1, id = `grupo-${n}`, size = 1) {
  return { data: total === 0 ? [] : [grupo(id)], currentPage: n, size, totalItems: total, totalPages: total === 0 ? 0 : Math.ceil(total / size) };
}
const json = (dados: unknown, status = 200, cabecalhos: Record<string, string> = {}): RespostaHttp => ({ status, cabecalhos: { 'x-request-id': 'id-sintetico', ...cabecalhos }, corpo: JSON.stringify(dados) });
function montar(roteiro: (RespostaHttp | Error)[] = [json(pagina())]) {
  const eventos: string[] = [], pedidos: PedidoHttp[] = [], sonos: number[] = [];
  const repositorio: RepositorioDoExecutorAnalytics = {
    renovar: vi.fn(async () => { eventos.push('renovar'); }),
    salvarPagina: vi.fn(async (_t, p) => { eventos.push(`pagina:${p.pagina}`); }),
    publicar: vi.fn(async () => { eventos.push('publicar'); return 'publicada' as const; }),
    publicarPagamentos: vi.fn(async () => { eventos.push('pagamentos'); return 'publicada' as const; }),
    publicarComplementares: vi.fn(async () => { eventos.push('complementares'); return 'publicada' as const; }),
    verificarAcesso: vi.fn(async () => { eventos.push('acesso'); }),
    falhar: vi.fn(async () => { eventos.push('falhar'); }),
  };
  const transporte = vi.fn(async (p: PedidoHttp): Promise<RespostaHttp> => {
    if (p.url.endsWith('/oauth/token')) return json({ accessToken: 'token-ficticio-executor', expiresIn: 3600 });
    pedidos.push(p); eventos.push('http');
    const r = roteiro.shift();
    if (!r) throw new Error('Nenhuma chamada adicional autorizada no transporte de teste.');
    if (r instanceof Error) throw r;
    return r;
  });
  const dormir = async (ms: number) => { sonos.push(ms); };
  const limitador = new Limitador(() => AGORA, dormir);
  const tokens = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte, limitador, env: ENV, relogio: () => AGORA });
  const http = { app: APP, tokens, limitador, transporte, env: ENV, relogio: () => AGORA, dormir, maxTentativas: 6, esperaMaximaMs: 999_999 };
  return { repositorio, http, eventos, pedidos, sonos, transporte };
}

describe('INT-1.8D · tarefa complementar isolada', () => {
  const tarefaD = (): TarefaAnalytics => ({ ...tarefaPagamentos(), perfil: 'complementares', identidade: {
    ambiente: 'TEST', merchantId: '11111111-2222-4333-8444-555555555555', dia: '2026-11-06',
    fuso: 'America/Sao_Paulo', perfil: 'complementares', versaoContrato: 1,
  } });
  const dupla = (h: unknown = { value: { '9': 2 } }, p: unknown = { value: { true: 2 } }) => ({ data: [{ orderCreationHour: h, customerFirstOrderInMerchant: p }], currentPage: 1, size: 1, totalItems: 1, totalPages: 1 });
  it.each([[null, null], [null, { value: {} }], [{ value: { '01': 0, ['__proto__']: 7 } }, { value: { true: 2, NOVO: 3 } }]])('publica os dois termos sem acionar outro perfil %#', async (h, p) => {
    const m = montar([json(dupla(h, p))]), t = tarefaD();
    expect(await executarTarefaAnalytics(t, m)).toEqual({ estado: 'publicada', paginas: 1 });
    expect(m.eventos).toEqual(['renovar', 'renovar', 'http', 'pagina:1', 'complementares']);
    expect(m.repositorio.salvarPagina).toHaveBeenCalledWith(t, expect.objectContaining({ versaoContrato: 1 }));
    expect(m.repositorio.publicar).not.toHaveBeenCalled(); expect(m.repositorio.publicarPagamentos).not.toHaveBeenCalled();
    expect(JSON.parse(m.pedidos[0].corpo!).agg).toEqual({ terms: { orderCreationHour: ['count'], customerFirstOrderInMerchant: ['count'] } });
    expect(m.pedidos).toHaveLength(1);
  });
  it('campo ausente guarda raw e recusa publicação sem solicitar outra página', async () => {
    const m = montar([json({ ...dupla(), data: [{ orderCreationHour: null }] })]);
    expect(await executarTarefaAnalytics(tarefaD(), m)).toEqual({ estado: 'falhou', paginas: 1 });
    expect(m.repositorio.publicarComplementares).not.toHaveBeenCalled(); expect(m.repositorio.salvarPagina).toHaveBeenCalledOnce();
    expect(m.pedidos).toHaveLength(1);
  });
  it.each([403, 429, 503])('recusa %i usa a fila existente sem espera local', async status => {
    const m = montar([json({ error: true }, status, { 'retry-after': '600' })]);
    expect(await executarTarefaAnalytics(tarefaD(), m)).toEqual({ estado: 'falhou', paginas: 0 });
    expect(m.repositorio.falhar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ http: status }));
    if (status === 429) expect(m.repositorio.falhar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ naoAntesDe: '2026-11-07T12:10:00.000Z' }));
    expect(m.sonos).toEqual([]); expect(m.pedidos).toHaveLength(1); expect(m.repositorio.publicarComplementares).not.toHaveBeenCalled();
  });
  it('recusa fuso forjado antes do OAuth e não esconde falha de persistência', async () => {
    const t = tarefaD(); t.fuso = 'UTC'; const m = montar();
    expect(await executarTarefaAnalytics(t, m)).toEqual({ estado: 'falhou', paginas: 0 }); expect(m.transporte).not.toHaveBeenCalled();
    const n = montar([json(dupla())]); vi.mocked(n.repositorio.publicarComplementares).mockRejectedValue(new Error('commit'));
    await expect(executarTarefaAnalytics(tarefaD(), n)).rejects.toThrow('commit'); expect(n.repositorio.falhar).not.toHaveBeenCalled();
  });
});

describe('INT-1.8C · executor marginal usa a fila/cota existentes', () => {
  const marginal = (paymentMethod: unknown = { value: { PIX: 4 } }) => ({ data: [{ paymentMethod }], currentPage: 1, size: 1, totalItems: 1, totalPages: 1 });
  it.each([null, { value: {} }, { value: { PIX: 4, DINHEIRO: 0 } }])('guarda uma página versionada e publica apenas marginal %#', async mapa => {
    const m = montar([json(marginal(mapa))]), t = tarefaPagamentos();
    expect(await executarTarefaAnalytics(t, m)).toEqual({ estado: 'publicada', paginas: 1 });
    expect(m.eventos).toEqual(['renovar', 'renovar', 'http', 'pagina:1', 'pagamentos']);
    expect(m.repositorio.salvarPagina).toHaveBeenCalledWith(t, expect.objectContaining({ pagina: 1, versaoContrato: 1 }));
    expect(m.repositorio.publicar).not.toHaveBeenCalled(); expect(m.repositorio.verificarAcesso).not.toHaveBeenCalled();
    expect(JSON.parse(m.pedidos[0].corpo!)).toEqual({ page: 1, size: 1, filter: { referenceDate: { gte: '2026-11-06', lt: '2026-11-07' } }, agg: { terms: { paymentMethod: ['count'] } } });
    expect(m.pedidos).toHaveLength(1);
  });
  it('conserva evidência incompatível e não percorre páginas de resposta agrupada', async () => {
    const m = montar([json(pagina(1, 5))]);
    expect(await executarTarefaAnalytics(tarefaPagamentos(), m)).toEqual({ estado: 'falhou', paginas: 1 });
    expect(m.repositorio.salvarPagina).toHaveBeenCalledOnce(); expect(m.repositorio.publicarPagamentos).not.toHaveBeenCalled();
    expect(m.pedidos).toHaveLength(1); expect(m.sonos).toEqual([]);
  });
  it('recusa fração original que JSON.parse arredonda para inteiro', async () => {
    const m = montar([{ ...json({}), corpo: '{"data":[{"paymentMethod":{"value":{"PIX":1.00000000000000001}}}],"currentPage":1,"size":1,"totalItems":1,"totalPages":1}' }]);
    expect(await executarTarefaAnalytics(tarefaPagamentos(), m)).toEqual({ estado: 'falhou', paginas: 1 });
    expect(m.repositorio.publicarPagamentos).not.toHaveBeenCalled();
  });
  it.each([403, 429, 503])('preserva recusa %i durável sem retry local nem publicar diário', async status => {
    const m = montar([json({ error: true }, status, { 'retry-after': '600' })]);
    expect(await executarTarefaAnalytics(tarefaPagamentos(), m)).toEqual({ estado: 'falhou', paginas: 0 });
    expect(m.repositorio.falhar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ http: status }));
    if (status === 429) expect(m.repositorio.falhar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ naoAntesDe: '2026-11-07T12:10:00.000Z' }));
    expect(m.pedidos).toHaveLength(1); expect(m.sonos).toEqual([]);
    expect(m.repositorio.publicarPagamentos).not.toHaveBeenCalled(); expect(m.repositorio.publicar).not.toHaveBeenCalled();
  });
  it('fuso forjado é recusado antes do token/transporte', async () => {
    const m = montar(), t = tarefaPagamentos(); t.fuso = 'UTC';
    expect(await executarTarefaAnalytics(t, m)).toEqual({ estado: 'falhou', paginas: 0 });
    expect(m.transporte).not.toHaveBeenCalled();
  });
  it('falha de persistência marginal não é tratada como falha do fornecedor', async () => {
    const m = montar([json(marginal())]);
    vi.mocked(m.repositorio.publicarPagamentos).mockRejectedValue(new Error('fixture de commit'));
    await expect(executarTarefaAnalytics(tarefaPagamentos(), m)).rejects.toThrow('fixture de commit');
    expect(m.repositorio.falhar).not.toHaveBeenCalled();
  });
});

describe('executor Analytics: cobertura e recibos', () => {
  it('guarda bytes originais em ordem e só publica depois da última página; identidade TEST não é convertida', async () => {
    const original = `  ${JSON.stringify(pagina(1, 2))}\n`;
    const m = montar([{ ...json(null), corpo: original }, json(pagina(2, 2))]);
    const t = tarefa();
    expect(await executarTarefaAnalytics(t, m)).toEqual({ estado: 'publicada', paginas: 2 });
    expect(m.eventos).toEqual(['renovar', 'renovar', 'http', 'pagina:1', 'renovar', 'renovar', 'http', 'pagina:2', 'publicar']);
    expect(m.repositorio.salvarPagina).toHaveBeenNthCalledWith(1, t, { pagina: 1, corpoOriginal: original, http: 200, requestId: 'id-sintetico' });
    expect(m.repositorio.publicar).toHaveBeenCalledExactlyOnceWith(t);
    expect(t.identidade.ambiente).toBe('TEST'); expect(m.sonos).toEqual([]);
    expect(m.pedidos.map(p => JSON.parse(p.corpo!).page)).toEqual([1, 2]);
    expect(m.pedidos.every(p => p.metodo === 'POST' && p.cabecalhos['x-request-homologation'] === 'true')).toBe(true);
  });

  it('vazio oficial é publicado; vazio truncado é falha, nunca receita zero', async () => {
    const m = montar([json(pagina(1, 0))]);
    vi.mocked(m.repositorio.publicar).mockResolvedValue('vazia');
    expect(await executarTarefaAnalytics(tarefa(), m)).toEqual({ estado: 'vazia', paginas: 1 });
    const ruim = montar([json({ ...pagina(1, 2), data: [] })]);
    expect(await executarTarefaAnalytics(tarefa(), ruim)).toEqual({ estado: 'falhou', paginas: 1 });
    expect(ruim.repositorio.publicar).not.toHaveBeenCalled(); expect(ruim.repositorio.salvarPagina).toHaveBeenCalledOnce();
  });

  it.each([
    ['página diferente', pagina(3, 3)],
    ['totais mudaram', pagina(2, 3)],
    ['grupo repetido', pagina(2, 2, 'grupo-1')],
    ['faltou métrica', { ...pagina(2, 2), data: [{ groupByKey: grupo('novo').groupByKey }] }],
    ['tamanho mudou', { ...pagina(2, 2), size: 2 }],
  ])('recusa %s após prefixo válido e não publica', async (_nome, segunda) => {
    const m = montar([json(pagina(1, 2)), json(segunda)]);
    expect(await executarTarefaAnalytics(tarefa(), m)).toEqual({ estado: 'falhou', paginas: 2 });
    expect(m.repositorio.salvarPagina).toHaveBeenCalledTimes(2); expect(m.repositorio.publicar).not.toHaveBeenCalled();
    expect(m.repositorio.falhar).toHaveBeenCalledWith(expect.anything(), { codigo: 'contrato', http: 200, requestId: 'id-sintetico' });
  });

  it('recibo incompatível fica preservado; grupo/tamanho fora do teto não publica nem pede próxima página', async () => {
    for (const resposta of [{ ...pagina(), totalItems: 50_001 }, { ...pagina(), size: 501 }]) {
      const m = montar([json(resposta)]);
      expect((await executarTarefaAnalytics(tarefa(), m)).estado).toBe('falhou');
      expect(m.repositorio.salvarPagina).toHaveBeenCalledOnce(); expect(m.pedidos).toHaveLength(1);
    }
  });

  it('teto de bytes é cumulativo em UTF-8, sem truncar nem publicar prefixo', async () => {
    const grande = (n: number) => json({ ...pagina(n, 18), extensao: 'ç'.repeat(Math.floor(LIMITE_BYTES_JANELA / 34) - 1000) });
    const m = montar(Array.from({ length: 18 }, (_, i) => grande(i + 1)));
    expect(await executarTarefaAnalytics(tarefa(), m)).toEqual({ estado: 'falhou', paginas: 17 });
    expect(m.repositorio.falhar).toHaveBeenCalledWith(expect.anything(), { codigo: 'limite-local', http: 200, requestId: 'id-sintetico' });
    expect(m.repositorio.publicar).not.toHaveBeenCalled();
  });

  it('corpo acima de 2 MiB não é persistido, truncado nem publicado', async () => {
    const m = montar([json({ ...pagina(), extensao: 'ç'.repeat(1024 * 1024) })]);
    expect(await executarTarefaAnalytics(tarefa(), m)).toEqual({ estado: 'falhou', paginas: 0 });
    expect(m.repositorio.salvarPagina).not.toHaveBeenCalled(); expect(m.repositorio.publicar).not.toHaveBeenCalled();
    expect(m.repositorio.falhar).toHaveBeenCalledWith(expect.anything(), { codigo: 'limite-local', http: 200, requestId: 'id-sintetico' });
  });

  it.each(['sem-mudanca', 'pendente-periodo'] as const)('preserva decisão atômica %s do repositório', async estado => {
    const m = montar(); vi.mocked(m.repositorio.publicar).mockResolvedValue(estado);
    expect(await executarTarefaAnalytics(tarefa(), m)).toEqual({ estado, paginas: 1 });
  });
});

describe('executor Analytics: recusa e retomada duráveis', () => {
  it.each([
    [json({}, 403), { codigo: 'sem-permissao', http: 403, requestId: 'id-sintetico' }],
    [json({}, 429, { 'retry-after': '600' }), { codigo: 'limite', http: 429, requestId: 'id-sintetico', naoAntesDe: '2026-11-07T12:10:00.000Z' }],
    [json({}, 503), { codigo: 'indisponivel', http: 503, requestId: 'id-sintetico' }],
    [new FalhaDeRede('rede'), { codigo: 'indisponivel', http: null, requestId: null }],
    [json({ error: { code: 'erro-sintetico' } }), { codigo: 'erro-no-corpo', http: 200, requestId: 'id-sintetico' }],
  ])('persiste a falha uma vez antes de retornar; sem repetição/sono %#', async (resposta, falha) => {
    const m = montar([resposta as RespostaHttp | Error]);
    expect(await executarTarefaAnalytics(tarefa(), m)).toEqual({ estado: 'falhou', paginas: 0 });
    expect(m.repositorio.falhar).toHaveBeenCalledExactlyOnceWith(expect.anything(), falha);
    expect(m.pedidos).toHaveLength(1); expect(m.sonos).toEqual([]);
    expect(m.repositorio.publicar).not.toHaveBeenCalled(); expect(m.repositorio.salvarPagina).not.toHaveBeenCalled();
  });

  it('perda de posse durante token/espera recusa a emissão, sem suposta persistência', async () => {
    const m = montar(), erro = new ErroPipelineAnalytics('POSSE', 'perdida');
    vi.mocked(m.repositorio.renovar).mockResolvedValueOnce().mockRejectedValueOnce(erro);
    await expect(executarTarefaAnalytics(tarefa(), m)).rejects.toBe(erro);
    expect(m.pedidos).toEqual([]); expect(m.repositorio.falhar).not.toHaveBeenCalled();
  });

  it('401 conserva uma renovação canônica e verifica acesso de novo antes da segunda emissão', async () => {
    const m = montar([json({}, 401), json(pagina())]);
    expect((await executarTarefaAnalytics(tarefa(), m)).estado).toBe('publicada');
    expect(m.pedidos).toHaveLength(2);
    expect(m.eventos).toEqual(['renovar', 'renovar', 'http', 'renovar', 'http', 'pagina:1', 'publicar']);
  });

  it('não declara falha gravada se falhar() perde posse nem sucesso se publicação falha', async () => {
    const erro = new ErroPipelineAnalytics('POSSE', 'perdida');
    const m = montar([json({}, 403)]); vi.mocked(m.repositorio.falhar).mockRejectedValue(erro);
    await expect(executarTarefaAnalytics(tarefa(), m)).rejects.toBe(erro);
    expect(m.repositorio.falhar).toHaveBeenCalledTimes(1);
    const outro = montar(); vi.mocked(outro.repositorio.publicar).mockRejectedValue(erro);
    await expect(executarTarefaAnalytics(tarefa(), outro)).rejects.toBe(erro);
    expect(outro.repositorio.falhar).not.toHaveBeenCalled();
  });

  it('identidade de outro app é recusada antes de token ou rede', async () => {
    const m = montar(), t = tarefa(); t.appId = 'outro-app';
    expect((await executarTarefaAnalytics(t, m)).estado).toBe('falhou'); expect(m.transporte).not.toHaveBeenCalled();
  });
});

describe('acesso não equivale a snapshot diário', () => {
  const acesso = () => { const t = tarefa(); t.perfil = 'acesso'; t.tipo = 'ACESSO'; t.identidade.perfil = 'homologacao'; return t; };
  it('aceita objeto de terms sem groupBy, registra uma evidência e nunca publica', async () => {
    const m = montar([json({ terms: { orderStatus: [{ value: 'NOVO', count: 7 }] }, gmv: { sum: 123 } })]);
    expect(await executarTarefaAnalytics(acesso(), m)).toEqual({ estado: 'acesso-verificado', paginas: 1 });
    expect(m.repositorio.verificarAcesso).toHaveBeenCalledOnce(); expect(m.repositorio.publicar).not.toHaveBeenCalled();
    expect(JSON.parse(m.pedidos[0].corpo!).agg).toEqual({ metrics: { gmv: ['sum'] }, terms: { orderStatus: ['count'] } });
  });
  it.each([json(null), json([]), json({}, 204), json({ error: true })])('resposta de acesso inválida não confirma nem publica %#', async r => {
    const m = montar([r]); expect((await executarTarefaAnalytics(acesso(), m)).estado).toBe('falhou');
    expect(m.repositorio.verificarAcesso).not.toHaveBeenCalled(); expect(m.repositorio.publicar).not.toHaveBeenCalled();
  });
});
