/**
 * INT-1.3 (decisão 485) — o cliente do iFood contra um servidor SIMULADO (o transporte é trocado; nada sai para a rede):
 *  - token: o pedido é o do contrato (form, camelCase, client_credentials); vem do cache; renova 10 min antes; 10 pedidos juntos
 *    e dois "processos" ao mesmo tempo fazem UM pedido de token; guardado cifrado; chave trocada = token novo;
 *  - credencial recusada para sem repetir; limite e indisponibilidade na rota do token esperam e tentam de novo;
 *  - chamadas: TEST manda o cabeçalho de homologação e PRODUCAO NUNCA (em todo pedido de um fluxo longo);
 *  - 401 → token novo e uma nova tentativa; 403 e 400 → nenhuma repetição; 429 respeita o Retry-After; 5xx e falha de rede
 *    repetem com limite; 200 com erro no corpo não é sucesso;
 *  - o limitador segura a família no limite (com relógio simulado);
 *  - nenhum registro leva token ou segredo; mensagens de terceiros saem sem token.
 */
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { armazemEmMemoria, ErroDeAutenticacao, ServicoDeToken, MARGEM_DE_RENOVACAO_MS, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { criarClienteIfood, semSegredo, type RegistroDeChamada } from '@/lib/integracoes/ifood/http';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import { classificar, esperaDoBackoff, lerRetryAfter } from '@/lib/integracoes/ifood/respostas';
import { FalhaDeRede, type PedidoHttp, type RespostaHttp } from '@/lib/integracoes/ifood/transporte';

const SEGREDO = 'segredo-do-app-de-teste-nunca-em-log';
const ENV = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: randomBytes(32).toString('hex'), IFOOD_TEST_CLIENT_SECRET: SEGREDO, IFOOD_BI_CLIENT_SECRET: SEGREDO };
const APP_TEST: AppParaToken = { id: 'app-teste', ambiente: 'TEST', clientId: 'a932c3e2-6117-4df2-8c72-1a7b9ccda4f4', nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: 'NAO_SE_APLICA' };
const APP_PROD: AppParaToken = { id: 'app-bi', ambiente: 'PRODUCAO', clientId: 'cliente-bi', nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', homologacao: 'HOMOLOGADO' };

/** Relógio e sono simulados: dormir avança o relógio na hora. */
function tempo(inicio = Date.UTC(2026, 9, 29, 12, 0, 0)) {
  let agora = inicio;
  const sonos: number[] = [];
  return { relogio: () => agora, dormir: async (ms: number) => { sonos.push(ms); agora += ms; }, avancar: (ms: number) => { agora += ms; }, sonos };
}

const json = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): RespostaHttp => ({ status, cabecalhos: { 'content-type': 'application/json', ...cabecalhos }, corpo: JSON.stringify(corpo) });

/** Servidor simulado: a rota do token e um roteiro de respostas para as demais; guarda tudo o que recebeu. */
function servidor(roteiro: (RespostaHttp | 'rede')[] = [], token: () => RespostaHttp = () => json(200, { accessToken: `tok-${Math.random().toString(36).slice(2)}`, type: 'bearer', expiresIn: 21600 })) {
  const pedidos: PedidoHttp[] = [];
  const transporte = async (p: PedidoHttp): Promise<RespostaHttp> => {
    pedidos.push(p);
    if (p.url.endsWith('/authentication/v1.0/oauth/token')) return token();
    const r = roteiro.shift() ?? json(200, { ok: true });
    if (r === 'rede') throw new FalhaDeRede('rede');
    return r;
  };
  return { pedidos, transporte, dosTokens: () => pedidos.filter((p) => p.url.endsWith('/oauth/token')), dasApis: () => pedidos.filter((p) => !p.url.endsWith('/oauth/token')) };
}

function montar(o: { app?: AppParaToken; roteiro?: (RespostaHttp | 'rede')[]; token?: () => RespostaHttp; armazem?: ReturnType<typeof armazemEmMemoria>; t?: ReturnType<typeof tempo> } = {}) {
  const t = o.t ?? tempo();
  const s = servidor(o.roteiro, o.token);
  const armazem = o.armazem ?? armazemEmMemoria();
  const limitador = new Limitador(t.relogio, t.dormir);
  const tokens = new ServicoDeToken({ armazem, transporte: s.transporte, limitador, env: ENV, relogio: t.relogio, dormir: t.dormir, aleatorio: () => 1 });
  const registros: RegistroDeChamada[] = [];
  const cliente = criarClienteIfood({ app: o.app ?? APP_TEST, tokens, limitador, transporte: s.transporte, env: ENV, relogio: t.relogio, dormir: t.dormir, aleatorio: () => 1, registrar: (r) => registros.push(r) });
  return { t, s, armazem, tokens, cliente, registros };
}

describe('INT-1.3 · o token do app', () => {
  it('o pedido do contrato: POST form com grantType, clientId e clientSecret; sem cabeçalho de homologação; guarda cifrado', async () => {
    const m = montar();
    const tok = await m.tokens.token(APP_TEST);
    const [p] = m.s.dosTokens();
    expect(p.metodo).toBe('POST');
    expect(p.url).toBe('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token');
    expect(p.cabecalhos['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(p.corpo!))).toEqual({ grantType: 'client_credentials', clientId: APP_TEST.clientId, clientSecret: SEGREDO });
    const guardado = m.armazem.dados.get(APP_TEST.id)!;
    expect(guardado.tokenCifrado).not.toContain(tok);
    expect(guardado.expiraEm.getTime() - guardado.emitidoEm.getTime()).toBe(21600 * 1000);
  });

  it('cache: a segunda vez não pede; 10 min antes de vencer, pede de novo', async () => {
    const m = montar();
    const a = await m.tokens.token(APP_TEST);
    expect(await m.tokens.token(APP_TEST)).toBe(a);
    expect(m.s.dosTokens()).toHaveLength(1);
    m.t.avancar(21600 * 1000 - MARGEM_DE_RENOVACAO_MS - 1000);
    expect(await m.tokens.token(APP_TEST)).toBe(a);
    m.t.avancar(2000);
    expect(await m.tokens.token(APP_TEST)).not.toBe(a);
    expect(m.s.dosTokens()).toHaveLength(2);
  });

  it('10 pedidos juntos fazem um pedido de token; dois "processos" com o mesmo armazém também', async () => {
    const m = montar();
    const tokens = await Promise.all(Array.from({ length: 10 }, () => m.tokens.token(APP_TEST)));
    expect(new Set(tokens).size).toBe(1);
    expect(m.s.dosTokens()).toHaveLength(1);
    // Dois serviços (processos) com o MESMO armazém e a trava dele: o segundo relê o que o primeiro gravou.
    const armazem = armazemEmMemoria();
    const t = tempo();
    const s = servidor();
    const lim = new Limitador(t.relogio, t.dormir);
    const p1 = new ServicoDeToken({ armazem, transporte: s.transporte, limitador: lim, env: ENV, relogio: t.relogio, dormir: t.dormir });
    const p2 = new ServicoDeToken({ armazem, transporte: s.transporte, limitador: lim, env: ENV, relogio: t.relogio, dormir: t.dormir });
    const [x, y] = await Promise.all([p1.token(APP_TEST), p2.token(APP_TEST)]);
    expect(x).toBe(y);
    expect(s.dosTokens()).toHaveLength(1);
  });

  it('chave de cifragem trocada: o guardado não serve e vem um token novo (sem erro)', async () => {
    const armazem = armazemEmMemoria();
    const m1 = montar({ armazem });
    await m1.tokens.token(APP_TEST);
    const outraChave = { ...ENV, INTEGRACAO_CHAVE_CIFRAGEM: randomBytes(32).toString('hex') };
    const t = tempo();
    const s = servidor();
    const novo = new ServicoDeToken({ armazem, transporte: s.transporte, limitador: new Limitador(t.relogio, t.dormir), env: outraChave, relogio: t.relogio, dormir: t.dormir });
    await novo.token(APP_TEST);
    expect(s.dosTokens()).toHaveLength(1);
  });

  it('credencial recusada (401/400): erro claro, sem repetir; sem o segredo no cofre: diz o nome da variável', async () => {
    for (const status of [401, 400]) {
      const m = montar({ token: () => json(status, { error: { code: 'Unauthorized', message: 'invalid' } }) });
      await expect(m.tokens.token(APP_TEST)).rejects.toThrow(ErroDeAutenticacao);
      await expect(m.tokens.token(APP_TEST)).rejects.toThrow(/IFOOD_TEST_CLIENT_SECRET; nada foi repetido/);
      expect(m.s.dosTokens()).toHaveLength(2); // uma por chamada, nunca uma tempestade
    }
    const t = tempo();
    const s = servidor();
    const semSegredo = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte: s.transporte, limitador: new Limitador(t.relogio, t.dormir), env: { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: ENV.INTEGRACAO_CHAVE_CIFRAGEM }, relogio: t.relogio, dormir: t.dormir });
    await expect(semSegredo.token(APP_TEST)).rejects.toThrow(/Falta a variável IFOOD_TEST_CLIENT_SECRET/);
    expect(s.pedidos).toHaveLength(0);
  });

  it('token com 429 espera o Retry-After e tenta de novo; resposta sem token válido é recusada', async () => {
    let n = 0;
    const m = montar({ token: () => (++n === 1 ? json(429, {}, { 'retry-after': '3' }) : json(200, { accessToken: 'tok-depois', expiresIn: 600 })) });
    expect(await m.tokens.token(APP_TEST)).toBe('tok-depois');
    expect(m.t.sonos).toContain(3000);
    const ruim = montar({ token: () => json(200, { accessToken: 'x'.repeat(8001), expiresIn: 60 }) });
    await expect(ruim.tokens.token(APP_TEST)).rejects.toThrow('O iFood respondeu sem um token válido.');
  });
});

describe('INT-1.3 · as chamadas', () => {
  const chamada = { metodo: 'GET' as const, caminho: '/merchant/v1.0/merchants', familia: 'merchant' as const };

  it('TEST manda o cabeçalho de homologação; PRODUCAO nunca, em todo pedido de um fluxo com 401, 429, 5xx e rede', async () => {
    const teste = montar({ app: APP_TEST });
    expect((await teste.cliente.chamar(chamada)).ok).toBe(true);
    expect(teste.s.dasApis()[0].cabecalhos['x-request-homologation']).toBe('true');

    const prod = montar({ app: APP_PROD, roteiro: [json(401, {}), json(429, {}, { 'retry-after': '1' }), json(503, {}), 'rede', json(200, { merchants: [] })] });
    const r = await prod.cliente.chamar(chamada);
    expect(r.ok).toBe(true);
    expect(prod.s.pedidos.length).toBeGreaterThan(5);
    for (const p of prod.s.pedidos) expect(Object.keys(p.cabecalhos).map((k) => k.toLowerCase())).not.toContain('x-request-homologation');
  });

  it('401: invalida o token, pede outro e tenta UMA vez; de novo 401, para', async () => {
    const m = montar({ roteiro: [json(401, {}), json(200, { ok: 1 })] });
    const r = await m.cliente.chamar(chamada);
    expect(r.ok).toBe(true);
    expect(m.s.dosTokens()).toHaveLength(2);
    const sempre = montar({ roteiro: [json(401, {}), json(401, {}), json(401, {}), json(401, {})] });
    const r2 = await sempre.cliente.chamar(chamada);
    expect(r2.ok).toBe(false);
    expect(!r2.ok && r2.classificacao.tipo).toBe('nao-autenticado');
    expect(sempre.s.dasApis()).toHaveLength(2);
    expect(sempre.s.dosTokens()).toHaveLength(2);
  });

  it('403 e 400: nenhuma repetição, com a frase para a tela', async () => {
    for (const [status, tipo] of [[403, 'sem-permissao'], [400, 'requisicao-invalida']] as const) {
      const m = montar({ roteiro: [json(status, { error: { code: 'x' } })] });
      const r = await m.cliente.chamar(chamada);
      expect(!r.ok && r.classificacao.tipo).toBe(tipo);
      expect(!r.ok && r.tentativas).toBe(1);
      expect(m.s.dasApis()).toHaveLength(1);
    }
  });

  it('429 respeita o Retry-After; 5xx e rede repetem com espera crescente até o limite; 200 com erro no corpo não é sucesso', async () => {
    const lim = montar({ roteiro: [json(429, {}, { 'retry-after': '7' }), json(200, { ok: 1 })] });
    expect((await lim.cliente.chamar(chamada)).ok).toBe(true);
    expect(lim.t.sonos).toContain(7000);

    const fora = montar({ roteiro: [json(503, {}), json(502, {}), 'rede', json(500, {})] });
    const r = await fora.cliente.chamar(chamada);
    expect(!r.ok && r.classificacao.tipo).toBe('indisponivel');
    expect(fora.s.dasApis()).toHaveLength(4);
    expect(fora.t.sonos.filter((ms) => ms >= 1000)).toEqual([1000, 2000, 4000]);

    const corpo = montar({ roteiro: [json(200, { error: { code: 'BadRequest', message: 'x' } })] });
    const r3 = await corpo.cliente.chamar(chamada);
    expect(!r3.ok && r3.classificacao).toEqual({ tipo: 'erro-no-corpo', codigo: 'BadRequest' });
  });

  it('o limitador segura a família no limite: 450 chamadas de Analytics passam; a 451ª espera', async () => {
    const t = tempo();
    const lim = new Limitador(t.relogio, t.dormir);
    for (let i = 0; i < 450; i++) await lim.esperarVez('analytics');
    expect(t.sonos).toEqual([]);
    await lim.esperarVez('analytics');
    // Janela deslizante (decisão 487): a 451ª espera a primeira sair da janela de 60 s.
    expect(t.sonos).toEqual([60_001]);
  });

  it('janela deslizante: em nenhum intervalo de 60 s passam mais de 90% do limite, nem depois de um tempo parado', async () => {
    const t = tempo();
    const lim = new Limitador(t.relogio, t.dormir);
    t.avancar(120_000);
    const quando: number[] = [];
    for (let i = 0; i < 300; i++) {
      await lim.esperarVez('autenticacao');
      quando.push(t.relogio());
    }
    expect(lim.capacidade('autenticacao')).toBe(90);
    for (let i = 0; i + 90 < quando.length; i++) expect(quando[i + 90] - quando[i]).toBeGreaterThanOrEqual(60_000);
    expect(quando.filter((q) => q < quando[0] + 60_000)).toHaveLength(90);
  });

  it('nenhum registro leva token ou segredo; caminho estranho é recusado antes de sair', async () => {
    const m = montar({ roteiro: [json(401, {}), json(200, { ok: 1 })] });
    await m.cliente.chamar(chamada);
    const texto = JSON.stringify(m.registros);
    expect(texto).not.toContain(SEGREDO);
    expect(texto).not.toMatch(/tok-/);
    expect(m.registros.map((r) => [r.status, r.tipo])).toEqual([[401, 'nao-autenticado'], [200, 'ok']]);
    await expect(m.cliente.chamar({ ...chamada, caminho: 'https://evil.com/x' })).rejects.toThrow('Caminho de chamada inválido.');
    await expect(m.cliente.chamar({ ...chamada, caminho: '/../../x' })).rejects.toThrow('Caminho de chamada inválido.');
    expect(semSegredo('falhou com Authorization: Bearer abc.def-123 e clientSecret=xyz&a=1 e {"accessToken":"q"}')).toBe('falhou com Authorization: Bearer [oculto] e clientSecret=[oculto]&a=1 e {"accessToken":"[oculto]"}');
    expect(semSegredo('{"token":"abc"} e token=xyz')).toBe('{"token":"[oculto]"} e token=[oculto]');
  });
});

describe('INT-1.3 · leitura das respostas', () => {
  it('Retry-After em segundos ou data; teto de 5 min; backoff 1, 2, 4… até 30 s', () => {
    const agora = Date.UTC(2026, 9, 29, 12, 0, 0);
    expect(lerRetryAfter('2', agora)).toBe(2000);
    expect(lerRetryAfter(new Date(agora + 5000).toUTCString(), agora)).toBe(5000);
    expect(lerRetryAfter('99999', agora)).toBe(300_000);
    expect(lerRetryAfter('lixo', agora)).toBeNull();
    // Só segundos inteiros ou data HTTP: "1.5" não vira data (antes virava espera zero).
    expect(lerRetryAfter('1.5', agora)).toBeNull();
    expect(lerRetryAfter('2026-10-29', agora)).toBeNull();
    expect(lerRetryAfter('Thursday, 29-Oct-26 12:00:09 GMT', agora)).toBe(9000);
    expect([2, 3, 4, 5, 6, 7, 8].map((n) => esperaDoBackoff(n, () => 1))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(esperaDoBackoff(2, () => 0)).toBe(500);
    expect(classificar(204, {}, '', agora)).toEqual({ tipo: 'ok' });
    expect(classificar(418, {}, '', agora)).toEqual({ tipo: 'inesperado' });
  });
});

describe('INT-1.3 · correções da revisão (decisão 487)', () => {
  const chamada = { metodo: 'GET' as const, caminho: '/merchant/v1.0/merchants', familia: 'merchant' as const };

  it('chave geral desligada ou app de produção sem homologação: nada sai, nem o pedido de token', async () => {
    for (const [app, env] of [
      [APP_TEST, { ...ENV, INTEGRACAO_IFOOD_ATIVA: 'false' }],
      [{ ...APP_PROD, homologacao: 'PENDENTE' as const }, ENV],
      [{ ...APP_PROD, homologacao: 'EM_ANDAMENTO' as const }, ENV],
    ] as const) {
      const t = tempo();
      const s = servidor();
      const limitador = new Limitador(t.relogio, t.dormir);
      const tokens = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte: s.transporte, limitador, env, relogio: t.relogio, dormir: t.dormir });
      const cliente = criarClienteIfood({ app, tokens, limitador, transporte: s.transporte, env, relogio: t.relogio, dormir: t.dormir });
      const r = await cliente.chamar(chamada);
      expect(!r.ok && r.classificacao.tipo).toBe('bloqueada');
      expect(!r.ok && r.frase).toMatch(/desligada|não homologado/);
      await expect(tokens.token(app)).rejects.toThrow(ErroDeAutenticacao);
      expect(s.pedidos).toHaveLength(0);
    }
  });

  it('8 chamadas juntas com 401 no token velho: UMA renovação (cada 401 descarta só o token que usou)', async () => {
    const t = tempo();
    const pedidos: PedidoHttp[] = [];
    let emitidos = 0;
    let naApi = 0;
    // Atrasos reais e escalonados: o 401 da 1ª chega antes da renovação; os das outras, depois dela (o caso da tempestade).
    const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const transporte = async (p: PedidoHttp): Promise<RespostaHttp> => {
      pedidos.push(p);
      if (p.url.endsWith('/oauth/token')) {
        await esperar(3);
        return json(200, { accessToken: `tok-${++emitidos}`, type: 'bearer', expiresIn: 21600 });
      }
      const n = naApi++;
      if (n < 8) await esperar(n * 15);
      return p.cabecalhos.Authorization === 'Bearer tok-1' ? json(401, {}) : json(200, { ok: 1 });
    };
    const limitador = new Limitador(t.relogio, t.dormir);
    const tokens = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte, limitador, env: ENV, relogio: t.relogio, dormir: t.dormir });
    const cliente = criarClienteIfood({ app: APP_TEST, tokens, limitador, transporte, env: ENV, relogio: t.relogio, dormir: t.dormir, aleatorio: () => 1 });
    const r = await Promise.all(Array.from({ length: 8 }, () => cliente.chamar(chamada)));
    expect(r.every((x) => x.ok)).toBe(true);
    expect(pedidos.filter((p) => p.url.endsWith('/oauth/token'))).toHaveLength(2);
  });

  it('401 com a trava do token sem responder: "não autenticado" com a frase, sem estourar (decisão 488)', async () => {
    const t = tempo();
    const s = servidor([json(401, {})]);
    const base = armazemEmMemoria();
    let travas = 0;
    // A 1ª trava (pedir o token) funciona; a 2ª (descartar depois do 401) não responde.
    const armazem = { ...base, comTrava: <T,>(appId: string, f: Parameters<typeof base.comTrava<T>>[1]) => (++travas === 1 ? base.comTrava(appId, f) : Promise.reject(new ErroDeAutenticacao('A trava do token no banco não respondeu a tempo.'))) };
    const limitador = new Limitador(t.relogio, t.dormir);
    const tokens = new ServicoDeToken({ armazem, transporte: s.transporte, limitador, env: ENV, relogio: t.relogio, dormir: t.dormir });
    const cliente = criarClienteIfood({ app: APP_TEST, tokens, limitador, transporte: s.transporte, env: ENV, relogio: t.relogio, dormir: t.dormir });
    const r = await cliente.chamar(chamada);
    expect(r).toMatchObject({ ok: false, status: 401, classificacao: { tipo: 'nao-autenticado' }, frase: expect.stringMatching(/trava do token/) });
  });

  it('validade curta não vira um pedido por chamada (margem = metade da validade); validade enorme fica em 24 h', async () => {
    const m = montar({ token: () => json(200, { accessToken: 'tok-curto', expiresIn: 600 }) });
    for (let i = 0; i < 5; i++) expect((await m.cliente.chamar(chamada)).ok).toBe(true);
    expect(m.s.dosTokens()).toHaveLength(1);
    m.t.avancar(301_000);
    await m.cliente.chamar(chamada);
    expect(m.s.dosTokens()).toHaveLength(2);
    const longo = montar({ token: () => json(200, { accessToken: 'tok-longo', expiresIn: 10 * 86_400 }) });
    await longo.tokens.token(APP_TEST);
    const g = longo.armazem.dados.get(APP_TEST.id)!;
    expect(g.expiraEm.getTime() - g.emitidoEm.getTime()).toBe(86_400_000);
  });

  it('token: Retry-After maior que o prazo para na hora, sem esperar com a trava presa e sem repetir', async () => {
    const m = montar({ token: () => json(429, {}, { 'retry-after': '46' }) });
    await expect(m.tokens.token(APP_TEST)).rejects.toThrow(/pediu para esperar 46 s/);
    expect(m.s.dosTokens()).toHaveLength(1);
    expect(m.t.sonos.filter((ms) => ms >= 1000)).toEqual([]);
  });

  it('escrita não se repete às cegas: falha de rede ou 5xx num POST comum para; POST de leitura marcado repete', async () => {
    const post = { metodo: 'POST' as const, caminho: '/review/v2.0/merchants/x/reviews/y/answers', familia: 'review' as const, corpo: { text: 'Obrigado' } };
    const rede = montar({ roteiro: ['rede', json(200, { ok: 1 })] });
    const r1 = await rede.cliente.chamar(post);
    expect(r1.ok).toBe(false);
    expect(!r1.ok && r1.frase).toMatch(/pode ter chegado ao iFood/);
    expect(rede.s.dasApis()).toHaveLength(1);
    const cincoxx = montar({ roteiro: [json(503, {}), json(200, { ok: 1 })] });
    expect((await cincoxx.cliente.chamar(post)).ok).toBe(false);
    expect(cincoxx.s.dasApis()).toHaveLength(1);
    const leitura = montar({ roteiro: ['rede', json(503, {}), json(200, { ok: 1 })] });
    expect((await leitura.cliente.chamar({ ...post, caminho: '/analytics/v1.0/merchants/x/orders/kpis', familia: 'analytics', idempotente: true })).ok).toBe(true);
    expect(leitura.s.dasApis()).toHaveLength(3);
    // 429 se repete mesmo em escrita: o iFood não processou.
    const limite = montar({ roteiro: [json(429, {}, { 'retry-after': '1' }), json(200, { ok: 1 })] });
    expect((await limite.cliente.chamar(post)).ok).toBe(true);
  });
});
