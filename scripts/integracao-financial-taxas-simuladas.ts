import { consultarEventosFinancialV3 } from '../src/lib/integracoes/ifood/financial-v3-consultas';
import { compararTaxasMensaisV3 } from '../src/lib/integracoes/ifood/financial-v3-taxas-mensais';

export async function simularTaxasMensais() {
  const identidade = {
    parceiro: 'parceiro-simulado', loja: 'loja-simulada', merchant: '00000000-0000-4000-8000-000000000001',
    produto: 'IFOOD', moeda: 'BRL' as const, competencia: '2026-02',
  };
  const mes = { merchantId: identidade.merchant, inicio: '2026-02-01', fim: '2026-02-28' };
  const vigencia = {
    identidade, inicio: mes.inicio, fim: mes.fim, periodoDaVendaAplicavel: true,
    linha: { parceiroId: identidade.parceiro, canal: 'IFOOD', taxaConfigurada: true, taxaBp: 1200, taxaPagamentoBp: 320 },
    basesAtestadas: ['ORDER_COMMISSION', 'PAYMENT_TRANSACTION_FEE'],
  } as const;
  async function consultar(taxaComissao: string, valorComissao: string, baseComissao: string | null) {
    return consultarEventosFinancialV3(mes, async pedido => {
      const url = new URL(pedido.url);
      if (pedido.metodo !== 'GET' || !url.pathname.endsWith('/' + mes.merchantId + '/financial-events')
          || url.searchParams.get('beginDate') !== mes.inicio || url.searchParams.get('endDate') !== mes.fim
          || url.searchParams.get('page') !== '1') throw new Error('Consulta de taxas fora do cenário.');
      const venda = {
        product: identidade.produto, competence: identidade.competencia, period: { beginDate: '2026-02-02', endDate: '2026-02-08' },
        trigger: 'SALE_CONCLUDED', hasTransferImpact: true, receiver: { merchantId: identidade.merchant },
      };
      const corpo = { page: 1, size: 100, hasNextPage: false, financialEvents: [
        { ...venda, name: 'ORDER_COMMISSION', amount: { value: valorComissao }, billing: { baseValue: baseComissao, feePercentage: taxaComissao } },
        { ...venda, name: 'PAYMENT_TRANSACTION_FEE', amount: { value: '-1.60' }, billing: { baseValue: '50.00', feePercentage: '3.20' } },
      ] };
      return { status: 200, cabecalhos: {}, corpo: JSON.stringify(corpo) };
    });
  }
  function comparar(eventos: Awaited<ReturnType<typeof consultar>>, comHistorico = true) {
    return compararTaxasMensaisV3({
      origem: 'SIMULACAO', identidade, eventos, vigencias: comHistorico ? [vigencia] : [],
      evidenciaEventos: { identidade, consulta: eventos.consulta, coberturaCompleta: true, apuracaoEncerrada: true },
    });
  }
  const conforme = await consultar('12', '-12.00', '100.00');
  return {
    conforme: comparar(conforme),
    comissaoAcima: comparar(await consultar('13', '-13.00', '100.00')),
    baseAusente: comparar(await consultar('12', '-12.00', null)),
    semVigenciaComprovada: comparar(conforme, false),
  };
}
