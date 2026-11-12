import { consultarAntecipacoesFinancialV3 } from '../src/lib/integracoes/ifood/financial-v3-consultas';
import { conferirCustoAntecipacaoMensalV3 } from '../src/lib/integracoes/ifood/financial-v3-custo-antecipacao';
import { dinheiroAnalytics, percentualAnalytics } from '../src/components/erp/telas/integracoes/formato-analytics';

export async function simularCustoAntecipacao() {
  const identidade = {
    parceiro: 'parceiro-simulado', loja: 'loja-simulada', merchant: '00000000-0000-4000-8000-000000000001',
    competencia: '2026-02', produto: 'IFOOD', moeda: 'BRL' as const,
  };
  const consulta = { merchantId: identidade.merchant, inicio: '2026-02-01', fim: '2026-02-28', filtro: 'APURACAO' as const };
  const evidencia = { identidade, consulta, coberturaCompleta: true, apuracaoEncerrada: true,
    titulosDaIdentidade: true, descontoExclusivoDaAntecipacao: true };

  async function consultar(liquidoPrimeiro: number, percentualSegundo: number) {
    return consultarAntecipacoesFinancialV3(consulta, async pedido => {
      const url = new URL(pedido.url);
      if (pedido.metodo !== 'GET' || !url.pathname.endsWith('/' + consulta.merchantId + '/anticipations')
          || url.searchParams.get('beginCalculationDate') !== consulta.inicio || url.searchParams.get('endCalculationDate') !== consulta.fim) {
        throw new Error('Consulta fora do cenário de antecipações por apuração.');
      }
      const semanal = { type: 'REPASSE_ANTECIPADO_SEMANAL', status: 'SUCCEED' };
      const corpo = {
        merchantId: consulta.merchantId, beginDate: consulta.inicio, endDate: consulta.fim, balance: 992,
        settlements: [{ startDateCalculation: '2026-02-02', endDateCalculation: '2026-02-08', closingItems: [
          { ...semanal, originalPaymentDate: '2026-03-04', anticipatedPaymentDate: '2026-02-18',
            originalPaymentAmount: 800, anticipatedPaymentAmount: liquidoPrimeiro, feeAmount: 4, feePercentage: 0.5 },
          { ...semanal, originalPaymentDate: '2026-03-11', anticipatedPaymentDate: '2026-02-25',
            originalPaymentAmount: 200, anticipatedPaymentAmount: 196, feeAmount: 4, feePercentage: percentualSegundo },
          { ...semanal, status: 'FAILED', originalPaymentDate: '2026-03-11', anticipatedPaymentDate: '2026-02-25',
            originalPaymentAmount: 100, anticipatedPaymentAmount: 98, feeAmount: 2, feePercentage: 2 },
        ] }],
      };
      return { status: 200, cabecalhos: {}, corpo: JSON.stringify(corpo) };
    });
  }

  function conferir(fonte: Awaited<ReturnType<typeof consultar>>, baseDoSegundo = true) {
    const titulos = fonte.antecipacoes.grupos[0].itens;
    if (!titulos || titulos.length !== 3) throw new Error('Títulos do cenário de antecipações ausentes.');
    // Os valores abaixo são evidências da fixture, independentes do saldo e dos campos monetários retornados.
    const basesPorTitulo = new Map([[titulos[0], 80_000n]]);
    if (baseDoSegundo) basesPorTitulo.set(titulos[1], 20_000n);
    const resultado = conferirCustoAntecipacaoMensalV3({ origem: 'SIMULACAO', identidade, fonte, evidencia, basesPorTitulo });
    const taxa = resultado.monetario.taxaInformadaCentavos;
    const efetivo = resultado.percentual.efetivoPonderado;
    return { ...resultado, exibicao: {
      taxaDosTitulos: taxa === null ? null : dinheiroAnalytics(taxa.toString()),
      percentualEfetivoPonderado: efetivo === null ? null : percentualAnalytics({
        numerador: efetivo.taxaCentavos.toString(), denominador: efetivo.baseCentavos.toString(),
      }),
    } };
  }
  const conforme = await consultar(796, 2);
  return {
    duasAntecipacoes: conferir(conforme),
    baseDoSegundoTituloAusente: conferir(conforme, false),
    liquidoComUmCentavoAMais: conferir(await consultar(796.01, 2)),
    percentualDeclaradoDivergente: conferir(await consultar(796, 2.5)),
  };
}
