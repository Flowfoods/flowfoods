/** Ensaio local das consultas Financial com respostas fictícias independentes. */
import { gzipSync } from 'node:zlib';
import { simularTaxasMensais } from './integracao-financial-taxas-simuladas';
import { simularCustoAntecipacao } from './integracao-financial-custo-antecipacao-simulado';
import { exportarConciliacaoSimulada } from './integracao-financial-exportar';
import { lerArquivoConciliacaoV3 } from '../src/lib/integracoes/ifood/financial-v3-arquivo';
import { compararConciliacaoEventosV3 } from '../src/lib/integracoes/ifood/financial-v3-comparacao';
import { conciliarLiquidacaoMensalV3 } from '../src/lib/integracoes/ifood/financial-v3-liquidacao-mensal';
import {
  consultarAntecipacoesFinancialV3, consultarEventosFinancialV3, consultarLiquidacoesFinancialV3, consultarVendasFinancialV3,
  solicitarConciliacaoFinancialV3, acompanharConciliacaoFinancialV3,
} from '../src/lib/integracoes/ifood/financial-v3-consultas';
import type { Transporte } from '../src/lib/integracoes/ifood/transporte';

const intervalo = { merchantId: '00000000-0000-4000-8000-000000000001', inicio: '2026-02-02', fim: '2026-02-08' };
const periodo = { beginDate: intervalo.inicio, endDate: intervalo.fim };
const mes = { merchantId: intervalo.merchantId, inicio: '2026-02-01', fim: '2026-02-28' };

function transporteEventos(credito: string): Transporte {
  return async pedido => {
    const url = new URL(pedido.url);
    const page = Number(url.searchParams.get('page'));
    if (!url.pathname.endsWith('/financial-events') || (page !== 1 && page !== 2)) throw new Error('Página fora do cenário.');
    const corpo = {
      page, size: 100, hasNextPage: page === 1, financialEvents: [{
        name: page === 1 ? 'ORDER_PAYMENT' : 'ORDER_COMMISSION', trigger: 'SALE_CONCLUDED',
        product: 'IFOOD', competence: '2026-02', period: periodo, hasTransferImpact: true,
        receiver: { merchantId: intervalo.merchantId }, amount: { value: page === 1 ? credito : '-3.00' },
      }],
    };
    return { status: 200, cabecalhos: {}, corpo: JSON.stringify(corpo) };
  };
}

const respostasFicticias: Transporte = async pedido => {
  const url = new URL(pedido.url);
  let corpo;
  if (url.pathname.endsWith('/settlements')) {
    corpo = [{ ...periodo, balance: 27, merchantId: intervalo.merchantId, settlements: [{
      startDateCalculation: intervalo.inicio, endDateCalculation: intervalo.fim,
      closingItems: [{ type: 'REPASSE', product: 'IFOOD', amount: 27, status: 'SUCCEED', paymentDate: '2026-02-18' }],
    }] }];
  } else if (url.pathname.endsWith('/anticipations')) {
    corpo = { ...periodo, balance: 79.90, merchantId: intervalo.merchantId, settlements: [{
      startDateCalculation: '2026-01-26', endDateCalculation: '2026-02-01',
      closingItems: [{
        type: 'REPASSE_ANTECIPADO_SEMANAL', status: 'SUCCEED',
        originalPaymentDate: '2026-02-25', anticipatedPaymentDate: '2026-02-06',
        originalPaymentAmount: 80, anticipatedPaymentAmount: 79.90, feeAmount: 0.10, feePercentage: 0.125,
      }],
    }] };
  } else if (url.pathname.endsWith('/sales')) {
    const page = Number(url.searchParams.get('page'));
    if (page !== 1 && page !== 2) throw new Error('Página fora do cenário.');
    const venda = page === 1 ? {
      id: 'venda-simulada-1', shortId: '0012', currentStatus: 'CONCLUDED', createdAt: '2026-02-03T14:00:00-03:00',
      saleGrossValue: { bag: '40.00', deliveryFee: 3.70, serviceFee: '0.00' },
      billingSummary: { saleBalance: '38.50', billingEntries: [{ name: 'COMISSAO_SIMULADA', value: '-1.50' }] },
      payments: { methods: [{ method: 'CREDIT', liability: 'IFOOD', currency: 'BRL', value: 43.70 }] },
    } : { id: 'venda-simulada-2', shortId: 13, currentStatus: 'CANCELLED', createdAt: '2026-02-06T14:00:00Z' };
    corpo = {
      beginSalesDate: intervalo.inicio, endSalesDate: intervalo.fim, page, size: 1, total: 2, pageCount: 2,
      sales: [{ ...venda, merchant: { id: intervalo.merchantId } }],
    };
  } else throw new Error('Operação fora do cenário.');
  return { status: 200, cabecalhos: {}, corpo: JSON.stringify(corpo) };
};

async function gerarArquivoMensalSimulado() {
  const consulta = { merchantId: intervalo.merchantId, competencia: '2026-02' };
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

async function simularProtocoloMensal(eventosDaSemana: Awaited<ReturnType<typeof consultarEventosFinancialV3>>) {
  const { solicitacao, acompanhamento, arquivoInjetado, esperasSimuladasMs } = await gerarArquivoMensalSimulado();
  const arquivo = await lerArquivoConciliacaoV3(acompanhamento, arquivoInjetado);
  const evidenciaArquivo = {
    protocolo: solicitacao.protocolo, produto: 'IFOOD', moeda: 'BRL', coberturaCompleta: true, apuracaoEncerrada: true,
  } as const;
  function comparar(eventos: typeof eventosDaSemana, coberturaCompleta: boolean) {
    return compararConciliacaoEventosV3({
      origem: 'SIMULACAO', arquivo: arquivoInjetado, acompanhamento, eventos, evidenciaArquivo,
      evidenciaEventos: { consulta: eventos.consulta, produto: 'IFOOD', moeda: 'BRL', coberturaCompleta, apuracaoEncerrada: true },
    });
  }
  const eventosDoMes = await consultarEventosFinancialV3(mes, transporteEventos('30.00'));
  const eventosComDiferenca = await consultarEventosFinancialV3(mes, transporteEventos('30.01'));
  const comparacoes = {
    mesCompleto: await comparar(eventosDoMes, true),
    diferencaDeUmCentavo: await comparar(eventosComDiferenca, true),
    somenteUmaSemana: await comparar(eventosDaSemana, false),
  };
  return { solicitacao: solicitacao.estado, acompanhamento, esperasSimuladasMs, arquivo, comparacoes };
}

async function simularLiquidacaoMensal() {
  const identidade = {
    parceiro: 'parceiro-simulado', loja: 'loja-simulada', merchant: mes.merchantId,
    produto: 'IFOOD', moeda: 'BRL' as const, competencia: '2026-02',
  };
  const consulta = { ...mes, filtro: 'APURACAO' as const };
  const evidenciaEventos = { identidade, consulta: mes, coberturaCompleta: true, apuracaoEncerrada: true };
  const evidenciaLiquidacao = { identidade, consulta, coberturaCompleta: true, apuracaoEncerrada: true, saldoIntegralDaIdentidade: true };
  function consultarSaldo(consolidatedMerchants: string[]) {
    const transporte: Transporte = async pedido => {
      const url = new URL(pedido.url);
      if (!url.pathname.endsWith('/' + mes.merchantId + '/settlements')
          || url.searchParams.get('beginCalculationDate') !== mes.inicio || url.searchParams.get('endCalculationDate') !== mes.fim) {
        throw new Error('Liquidação fora do cenário mensal.');
      }
      const corpo = {
        merchantId: mes.merchantId, beginDate: mes.inicio, endDate: mes.fim, balance: 10_000, consolidatedMerchants,
        settlements: [{
          startDateCalculation: intervalo.inicio, endDateCalculation: intervalo.fim,
          closingItems: [{ type: 'REPASSE', product: 'IFOOD', amount: 10_000, status: 'SUCCEED', paymentDate: '2026-03-04' }],
        }],
      };
      return { status: 200, cabecalhos: {}, corpo: JSON.stringify(corpo) };
    };
    return consultarLiquidacoesFinancialV3(consulta, transporte);
  }
  const liquidacoes = await consultarSaldo([mes.merchantId]);
  // O transporte de Events também devolve o débito de R$ 3,00 na segunda página.
  const eventos = await consultarEventosFinancialV3(mes, transporteEventos('10004.00'));
  const entrada = { origem: 'SIMULACAO' as const, identidade, eventos, liquidacoes, evidenciaEventos, evidenciaLiquidacao };
  const eventosAcima = await consultarEventosFinancialV3(mes, transporteEventos('10004.01'));
  const comOutraLoja = await consultarSaldo([mes.merchantId, '00000000-0000-4000-8000-000000000003']);
  return {
    noLimite: conciliarLiquidacaoMensalV3(entrada),
    acimaDoLimite: conciliarLiquidacaoMensalV3({ ...entrada, eventos: eventosAcima }),
    consolidacaoDeDuasLojas: conciliarLiquidacaoMensalV3({ ...entrada, liquidacoes: comOutraLoja }),
  };
}

async function executar() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--exportar-conciliacao' && args[1].trim()) {
    const { solicitacao, acompanhamento, arquivoInjetado } = await gerarArquivoMensalSimulado();
    const identidade = { parceiro: 'parceiro-simulado', loja: 'loja-simulada', merchant: mes.merchantId,
      competencia: '2026-02', produto: 'IFOOD', moeda: 'BRL' as const };
    const exportacao = await exportarConciliacaoSimulada(args[1], { origem: 'SIMULACAO',
      pedido: { identidade, protocolo: solicitacao.protocolo }, acompanhamento, arquivo: { ...arquivoInjetado, identidade },
    });
    console.log(JSON.stringify(exportacao, serializarCentavos, 2));
    return;
  }
  if (args.length) throw new Error('Use npm run integracao:financial-simular ou acrescente -- --exportar-conciliacao <diretório existente>.');
  const eventos = await consultarEventosFinancialV3(intervalo, transporteEventos('30.00'));
  const liquidacoes = await consultarLiquidacoesFinancialV3({ ...intervalo, filtro: 'APURACAO' }, respostasFicticias);
  const antecipacoes = await consultarAntecipacoesFinancialV3({ ...intervalo, filtro: 'PAGAMENTO_ANTECIPADO' }, respostasFicticias);
  const vendas = await consultarVendasFinancialV3(intervalo, respostasFicticias);
  const conciliacao = await simularProtocoloMensal(eventos);
  const conciliacaoDeLiquidacao = await simularLiquidacaoMensal();
  const comparacaoDeTaxas = await simularTaxasMensais();
  const custoDeAntecipacao = await simularCustoAntecipacao();
  console.log(JSON.stringify({ origem: 'SIMULACAO', moedaDoCenario: 'BRL', eventos, liquidacoes, antecipacoes, vendas, conciliacao,
    conciliacaoDeLiquidacao, comparacaoDeTaxas, custoDeAntecipacao },
    serializarCentavos, 2));
}

function serializarCentavos(_chave: string, valor: unknown) {
  return typeof valor === 'bigint' ? valor.toString() : valor;
}

executar().catch((erro: Error) => { console.error(erro.message); process.exitCode = 1; });
