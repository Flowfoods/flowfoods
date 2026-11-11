/** Ensaio local das consultas Financial com respostas fictícias independentes. */
import {
  consultarAntecipacoesFinancialV3, consultarEventosFinancialV3, consultarLiquidacoesFinancialV3, consultarVendasFinancialV3,
} from '../src/lib/integracoes/ifood/financial-v3-consultas';
import type { Transporte } from '../src/lib/integracoes/ifood/transporte';

const intervalo = { merchantId: '00000000-0000-4000-8000-000000000001', inicio: '2026-02-02', fim: '2026-02-08' };
const periodo = { beginDate: intervalo.inicio, endDate: intervalo.fim };
const respostasFicticias: Transporte = async pedido => {
  const url = new URL(pedido.url);
  let corpo;
  if (url.pathname.endsWith('/financial-events')) {
    const page = Number(url.searchParams.get('page'));
    if (page !== 1 && page !== 2) throw new Error('Página fora do cenário.');
    corpo = {
      page, size: 100, hasNextPage: page === 1, financialEvents: [{
        name: page === 1 ? 'ORDER_PAYMENT' : 'ORDER_COMMISSION', trigger: 'SALE_CONCLUDED',
        product: 'IFOOD', competence: '2026-02', period: periodo, hasTransferImpact: true,
        amount: { value: page === 1 ? '30.00' : '-3.00' },
      }],
    };
  } else if (url.pathname.endsWith('/settlements')) {
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

async function executar() {
  if (process.argv.length > 2) throw new Error('Use npm run integracao:financial-simular sem argumentos.');
  const eventos = await consultarEventosFinancialV3(intervalo, respostasFicticias);
  const liquidacoes = await consultarLiquidacoesFinancialV3({ ...intervalo, filtro: 'APURACAO' }, respostasFicticias);
  const antecipacoes = await consultarAntecipacoesFinancialV3({ ...intervalo, filtro: 'PAGAMENTO_ANTECIPADO' }, respostasFicticias);
  const vendas = await consultarVendasFinancialV3(intervalo, respostasFicticias);
  console.log(JSON.stringify({ origem: 'SIMULACAO', moedaDoCenario: 'BRL', eventos, liquidacoes, antecipacoes, vendas },
    (_chave, valor) => typeof valor === 'bigint' ? valor.toString() : valor, 2));
}

executar().catch((erro: Error) => { console.error(erro.message); process.exitCode = 1; });
