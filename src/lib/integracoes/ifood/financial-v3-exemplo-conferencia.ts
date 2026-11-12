import { gerarArquivoMensalSimulado, identidadeSimulada as identidade } from './financial-v3-arquivo-simulado';
import { compararConciliacaoEventosV3 } from './financial-v3-comparacao';
import { consultarAntecipacoesFinancialV3, consultarEventosFinancialV3, consultarLiquidacoesFinancialV3 } from './financial-v3-consultas';
import { conferirCustoAntecipacaoMensalV3 } from './financial-v3-custo-antecipacao';
import { prepararDownloadConciliacaoV3 } from './financial-v3-download';
import { conciliarLiquidacaoMensalV3 } from './financial-v3-liquidacao-mensal';
import { compararTaxasMensaisV3 } from './financial-v3-taxas-mensais';
import type { Transporte } from './transporte';

export const CENARIOS_EXEMPLO_FINANCIAL = ['conforme', 'divergente', 'incompleto'] as const;
export type CenarioExemploFinancial = (typeof CENARIOS_EXEMPLO_FINANCIAL)[number];

const origem = 'SIMULACAO';
const mes = { merchantId: identidade.merchant, inicio: '2026-02-01', fim: '2026-02-28' };
const apuracao = { ...mes, filtro: 'APURACAO' as const };
const semana = { beginDate: '2026-02-02', endDate: '2026-02-08' };
const envelope = { merchantId: identidade.merchant, beginDate: mes.inicio, endDate: mes.fim };
const grupo = { startDateCalculation: semana.beginDate, endDateCalculation: semana.endDate };
const mesAtestado = { identidade, coberturaCompleta: true, apuracaoEncerrada: true };
const vigencia = {
  identidade, inicio: mes.inicio, fim: mes.fim, periodoDaVendaAplicavel: true,
  linha: { parceiroId: identidade.parceiro, canal: 'IFOOD', taxaConfigurada: true, taxaBp: 800, taxaPagamentoBp: 200 },
  basesAtestadas: ['ORDER_COMMISSION', 'PAYMENT_TRANSACTION_FEE'],
} as const;

function respostaFicticia(corpo: unknown): Transporte {
  return async () => ({ status: 200, cabecalhos: {}, corpo: JSON.stringify(corpo) });
}

async function lerFontesDoExemplo(cenario: CenarioExemploFinancial) {
  if (cenario === 'incompleto') return { eventos: null, liquidacoes: null, antecipacoes: null };

  const evento = {
    trigger: 'SALE_CONCLUDED', product: identidade.produto, competence: identidade.competencia,
    period: semana, hasTransferImpact: true, receiver: { merchantId: identidade.merchant },
  };
  const cobrancaDivergente = cenario === 'divergente';
  const [eventos, liquidacoes, antecipacoes] = await Promise.all([
    consultarEventosFinancialV3(mes, respostaFicticia({
      page: 1, size: 100, hasNextPage: false, financialEvents: [
        { ...evento, name: 'ORDER_PAYMENT', amount: { value: '30.00' } },
        { ...evento, name: 'ORDER_COMMISSION', amount: { value: cobrancaDivergente ? '-2.70' : '-2.40' },
          billing: { baseValue: '30.00', feePercentage: cobrancaDivergente ? '9' : '8' } },
        { ...evento, name: 'PAYMENT_TRANSACTION_FEE', amount: { value: '-0.60' },
          billing: { baseValue: '30.00', feePercentage: '2' } },
        { ...evento, name: 'AJUSTE_SIMULADO', hasTransferImpact: false, amount: { value: '4.00' } },
      ],
    })),
    consultarLiquidacoesFinancialV3(apuracao, respostaFicticia({
      ...envelope, balance: 27, consolidatedMerchants: [identidade.merchant],
      settlements: [{ ...grupo, closingItems: [
        { type: 'REPASSE', product: identidade.produto, amount: 27, status: 'SUCCEED', paymentDate: '2026-03-04' },
      ] }],
    })),
    consultarAntecipacoesFinancialV3(apuracao, respostaFicticia({
      ...envelope, balance: 26.73, settlements: [{ ...grupo, closingItems: [{
        type: 'REPASSE_ANTECIPADO_SEMANAL', status: 'SUCCEED', originalPaymentDate: '2026-03-04',
        anticipatedPaymentDate: '2026-02-18', originalPaymentAmount: 27, anticipatedPaymentAmount: 26.73,
        feeAmount: 0.27, feePercentage: 1,
      }] }],
    })),
  ]);
  return { eventos, liquidacoes, antecipacoes };
}

/** Cenários fechados de uma única loja fictícia. Nenhum identificador ou dado operacional é aceito. */
export async function montarExemploConferenciaFinancial(cenario: CenarioExemploFinancial = 'conforme') {
  if (!CENARIOS_EXEMPLO_FINANCIAL.includes(cenario)) throw new Error('Cenário de exemplo Financial desconhecido.');
  const [{ solicitacao, acompanhamento, arquivoInjetado }, { eventos, liquidacoes, antecipacoes }] = await Promise.all([
    gerarArquivoMensalSimulado(), lerFontesDoExemplo(cenario),
  ]);
  const protocolo = solicitacao.protocolo;
  const evidenciaEventos = eventos && { ...mesAtestado, consulta: mes, produto: identidade.produto, moeda: identidade.moeda };
  const [arquivoEventos, anexo] = await Promise.all([
    compararConciliacaoEventosV3({
      origem, acompanhamento, arquivo: arquivoInjetado, eventos, evidenciaEventos,
      evidenciaArquivo: { protocolo, produto: identidade.produto, moeda: identidade.moeda, coberturaCompleta: true, apuracaoEncerrada: true },
    }),
    prepararDownloadConciliacaoV3({ origem, pedido: { identidade, protocolo }, acompanhamento, arquivo: { ...arquivoInjetado, identidade } }),
  ]);
  const liquidacao = conciliarLiquidacaoMensalV3({
    origem, identidade, eventos, liquidacoes, evidenciaEventos,
    evidenciaLiquidacao: liquidacoes && { ...mesAtestado, consulta: apuracao, saldoIntegralDaIdentidade: true },
  });
  const taxas = compararTaxasMensaisV3({ origem, identidade, eventos, evidenciaEventos, vigencias: [vigencia] });
  const titulo = antecipacoes?.antecipacoes.grupos[0]?.itens?.[0];
  const antecipacao = conferirCustoAntecipacaoMensalV3({
    origem, identidade, fonte: antecipacoes,
    evidencia: antecipacoes && { ...mesAtestado, consulta: apuracao, titulosDaIdentidade: true, descontoExclusivoDaAntecipacao: true },
    // A base atestada para este título é independente dos valores informados no envelope.
    basesPorTitulo: titulo && new Map([[titulo, 2_700n]]),
  });
  return {
    origem, cenario, nomeLoja: 'Loja fictícia', competencia: identidade.competencia, arquivoEventos, liquidacao, taxas, antecipacao,
    download: { nomeArquivo: anexo.nomeArquivo, href: 'data:' + anexo.tipoConteudo + ';base64,' + Buffer.from(anexo.bytes).toString('base64'),
      linhas: anexo.resumo.linhas, pedidosDistintos: anexo.resumo.pedidosDistintos },
  } as const;
}

export type ExemploConferenciaFinancial = Awaited<ReturnType<typeof montarExemploConferenciaFinancial>>;
