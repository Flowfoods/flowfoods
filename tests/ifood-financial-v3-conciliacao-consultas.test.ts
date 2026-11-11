import { describe, expect, it, vi } from 'vitest';
import { acompanharConciliacaoFinancialV3, solicitarConciliacaoFinancialV3 } from '../src/lib/integracoes/ifood/financial-v3-consultas';
import type { Transporte } from '../src/lib/integracoes/ifood/transporte';

const escopo = { merchantId: '00000000-0000-4000-8000-000000000001', competencia: '2026-02' };
const protocolo = { ...escopo, requestId: '00000000-0000-4000-8000-000000000002' };
const rota = 'https://merchant-api.ifood.com.br/financial/v3.0/merchants/' + escopo.merchantId + '/reconciliation/on-demand';
const eco = { id: protocolo.requestId, merchantId: escopo.merchantId, competence: escopo.competencia };
const resposta = (status: number, dados?: unknown) => ({ status, cabecalhos: {}, corpo: dados === undefined ? '' : JSON.stringify(dados) });
const esperar = () => vi.fn(async (_ms: number) => {});
const pronto = resposta(200, { ...eco, status: 'processed', downloadPath: 'https://example.invalid/relatorio.csv.gz' });

describe('solicitação de conciliação por loja e competência', () => {
  it.each([200, 202])('envia um POST e recebe um protocolo (HTTP %i)', async status => {
    const corpo = status === 202 ? { requestId: protocolo.requestId } : { merchantId: escopo.merchantId, competence: escopo.competencia, requestId: protocolo.requestId };
    const enviar = vi.fn<Transporte>().mockResolvedValue(resposta(status, corpo));
    expect(await solicitarConciliacaoFinancialV3(escopo, enviar)).toEqual({ estado: 'SOLICITADO', protocolo });
    expect(enviar).toHaveBeenCalledExactlyOnceWith({
      url: rota, metodo: 'POST', cabecalhos: { accept: 'application/json', 'content-type': 'application/json' },
      corpo: JSON.stringify({ competence: '2026-02' }), tempoMaximoMs: 15_000,
    });
  });

  it.each([{}, { code: '409', message: 'Já solicitado.' }, { lastRequestId: protocolo.requestId }])(
    'retoma um conflito somente quando o protocolo já era conhecido', async corpo => {
      const enviar = vi.fn<Transporte>().mockResolvedValue(resposta(409, corpo));
      expect(await solicitarConciliacaoFinancialV3(escopo, enviar)).toEqual({ estado: 'CONFLITO_SEM_PROTOCOLO', consulta: escopo });
      expect(await solicitarConciliacaoFinancialV3(escopo, enviar, protocolo)).toEqual({ estado: 'REUTILIZADO', protocolo });
      expect(enviar.mock.calls.map(([p]) => p.metodo)).toEqual(['POST', 'POST']);
    });

  it('não substitui o protocolo conhecido por um id diferente informado no 409', async () => {
    const enviar = vi.fn<Transporte>().mockResolvedValue(resposta(409, { lastRequestId: '00000000-0000-4000-8000-000000000003' }));
    expect(await solicitarConciliacaoFinancialV3(escopo, enviar, protocolo)).toEqual({ estado: 'CONFLITO_SEM_PROTOCOLO', consulta: escopo });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it.each([{ competencia: '2026-03' }, { merchantId: '00000000-0000-4000-8000-000000000099' }, { requestId: '../outro' }])(
    'recusa protocolo anterior incompatível antes de enviar o pedido', async mudanca => {
      const enviar = vi.fn<Transporte>();
      await expect(solicitarConciliacaoFinancialV3(escopo, enviar, { ...protocolo, ...mudanca })).rejects.toThrow();
      expect(enviar).not.toHaveBeenCalled();
    });

  it('recusa competência inválida antes do transporte', async () => {
    const enviar = vi.fn<Transporte>();
    await expect(solicitarConciliacaoFinancialV3({ ...escopo, competencia: '2026-13' }, enviar)).rejects.toThrow();
    expect(enviar).not.toHaveBeenCalled();
  });

  it('preserva o protocolo correto quando o chamador altera o objeto durante o POST', async () => {
    const conhecido = { ...protocolo };
    const enviar: Transporte = async () => {
      conhecido.competencia = '2026-03';
      return resposta(409);
    };
    expect(await solicitarConciliacaoFinancialV3(escopo, enviar, conhecido)).toEqual({ estado: 'REUTILIZADO', protocolo });
  });

  it('encerra HTTP 400 e falha de rede sem reenviar o POST', async () => {
    const enviar = vi.fn<Transporte>().mockResolvedValueOnce(resposta(400, { message: 'detalhe-privado' })).mockRejectedValueOnce(new Error('detalhe-privado'));
    await expect(solicitarConciliacaoFinancialV3(escopo, enviar)).rejects.toMatchObject({ codigo: 'HTTP', status: 400 });
    await expect(solicitarConciliacaoFinancialV3(escopo, enviar)).rejects.toMatchObject({ codigo: 'TRANSPORTE', message: 'A consulta Financial v3 não foi concluída.' });
    expect(enviar).toHaveBeenCalledTimes(2);
  });
});

describe('acompanhamento da conciliação', () => {
  it('acompanha 202 e estados intermediários em 200 até o arquivo ficar pronto', async () => {
    const enviar = vi.fn<Transporte>().mockResolvedValueOnce(resposta(202))
      .mockResolvedValueOnce(resposta(200, { ...eco, status: 'created' }))
      .mockResolvedValueOnce(resposta(200, { ...eco, status: 'enqueue' })).mockResolvedValueOnce(pronto);
    const pausa = esperar();
    const fim = await acompanharConciliacaoFinancialV3(protocolo, enviar, pausa);
    expect(fim).toMatchObject({ estado: 'DISPONIVEL', protocolo, consultas: 4 });
    expect(JSON.stringify(fim)).not.toContain('example.invalid');
    expect(pausa.mock.calls.flat()).toEqual([30_000, 45_000, 60_000]);
    for (const [p] of enviar.mock.calls) expect(p).toEqual({
      metodo: 'GET', url: rota + '/' + protocolo.requestId, cabecalhos: { accept: 'application/json' }, tempoMaximoMs: 15_000,
    });
  });

  it('devolve o protocolo ainda pendente no limite e retoma só por GET', async () => {
    const enviar = vi.fn<Transporte>().mockResolvedValue(resposta(202));
    const pausa = esperar();
    const parcial = await acompanharConciliacaoFinancialV3(protocolo, enviar, pausa);
    expect(parcial).toMatchObject({ estado: 'PROCESSANDO', protocolo });
    const pausas = pausa.mock.calls.map(([ms]) => ms);
    expect(pausas.slice(0, 2)).toEqual([30_000, 45_000]);
    expect(pausas.slice(2)).toEqual(Array(28).fill(60_000));
    const tempo = pausas.reduce((soma, ms) => soma + ms, 0);
    expect(tempo).toBeLessThan(30 * 60_000);
    expect(tempo + 60_000).toBeGreaterThanOrEqual(30 * 60_000);
    expect(parcial.consultas).toBe(pausas.length + 1);
    enviar.mockResolvedValueOnce(pronto);
    expect(await acompanharConciliacaoFinancialV3(parcial.protocolo, enviar, pausa)).toMatchObject({ estado: 'DISPONIVEL', consultas: 1 });
    expect(enviar.mock.calls.map(([p]) => p.metodo)).toEqual(Array(parcial.consultas + 1).fill('GET'));
    expect(pausa).toHaveBeenCalledTimes(pausas.length);
  });

  it('conta o tempo do transporte e não consulta de novo após atraso do agendador', async () => {
    let tempo = 0;
    const agora = () => tempo;
    const enviar = vi.fn<Transporte>(async () => { tempo += 10_000; return resposta(202); });
    const pausa = vi.fn(async (ms: number) => { tempo += ms + 30 * 60_000; });
    expect(await acompanharConciliacaoFinancialV3(protocolo, enviar, pausa, agora)).toMatchObject({ estado: 'PROCESSANDO', consultas: 1 });
    expect(pausa).toHaveBeenCalledExactlyOnceWith(30_000);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('identifica o 404 sem gerar novo relatório ou aguardar outra tentativa', async () => {
    const enviar = vi.fn<Transporte>().mockResolvedValue(resposta(404, { message: 'erro do provedor' }));
    const pausa = esperar();
    expect(await acompanharConciliacaoFinancialV3(protocolo, enviar, pausa)).toEqual({ estado: 'PROTOCOLO_INDISPONIVEL', protocolo, consultas: 1 });
    expect(pausa).not.toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('distingue a ausência declarada de lançamentos do erro do provedor', async () => {
    const corpo = { ...eco, status: 'error' };
    const enviar = vi.fn<Transporte>().mockResolvedValueOnce(resposta(200, { ...corpo, message: 'No financial entries found for the specified merchant and competence.' }))
      .mockResolvedValueOnce(resposta(200, { ...corpo, message: 'outra falha' }));
    const pausa = esperar();
    expect(await acompanharConciliacaoFinancialV3(protocolo, enviar, pausa)).toMatchObject({ estado: 'SEM_LANCAMENTOS', consultas: 1 });
    await expect(acompanharConciliacaoFinancialV3(protocolo, enviar, pausa)).rejects.toMatchObject({ codigo: 'FALHA_GERACAO' });
    expect(pausa).not.toHaveBeenCalled();
  });

  it('interrompe ao receber escopo divergente, falha de transporte ou HTTP inesperado', async () => {
    const enviar = vi.fn<Transporte>().mockResolvedValueOnce(resposta(200, { ...eco, competence: '2026-03', status: 'created' }))
      .mockRejectedValueOnce(new Error('privado')).mockResolvedValueOnce(resposta(503));
    const pausa = esperar();
    await expect(acompanharConciliacaoFinancialV3(protocolo, enviar, pausa)).rejects.toThrow();
    await expect(acompanharConciliacaoFinancialV3(protocolo, enviar, pausa)).rejects.toMatchObject({ codigo: 'TRANSPORTE' });
    await expect(acompanharConciliacaoFinancialV3(protocolo, enviar, pausa)).rejects.toMatchObject({ codigo: 'HTTP', status: 503 });
    expect(pausa).not.toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledTimes(3);
  });
});
