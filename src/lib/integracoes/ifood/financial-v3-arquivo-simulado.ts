import { gzipSync } from 'node:zlib';
import { acompanharConciliacaoFinancialV3, solicitarConciliacaoFinancialV3 } from './financial-v3-consultas';
import type { Transporte } from './transporte';

export const identidadeSimulada = Object.freeze({
  parceiro: 'parceiro-simulado', loja: 'loja-simulada', merchant: '00000000-0000-4000-8000-000000000001',
  produto: 'IFOOD', moeda: 'BRL', competencia: '2026-02',
} as const);

/** Protocolo e arquivo reproduzíveis da loja fictícia, usados tanto pelo CLI quanto pela tela. */
export async function gerarArquivoMensalSimulado() {
  const consulta = { merchantId: identidadeSimulada.merchant, competencia: identidadeSimulada.competencia };
  const requestId = '00000000-0000-4000-8000-000000000002';
  const rota = '/financial/v3.0/merchants/' + consulta.merchantId + '/reconciliation/on-demand';
  let leituras = 0;
  const transporte: Transporte = async pedido => {
    const caminho = new URL(pedido.url).pathname;
    const eco = { merchantId: consulta.merchantId, competence: consulta.competencia };
    if (pedido.metodo === 'POST' && caminho === rota) {
      return { status: 200, cabecalhos: {}, corpo: JSON.stringify({ ...eco, requestId }) };
    }
    if (pedido.metodo !== 'GET' || caminho !== rota + '/' + requestId) throw new Error('Protocolo fora do cenário.');
    if (++leituras === 1) return { status: 202, cabecalhos: {}, corpo: '' };
    const corpo = leituras === 2 ? { ...eco, id: requestId, status: 'enqueue' }
      : { ...eco, id: requestId, status: 'processed', downloadPath: 'https://example.invalid/conciliacao.csv.gz' };
    return { status: 200, cabecalhos: {}, corpo: JSON.stringify(corpo) };
  };
  const solicitacao = await solicitarConciliacaoFinancialV3(consulta, transporte);
  if (solicitacao.estado === 'CONFLITO_SEM_PROTOCOLO') throw new Error('Protocolo ausente no cenário.');
  const esperasSimuladasMs: number[] = [];
  const acompanhamento = await acompanharConciliacaoFinancialV3(solicitacao.protocolo, transporte, async ms => { esperasSimuladasMs.push(ms); });
  const csv = [
    'valor;competencia;pedido_associado_ifood;loja_id;impacto_no_repasse',
    ['30.00', consulta.competencia, 'pedido-simulado', consulta.merchantId, 'SIM'].join(';'),
    ['-3.00', consulta.competencia, 'pedido-simulado', consulta.merchantId, 'SIM'].join(';'),
    ['4.00', consulta.competencia, '', consulta.merchantId, 'NAO'].join(';'),
  ].join('\r\n');
  const arquivoInjetado = {
    protocolo: solicitacao.protocolo, bytes: gzipSync(csv), totaisInformados: { linhas: 3, pedidos: 1 },
  };
  return { solicitacao, acompanhamento, arquivoInjetado, esperasSimuladasMs };
}
