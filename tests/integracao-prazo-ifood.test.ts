/** Contratos INT-1.3 com relógio/transporte falsos: nenhum HTTP ou banco real. */
import { describe, expect, it } from 'vitest';
import { armazemEmMemoria, ServicoDeToken, PRAZO_DO_PEDIDO_DE_TOKEN_MS, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { criarClienteIfood, type OpcoesDoCliente } from '@/lib/integracoes/ifood/http';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import { lerRetryAfter, classificar, repetivel } from '@/lib/integracoes/ifood/respostas';
import { lerTest, type AppDaLeitura } from '@/lib/integracoes/ifood/leitura-test';
import { FalhaDeRede, type PedidoHttp, type RespostaHttp } from '@/lib/integracoes/ifood/transporte';

const AGORA = Date.UTC(2026, 10, 7, 15);
const APP: AppParaToken = { id: 'app-test-local', ambiente: 'TEST', homologacao: 'NAO_SE_APLICA', clientId: 'cliente-sintetico', nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET' };
const ENV = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: 'a'.repeat(64), IFOOD_TEST_CLIENT_SECRET: 'segredo-sintetico-do-teste' };
const LOJA = '0b1f6d3e-8a51-4c2e-9d7a-3f2b6c1e5a90';
const APP_LEITURA: AppDaLeitura = { ...APP, nome: 'Teste local', categoria: 'TEST', modulos: ['MERCHANT', 'ANALYTICS'] };
const CHAMADA = { metodo: 'GET' as const, caminho: '/merchant/v1.0/merchants', familia: 'merchant' as const };
const json = (status: number, corpo: unknown = {}, cabecalhos: Record<string, string> = {}): RespostaHttp => ({ status, corpo: JSON.stringify(corpo), cabecalhos });
const limite = (header?: string) => json(429, {}, { ...(header === undefined ? {} : { 'retry-after': header }), 'x-request-id': 'req-sintetica' });
const prazo = (esperarMs: number, inicio = AGORA) => ({ esperarMs, naoAntesDe: new Date(inicio + esperarMs).toISOString() });

function montar(roteiro: (RespostaHttp | FalhaDeRede)[], opcoes: Partial<Pick<OpcoesDoCliente, 'esperaMaximaMs' | 'tempoMaximoMs' | 'maxTentativas'>> = {}, token?: RespostaHttp[]) {
  let agora = AGORA;
  const pedidos: { pedido: PedidoHttp; quando: number }[] = [], sonos: number[] = [];
  const dormir = async (ms: number) => { sonos.push(ms); agora += ms; };
  const transporte = async (pedido: PedidoHttp) => {
    pedidos.push({ pedido, quando: agora });
    const resposta = pedido.url.endsWith('/oauth/token') ? token?.shift() ?? json(200, { accessToken: 'token-sintetico', expiresIn: 21600 }) : roteiro.shift() ?? json(200);
    if (resposta instanceof FalhaDeRede) throw resposta;
    return resposta;
  };
  const limitador = new Limitador(() => agora, dormir), armazem = armazemEmMemoria();
  const tokens = new ServicoDeToken({ armazem, limitador, transporte, env: ENV, relogio: () => agora, dormir, aleatorio: () => 1 });
  const cliente = criarClienteIfood({ app: APP, tokens, limitador, transporte, env: ENV, relogio: () => agora, dormir, aleatorio: () => 1, ...opcoes });
  return { cliente, tokens, armazem, sonos, pedidos, apis: () => pedidos.filter(p => !p.pedido.url.endsWith('/oauth/token')) };
}

describe('Retry-After distingue ausência, prazo íntegro e valor fora da faixa', () => {
  it.each([
    ['600', 600_000], [new Date(AGORA + 600_000).toUTCString(), 600_000], ['99999', 99_999_000],
    ['0', 0], [new Date(AGORA - 1000).toUTCString(), 0], ['2', 2000],
  ])('preserva %s sem teto artificial', (header, ms) => {
    expect(lerRetryAfter(String(header), AGORA)).toEqual({ tipo: 'prazo', prazo: prazo(Number(ms)) });
  });

  it.each([null, undefined, '', 'lixo', '1.5', '-1', '2026-11-07'])('ausente ou sintaticamente inválido %s mantém ausência explícita', header => {
    expect(lerRetryAfter(header, AGORA)).toEqual({ tipo: 'sem-prazo' });
  });

  it.each(['9'.repeat(400), '9007199254740992', '8640000000000', 'Sun, 07 Nov 999999 15:00:00 GMT'])('prazo reconhecido fora de faixa não vira fallback: %s', header => {
    expect(lerRetryAfter(header, AGORA)).toEqual({ tipo: 'fora-da-faixa' });
    const c = classificar(429, { 'retry-after': header }, '{}', AGORA);
    expect(c).toEqual({ tipo: 'prazo-invalido' }); expect(repetivel(c)).toBe(false);
    expect(JSON.stringify(c)).not.toMatch(/Infinity|null/);
  });

  it.each([NaN, Infinity, 8_640_000_000_000_000])('soma com relógio %s não produz data inválida nem Infinity', agora => {
    expect(lerRetryAfter('1', agora)).toEqual({ tipo: 'fora-da-faixa' });
  });
});

describe('cliente respeita o prazo remoto e encerra a espera local', () => {
  it.each([['600', 600_000], [new Date(AGORA + 600_000).toUTCString(), 600_000], ['2147484', 2_147_484_000]] as const)('prazo longo %s não dorme nem faz segunda chamada', async (header, ms) => {
    const m = montar([limite(header), json(200)]);
    const r = await m.cliente.chamar(CHAMADA);
    expect(r).toMatchObject({ ok: false, status: 429, classificacao: { tipo: 'limite', prazo: prazo(ms) }, requestId: 'req-sintetica', tentativas: 1 });
    expect(m.apis()).toHaveLength(1); expect(m.sonos).toEqual([]);
    expect(!r.ok && r.frase).toContain('nenhuma nova tentativa foi agendada');
    expect(!r.ok && r.frase).toContain(prazo(ms).naoAntesDe);
  });

  it('prazo no teto local espera inteiro; um milissegundo acima encerra, sem clamping', async () => {
    const igual = montar([limite('2'), json(200)], { esperaMaximaMs: 2000 });
    expect((await igual.cliente.chamar(CHAMADA)).ok).toBe(true);
    expect(igual.sonos).toEqual([2000]); expect(igual.apis().map(p => p.quando)).toEqual([AGORA, AGORA + 2000]);
    const acima = montar([limite('2'), json(200)], { esperaMaximaMs: 1999 });
    expect((await acima.cliente.chamar(CHAMADA)).ok).toBe(false);
    expect(acima.sonos).toEqual([]); expect(acima.apis()).toHaveLength(1);
  });

  it('timeout do transporte não muda o limite separado de espera', async () => {
    const m = montar([limite('2'), json(200)], { esperaMaximaMs: 2000, tempoMaximoMs: 450 });
    expect((await m.cliente.chamar(CHAMADA)).ok).toBe(true);
    expect(m.apis().map(p => p.pedido.tempoMaximoMs)).toEqual([450, 450]);
    expect(m.sonos).toEqual([2000]);
  });

  it.each([new FalhaDeRede('rede'), json(503)])('backoff de indisponibilidade respeita o mesmo teto por espera: %j', async resposta => {
    const m = montar([resposta, json(200)], { esperaMaximaMs: 500 });
    const r = await m.cliente.chamar(CHAMADA);
    expect(r).toMatchObject({ ok: false, classificacao: { tipo: 'indisponivel' }, tentativas: 1 });
    expect(m.sonos).toEqual([]); expect(m.apis()).toHaveLength(1);
    expect(!r.ok && r.frase).toContain('nenhuma nova tentativa foi agendada');
  });

  it.each([undefined, 'lixo'])('429 sem prazo válido (%s) conserva backoff e teto de tentativas, com frase terminal factual', async header => {
    const m = montar([limite(header), limite(header), limite(header)]);
    const r = await m.cliente.chamar(CHAMADA);
    expect(r.ok).toBe(true); expect(m.sonos).toEqual([1000, 2000, 4000]); expect(m.apis()).toHaveLength(4);
    const terminal = montar([limite(header), limite(header)], { maxTentativas: 2 });
    const fim = await terminal.cliente.chamar(CHAMADA);
    expect(fim).toMatchObject({ ok: false, tentativas: 2, classificacao: { tipo: 'limite', prazo: null } });
    expect(terminal.sonos).toEqual([1000]); expect(terminal.apis()).toHaveLength(2);
    expect(!fim.ok && fim.frase).toContain('nenhuma nova tentativa foi agendada');
    expect(!fim.ok && fim.frase).not.toMatch(/espera e tenta|tenta de novo mais tarde/);
  });

  it('última tentativa mantém prazo remoto sem dormir depois do encerramento', async () => {
    const m = montar([limite('2'), limite('600')], { maxTentativas: 2 });
    const r = await m.cliente.chamar(CHAMADA);
    expect(r).toMatchObject({ ok: false, tentativas: 2, classificacao: { tipo: 'limite', prazo: prazo(600_000, AGORA + 2000) } });
    expect(m.sonos).toEqual([2000]); expect(m.apis()).toHaveLength(2);
  });

  it('prazo fora da faixa interrompe sem sono, fallback ou exposição do header', async () => {
    const header = '9'.repeat(400), m = montar([limite(header), json(200)]);
    const r = await m.cliente.chamar(CHAMADA);
    expect(r).toMatchObject({ ok: false, status: 429, classificacao: { tipo: 'prazo-invalido' }, tentativas: 1 });
    expect(!r.ok && r.frase).toContain('fora da faixa');
    expect(m.sonos).toEqual([]); expect(m.apis()).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain(header); expect(JSON.stringify(r)).not.toContain('Infinity');
  });

  it.each([NaN, Infinity, -1, 1.5, 2_147_483_648])('opção local inválida %s é recusada em vez de clamp ou timer curto', valor => {
    expect(() => montar([], { esperaMaximaMs: valor })).toThrow(/espera/i);
  });

  it.each(['40', '46', '600', '9'.repeat(400)])('token mantém prazo próprio de 40 s e não prende trava com %s', async header => {
    expect(PRAZO_DO_PEDIDO_DE_TOKEN_MS).toBe(40_000);
    const m = montar([], {}, [limite(header)]);
    await expect(m.tokens.token(APP)).rejects.toThrow(header.length > 10 ? /fora da faixa/ : new RegExp(`esperar ${header} s`));
    expect(m.pedidos).toHaveLength(1); expect(m.sonos).toEqual([]); expect(m.armazem.dados.size).toBe(0);
    // A falha liberou a trava; nova execução explícita pode pedir outro token.
    expect(await m.tokens.token(APP)).toBe('token-sintetico');
    expect(m.pedidos).toHaveLength(2);
  });

  it.each(['merchant', 'analytics'] as const)('403 %s não repete nem afirma pausa persistida', async familia => {
    const m = montar([json(403), json(200)]);
    const r = await m.cliente.chamar({ ...CHAMADA, familia });
    expect(r).toMatchObject({ ok: false, status: 403, classificacao: { tipo: 'sem-permissao' }, tentativas: 1 });
    expect(!r.ok && r.frase).not.toMatch(/pausad|desativad|agendad/);
    expect(m.apis()).toHaveLength(1); expect(m.sonos).toEqual([]);
    expect(m.pedidos.filter(p => p.pedido.url.endsWith('/oauth/token'))).toHaveLength(1);
  });
});

describe('evidência TEST preserva o prazo estruturado sem declarar integração pronta', () => {
  it.each([0, 1, 2])('429 no passo %i conserva prazo, status e requestId após JSON', async indice => {
    const respostas = [json(200, [{ id: LOJA, name: 'Loja sintética' }]), json(200), json(200)];
    respostas[indice] = limite('600');
    const m = montar(respostas);
    const leitura = await lerTest({ app: APP_LEITURA, cliente: m.cliente, dia: '2026-11-06', agora: AGORA });
    expect(leitura.ok).toBe(false); expect(m.apis()).toHaveLength(indice + 1); expect(m.sonos).toEqual([]);
    const evidencia = JSON.parse(JSON.stringify(leitura));
    expect(evidencia.passos.at(-1)).toMatchObject({ ok: false, status: 429, requestId: 'req-sintetica', tentativas: 1, retomada: prazo(600_000) });
    expect(evidencia.conclusao).toContain('nenhuma nova tentativa foi agendada');
    expect(evidencia.conclusao).not.toContain('Leitura TEST oficial com HTTP 200');
    expect(JSON.stringify(evidencia)).not.toMatch(/token-sintetico|segredo-sintetico-do-teste/);
  });
});
