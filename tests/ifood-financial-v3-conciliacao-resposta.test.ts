import { describe, expect, it } from 'vitest';
import {
  conferirEscopoConciliacaoV3, lerConsultaConciliacaoV3, lerProtocoloConciliacaoV3,
  requestIdConciliacaoValido, ultimoRequestIdConciliacaoV3,
} from '@/lib/integracoes/ifood/financial-v3-conciliacao-resposta';

const merchantId = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const outroMerchant = 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb';
const competencia = '2026-07';
const requestId = 'protocolo-A.1';
const escopo = { merchantId, competencia };
const protocolo = { ...escopo, requestId };
const ecos = { merchantId, competence: competencia, id: requestId };
const arquivo = 'https://arquivo.invalid/extrato.csv?assinatura=valor-sintetico';
const semLancamentos = 'No financial entries found for the specified merchant and competence.';
const mensagemDoMerchant = (id: string) =>
  'File generation failed: No financial entries exist for merchant ' + id + ' in the requested time frame.';
const consultar = (campos: Record<string, unknown>, status: 200 | 202 = 200) =>
  lerConsultaConciliacaoV3(status, JSON.stringify(campos), protocolo);

describe('Escopo e identificadores da conciliação sob demanda', () => {
  it('aceita competência mensal e merchant canônico e recusa pedidos inválidos', () => {
    expect(conferirEscopoConciliacaoV3({ merchantId: merchantId.toUpperCase(), competencia })).toEqual(escopo);
    for (const mes of ['', '0000-01', '2026-0', '2026-00', '2026-13', '2026-07-01', '2026-07 ']) {
      expect(() => conferirEscopoConciliacaoV3({ merchantId, competencia: mes })).toThrow(expect.objectContaining({ codigo: 'PEDIDO' }));
    }
    expect(() => conferirEscopoConciliacaoV3({ ...escopo, merchantId: 'loja' })).toThrow();
  });

  it('preserva o identificador opaco em um único segmento de caminho', () => {
    for (const id of [requestId, merchantId, '_p', '~p', '-p', '.p', 'a'.repeat(128)]) {
      expect(requestIdConciliacaoValido(id)).toBe(true);
    }
    for (const id of [null, 0, '', '.', '..', '../p', 'a/b', 'a%2Fb', 'a?b', 'a#b', 'a\nb', 'a'.repeat(129)]) {
      expect(requestIdConciliacaoValido(id)).toBe(false);
    }
  });

  it('vincula requestId do POST ao pedido com ou sem ecos, projetando somente os campos do protocolo', () => {
    for (const resposta of [{ requestId }, { requestId, competence: competencia, merchantId: merchantId.toUpperCase(), dadoPrivado: 'sintético' }]) {
      expect(lerProtocoloConciliacaoV3(JSON.stringify(resposta), escopo)).toStrictEqual(protocolo);
    }
    for (const campos of [{}, { id: requestId }, { requestId: null }, { requestId: arquivo }, { requestId, id: 'outro' }]) {
      expect(() => lerProtocoloConciliacaoV3(JSON.stringify(campos), escopo)).toThrow();
    }
  });

  it('confere todo eco de escopo em criação, consulta e conflito', () => {
    for (const eco of [{ merchantId: outroMerchant }, { merchantId: null }, { competence: '2026-08' },
      { competence: competencia, competencia: null }]) {
      const corpo = JSON.stringify({ requestId, status: 'created', ...eco });
      expect(() => lerProtocoloConciliacaoV3(corpo, escopo)).toThrow(expect.objectContaining({ codigo: 'ESCOPO_DIVERGENTE' }));
      for (const status of [200, 202] as const) {
        expect(() => lerConsultaConciliacaoV3(status, corpo, protocolo)).toThrow(expect.objectContaining({ codigo: 'ESCOPO_DIVERGENTE' }));
      }
      expect(() => ultimoRequestIdConciliacaoV3(corpo, escopo)).toThrow(expect.objectContaining({ codigo: 'ESCOPO_DIVERGENTE' }));
    }
  });

  it('lê lastRequestId no 409 sem extraí-lo de texto livre ou exigir que esteja presente', () => {
    expect(ultimoRequestIdConciliacaoV3(JSON.stringify({ lastRequestId: requestId, ...ecos }), escopo)).toBe(requestId);
    for (const corpo of ['', JSON.stringify({ code: '409', message: requestId }), JSON.stringify({ requestId })]) {
      expect(ultimoRequestIdConciliacaoV3(corpo, escopo)).toBeNull();
    }
    for (const corpo of ['{', '[]', '{"lastRequestId":null}', '{"lastRequestId":"../id"}']) {
      expect(() => ultimoRequestIdConciliacaoV3(corpo, escopo)).toThrow();
    }
  });
});

describe('Estados do relatório de conciliação sob demanda', () => {
  it('reconhece a fila na referência e o HTTP 202 do guia', () => {
    for (const status of ['created', 'enqueue']) {
      expect(consultar({ ...ecos, status })).toStrictEqual({ estado: 'PROCESSANDO' });
    }
    expect(lerConsultaConciliacaoV3(202, '', protocolo)).toStrictEqual({ estado: 'PROCESSANDO' });
    expect(consultar({ ...ecos }, 202)).toStrictEqual({ estado: 'PROCESSANDO' });
    expect(consultar({ ...ecos, message: 'Processing' }, 202)).toStrictEqual({ estado: 'PROCESSANDO' });
    expect(() => consultar({ ...ecos, errorMessage: 'Generation failed' }, 202)).toThrow();
  });

  it('projeta apenas DISPONIVEL nos formatos do exemplo, do schema e do guia', () => {
    const privado = { dadosBancarios: 'sintético', generatedAt: 'não documentado' };
    for (const campos of [{ ...ecos, status: 'processed', downloadPath: arquivo }, { ...ecos, status: 'processed', filePath: arquivo },
      { downloadUrl: arquivo }]) {
      expect(consultar({ ...campos, ...privado })).toStrictEqual({ estado: 'DISPONIVEL' });
    }
  });

  it('reconhece a falta de lançamentos declarada pelo provedor para o merchant consultado', () => {
    for (const msg of [{ message: semLancamentos }, { errorMessage: mensagemDoMerchant(merchantId) }]) {
      expect(consultar({ ...ecos, status: 'error', ...msg })).toStrictEqual({ estado: 'SEM_LANCAMENTOS' });
    }
    for (const msg of [{}, { message: 'Outro erro' }, { errorMessage: mensagemDoMerchant(outroMerchant) },
      { errorMessage: mensagemDoMerchant('<string>') }, { message: semLancamentos, errorMessage: 'Outro erro' }]) {
      expect(() => consultar({ ...ecos, status: 'error', ...msg })).toThrow();
    }
  });

  it('recusa protocolos divergentes preservando a caixa do identificador', () => {
    for (const eco of [{ id: requestId.toUpperCase() }, { id: requestId, requestId: 'outro' }, { id: null }]) {
      expect(() => consultar({ status: 'created', ...eco })).toThrow(expect.objectContaining({ codigo: 'PROTOCOLO_DIVERGENTE' }));
    }
    expect(() => lerConsultaConciliacaoV3(202, '', { ...protocolo, requestId: '../outro' })).toThrow(expect.objectContaining({ codigo: 'PEDIDO' }));
  });

  it('recusa estados e arquivos incompatíveis com o HTTP recebido', () => {
    // @ts-expect-error A função pública também confere o status fornecido em tempo de execução.
    expect(() => lerConsultaConciliacaoV3(404, '{"status":"created"}', protocolo)).toThrow();
    for (const campos of [{}, { status: 'desconhecido' }, { status: 'processed' }, { status: 'error', downloadPath: arquivo, message: semLancamentos },
      { status: 'enqueue', downloadPath: arquivo }, { status: 'processed', filePath: arquivo, downloadPath: arquivo + '2' }]) {
      expect(() => consultar(campos)).toThrow();
    }
    for (const campos of [{ status: 'processed', downloadPath: arquivo }, { downloadUrl: arquivo }, { status: 'error', message: semLancamentos }]) {
      expect(() => consultar(campos, 202)).toThrow();
    }
    for (const url of [42, '', '/arquivo', 'http://arquivo.invalid/', 'https://user:senha@arquivo.invalid/', 'https://', 'https://arquivo.invalid/a b']) {
      expect(() => consultar({ status: 'processed', downloadPath: url })).toThrow();
    }
  });

  it('rejeita JSON inválido, duplicatas e envelopes ambíguos sem reproduzir o corpo no erro', () => {
    const privado = 'valor-sintetico';
    for (const corpo of ['null', '[]', '7', '{"status":"created","status":"processed","downloadPath":"' + arquivo + '"}',
      JSON.stringify({ status: 'error', message: privado }), '{"downloadUrl":"' + arquivo]) {
      expect(() => lerConsultaConciliacaoV3(200, corpo, protocolo)).toThrow();
      expect(() => lerConsultaConciliacaoV3(200, corpo, protocolo)).not.toThrow(new RegExp(privado));
    }
  });
});
