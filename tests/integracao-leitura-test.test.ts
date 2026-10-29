/**
 * INT-1.4 (decisão 486) — a leitura TEST contra um servidor SIMULADO (nada sai para a rede): os pedidos do contrato (lista de
 * lojas, Analytics mínimo e do dia, sem `sort`), o cabeçalho de homologação em toda chamada às APIs e nunca na do token, o app
 * que não é de teste recusado antes de chamar, loja fora da lista nunca consultada, 403 explicado sem seguir adiante.
 */
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { armazemEmMemoria, ServicoDeToken } from '@/lib/integracoes/ifood/auth';
import { lerArgumentos } from '@/lib/integracoes/ifood/comando-leitura-test';
import { criarClienteIfood } from '@/lib/integracoes/ifood/http';
import { CAMINHO_DAS_LOJAS, caminhoDosKpis, consultaDoDia, consultaMinima, diaSeguinte, ErroDaLeitura, lerTest, ontemEmBrasilia, type AppDaLeitura } from '@/lib/integracoes/ifood/leitura-test';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import { FalhaDeRede, type PedidoHttp, type RespostaHttp } from '@/lib/integracoes/ifood/transporte';

const SEGREDO = 'segredo-do-teste-c-nunca-em-log';
const ENV = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: randomBytes(32).toString('hex'), IFOOD_TEST_CLIENT_SECRET: SEGREDO };
const APP: AppDaLeitura = { id: 'app-teste', nome: 'Teste (C)', ambiente: 'TEST', categoria: 'TEST', clientId: 'cli-teste', modulos: ['ANALYTICS', 'MERCHANT'] };
const LOJA = '0b1f6d3e-8a51-4c2e-9d7a-3f2b6c1e5a90';
const OUTRA = '7c2e9a14-5b3d-4f60-a8e1-2d9c4b7f1e63';
const AGORA = Date.UTC(2026, 9, 29, 12, 0, 0);

const json = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): RespostaHttp => ({ status, cabecalhos: { 'content-type': 'application/json', ...cabecalhos }, corpo: JSON.stringify(corpo) });
const ENVELOPE = { data: [{ groupByKey: { value: { orderStatus: 'CONCLUDED' }, count: 8 }, gmv: { sum: 240 } }], currentPage: 1, size: 1, totalItems: 1, totalPages: 1 };

function montar(rotas: { lojas?: () => RespostaHttp; kpis?: (corpo: unknown, n: number) => RespostaHttp } = {}, app = APP) {
  const pedidos: PedidoHttp[] = [];
  let kpis = 0;
  const transporte = async (p: PedidoHttp): Promise<RespostaHttp> => {
    pedidos.push(p);
    if (p.url.endsWith('/authentication/v1.0/oauth/token')) return json(200, { accessToken: 'tok-de-teste-123', type: 'bearer', expiresIn: 21600 });
    if (p.url.endsWith(CAMINHO_DAS_LOJAS)) return (rotas.lojas ?? (() => json(200, [{ id: LOJA, name: 'Loja de teste' }])))();
    if (p.url.includes('/analytics/v1.0/merchants/')) return (rotas.kpis ?? ((_c: unknown, n: number) => json(200, ENVELOPE, { 'x-request-id': `req-${n}` })))(JSON.parse(p.corpo ?? 'null'), kpis++);
    return json(404, {});
  };
  const limitador = new Limitador(() => AGORA, async () => {});
  const tokens = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte, limitador, env: ENV, relogio: () => AGORA, dormir: async () => {} });
  const cliente = criarClienteIfood({ app: { id: app.id, ambiente: app.ambiente, clientId: app.clientId, nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: app.ambiente === 'TEST' ? 'NAO_SE_APLICA' : 'PENDENTE' }, tokens, limitador, transporte, env: ENV, relogio: () => AGORA, dormir: async () => {}, aleatorio: () => 1 });
  const apis = () => pedidos.filter((p) => !p.url.endsWith('/oauth/token'));
  return { pedidos, apis, cliente, app };
}

describe('INT-1.4 · a leitura TEST', () => {
  it('uma loja na lista: lista, Analytics mínimo e do dia, com os pedidos do contrato e o cabeçalho de homologação', async () => {
    const m = montar();
    const l = await lerTest({ app: APP, cliente: m.cliente, dia: '2026-10-28', agora: AGORA });
    expect(l.ok).toBe(true);
    expect(l.loja).toBe(LOJA);
    expect(l.lojasVistas).toEqual([{ id: LOJA, nome: 'Loja de teste' }]);
    expect(l.passos.map((p) => [p.nome, p.status])).toEqual([['lojas', 200], ['analytics-minimo', 200], ['analytics-do-dia', 200]]);
    const [lojas, minimo, doDia] = m.apis();
    expect([lojas.metodo, new URL(lojas.url).pathname]).toEqual(['GET', CAMINHO_DAS_LOJAS]);
    expect([minimo.metodo, new URL(minimo.url).pathname]).toEqual(['POST', caminhoDosKpis(LOJA)]);
    expect(JSON.parse(minimo.corpo!)).toEqual({ filter: { referenceDate: { gte: '2026-10-28', lt: '2026-10-29' } }, agg: { metrics: { gmv: ['sum'] }, terms: { orderStatus: ['count'] } }, page: 1, size: 100 });
    const corpoDoDia = JSON.parse(doDia.corpo!);
    expect(corpoDoDia).toEqual(consultaDoDia('2026-10-28'));
    expect(corpoDoDia.agg.groupBy.fields).toEqual(['orderStatus', 'salesChannel', 'deliveredBy', 'category']);
    // Sem sort em nenhuma consulta (num caso documentado, a ordenação mudou contagens).
    for (const p of [minimo, doDia]) expect(JSON.parse(p.corpo!)).not.toHaveProperty('sort');
    // O cabeçalho de homologação em toda chamada às APIs; nunca na do token.
    for (const p of m.apis()) expect(p.cabecalhos['x-request-homologation']).toBe('true');
    for (const p of m.pedidos.filter((x) => x.url.endsWith('/oauth/token'))) expect(Object.keys(p.cabecalhos).map((k) => k.toLowerCase())).not.toContain('x-request-homologation');
    expect(l.passos[1].resumo).toEqual({ currentPage: 1, size: 1, totalItems: 1, totalPages: 1, itensNaPagina: 1 });
    expect(l.conclusao).toMatch(/Leitura TEST oficial com HTTP 200.*req-0.*req-1/);
    expect(JSON.stringify(l)).not.toContain('tok-de-teste-123');
  });

  it('app que não é o de teste (ou sem Analytics) é recusado antes de qualquer chamada', async () => {
    for (const app of [
      { ...APP, ambiente: 'PRODUCAO' as const, categoria: 'BI' },
      { ...APP, categoria: 'BI' },
      { ...APP, modulos: ['MERCHANT'] },
    ]) {
      const m = montar({}, app);
      await expect(lerTest({ app, cliente: m.cliente, dia: '2026-10-28', agora: AGORA })).rejects.toBeInstanceOf(ErroDaLeitura);
      expect(m.pedidos).toHaveLength(0);
    }
  });

  it('dia ou loja inválidos: recusados antes de chamar', async () => {
    const m = montar();
    await expect(lerTest({ app: APP, cliente: m.cliente, dia: '2026-02-30', agora: AGORA })).rejects.toThrow(/Dia inválido/);
    await expect(lerTest({ app: APP, cliente: m.cliente, dia: '2026-10-28', loja: 'loja-1', agora: AGORA })).rejects.toThrow(/UUID/);
    // D-1 (decisão 488): hoje e o futuro não existem no Analytics (e intervalo inválido conta como infração).
    await expect(lerTest({ app: APP, cliente: m.cliente, dia: '2026-10-29', agora: AGORA })).rejects.toThrow(/só tem até ontem \(2026-10-28/);
    await expect(lerTest({ app: APP, cliente: m.cliente, dia: '2030-01-01', agora: AGORA })).rejects.toThrow(/só tem até ontem/);
    expect(m.pedidos).toHaveLength(0);
  });

  it('loja pedida fora da lista do app: nada é consultado nela', async () => {
    const m = montar();
    const l = await lerTest({ app: APP, cliente: m.cliente, dia: '2026-10-28', loja: OUTRA.toUpperCase(), agora: AGORA });
    expect(l.ok).toBe(false);
    expect(l.conclusao).toMatch(/não está na lista que o app de teste enxerga/);
    expect(m.apis().map((p) => new URL(p.url).pathname)).toEqual([CAMINHO_DAS_LOJAS]);
  });

  it('duas lojas sem --loja: pede qual; nenhuma loja: diz para vincular; com --loja da lista, consulta só ela', async () => {
    const duas = () => json(200, [{ id: LOJA, name: 'A' }, { id: OUTRA, name: 'B' }]);
    const m1 = montar({ lojas: duas });
    const l1 = await lerTest({ app: APP, cliente: m1.cliente, dia: '2026-10-28', agora: AGORA });
    expect(l1.conclusao).toMatch(/enxerga 2 lojas; diga qual consultar com --loja/);
    expect(m1.apis()).toHaveLength(1);
    const m2 = montar({ lojas: () => json(200, []) });
    expect((await lerTest({ app: APP, cliente: m2.cliente, dia: '2026-10-28', agora: AGORA })).conclusao).toMatch(/não enxerga nenhuma loja/);
    const m3 = montar({ lojas: duas });
    const l3 = await lerTest({ app: APP, cliente: m3.cliente, dia: '2026-10-28', loja: OUTRA, agora: AGORA });
    expect(l3.ok).toBe(true);
    expect(m3.apis().slice(1).every((p) => new URL(p.url).pathname === caminhoDosKpis(OUTRA))).toBe(true);
  });

  it('403 no Analytics: explica o que conferir, não repete e não faz a consulta do dia', async () => {
    const m = montar({ kpis: () => json(403, { message: 'Forbidden' }) });
    const l = await lerTest({ app: APP, cliente: m.cliente, dia: '2026-10-28', agora: AGORA });
    expect(l.ok).toBe(false);
    expect(l.passos.map((p) => [p.nome, p.status])).toEqual([['lojas', 200], ['analytics-minimo', 403]]);
    expect(l.conclusao).toMatch(/403 no Analytics: o token do app de teste não tem o módulo/);
    expect(m.apis()).toHaveLength(2);
  });

  it('a consulta do Analytics é leitura repetível: falha de rede na 1ª tentativa repete e segue (POST marcado idempotente)', async () => {
    const m = montar({
      kpis: (_c, n) => {
        if (n === 0) throw new FalhaDeRede('rede');
        return json(200, ENVELOPE);
      },
    });
    const l = await lerTest({ app: APP, cliente: m.cliente, dia: '2026-10-28', agora: AGORA });
    expect(l.ok).toBe(true);
    expect(m.apis().filter((p) => p.url.includes('/analytics/'))).toHaveLength(3);
  });

  it('lista em formato inesperado não vira "nenhuma loja"', async () => {
    const m = montar({ lojas: () => json(200, { merchants: [] }) });
    const l = await lerTest({ app: APP, cliente: m.cliente, dia: '2026-10-28', agora: AGORA });
    expect(l.ok).toBe(false);
    expect(l.conclusao).toMatch(/formato inesperado/);
  });
});

describe('INT-1.4 · datas e argumentos', () => {
  it('dia seguinte nas viradas; ontem no fuso de Brasília', () => {
    expect(diaSeguinte('2026-10-31')).toBe('2026-11-01');
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01');
    expect(diaSeguinte('2028-02-28')).toBe('2028-02-29');
    expect(diaSeguinte('2026-13-01')).toBeNull();
    // 29/10 às 02:00 UTC ainda é 28/10 em Brasília: ontem = 27/10.
    expect(ontemEmBrasilia(Date.UTC(2026, 9, 29, 2, 0, 0))).toBe('2026-10-27');
    expect(ontemEmBrasilia(Date.UTC(2026, 9, 29, 12, 0, 0))).toBe('2026-10-28');
    expect(consultaMinima('2026-10-28').filter.referenceDate).toEqual({ gte: '2026-10-28', lt: '2026-10-29' });
  });

  it('argumentos do comando', () => {
    expect(lerArgumentos(['--client-id', 'abc', '--loja', LOJA, '--dia', '2026-10-28', '--token-novo'])).toEqual({ ok: true, opcoes: { clientId: 'abc', loja: LOJA, dia: '2026-10-28', tokenNovo: true } });
    expect(lerArgumentos(['--client-id'])).toEqual({ ok: false, erro: 'Falta o valor de --client-id.' });
    expect(lerArgumentos(['--ambiente', 'PRODUCAO'])).toMatchObject({ ok: false, erro: expect.stringMatching(/Opção desconhecida/) });
  });
});
