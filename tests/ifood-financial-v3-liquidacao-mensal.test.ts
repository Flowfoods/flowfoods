import { describe, expect, it } from 'vitest';
import { consultarEventosFinancialV3, consultarLiquidacoesFinancialV3, type ConsultaLiquidacoesV3 } from '@/lib/integracoes/ifood/financial-v3-consultas';
import { conciliarLiquidacaoMensalV3, type EntradaLiquidacaoMensalV3 } from '@/lib/integracoes/ifood/financial-v3-liquidacao-mensal';

const merchantId = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const outroMerchant = 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb';
const consultaMensal = { merchantId, inicio: '2024-02-01', fim: '2024-02-29' };
const consultaApuracao = { ...consultaMensal, filtro: 'APURACAO' as const };
const identidade = { parceiro: 'parceiro-fixture', loja: 'loja-fixture', merchant: merchantId, competencia: '2024-02', produto: 'DELIVERY', moeda: 'BRL' as const };
const evento = (valor = '100.00') => ({
  product: identidade.produto, competence: identidade.competencia, hasTransferImpact: true, amount: { value: valor },
});
const titulo = { type: 'TITULO_FICTICIO', product: identidade.produto, paymentDate: '2024-03-04', amount: 999 };
const grupo = { startDateCalculation: '2024-02-24', endDateCalculation: '2024-02-29', closingItems: [titulo] };

async function cenario(opcoes: {
  paginas?: unknown[][]; saldo?: string; lancamentos?: unknown[]; consolidados?: string[];
  consultaEventos?: typeof consultaMensal; consultaLiquidacao?: ConsultaLiquidacoesV3;
} = {}) {
  const paginas = opcoes.paginas ?? [[evento()]];
  const consultaEventos = opcoes.consultaEventos ?? consultaMensal;
  const consultaLiquidacao = opcoes.consultaLiquidacao ?? consultaApuracao;
  const eventos = await consultarEventosFinancialV3(consultaEventos, async pedido => {
    const page = Number(new URL(pedido.url).searchParams.get('page'));
    return { status: 200, cabecalhos: {}, corpo: JSON.stringify({ page, size: 100, hasNextPage: page < paginas.length, financialEvents: paginas[page - 1] }) };
  });
  const campos = {
    merchantId: consultaLiquidacao.merchantId, beginDate: consultaLiquidacao.inicio, endDate: consultaLiquidacao.fim,
    consolidatedMerchants: 'consolidados' in opcoes ? opcoes.consolidados : [consultaLiquidacao.merchantId],
    settlements: opcoes.lancamentos ?? [grupo, titulo],
  };
  // Preserva o literal numérico exato do envelope, inclusive acima de MAX_SAFE_INTEGER.
  const corpo = '{"balance":' + (opcoes.saldo ?? '100') + ',' + JSON.stringify(campos).slice(1);
  const liquidacoes = await consultarLiquidacoesFinancialV3(consultaLiquidacao, async () => ({ status: 200, cabecalhos: {}, corpo }));
  const atestado = { identidade: { ...identidade }, coberturaCompleta: true, apuracaoEncerrada: true };
  return {
    origem: 'SIMULACAO' as const, identidade, eventos, liquidacoes,
    evidenciaEventos: { ...atestado, consulta: { ...consultaEventos } },
    evidenciaLiquidacao: { ...atestado, consulta: { ...consultaLiquidacao }, saldoIntegralDaIdentidade: true },
  } satisfies EntradaLiquidacaoMensalV3;
}

function exigirPendente(entrada: EntradaLiquidacaoMensalV3, ...motivos: string[]) {
  expect(conciliarLiquidacaoMensalV3(entrada)).toMatchObject({
    estado: 'PENDENTE', motivos: expect.arrayContaining(motivos), eventosComImpactoCentavos: null, saldoLiquidacaoCentavos: null, diferencaCentavos: null,
  });
}

describe('Conciliação mensal simulada entre eventos v3 e o saldo de liquidação por apuração', () => {
  it('conserva sinal, ocorrências repetidas e centavos grandes, sem adicionar títulos ou usar a data de pagamento', async () => {
    const entrada = await cenario({
      saldo: '9007199254740993.57',
      paginas: [[evento('9007199254740993.99'), evento('-0.21')], [evento('-0.21'), { ...evento(), hasTransferImpact: false, amount: null }]],
    });
    expect(entrada.eventos.paginasLidas).toBe(2);
    expect(conciliarLiquidacaoMensalV3(entrada)).toMatchObject({
      origem: 'SIMULACAO', estado: 'COMPATIVEL', motivos: [], politica: { toleranciaPercentual: '0.01', base: 'ABS_LIQUIDACAO' },
      eventosComImpactoCentavos: 900719925474099357n, saldoLiquidacaoCentavos: 900719925474099357n, diferencaCentavos: 0n,
    });
  });

  it.each([
    ['10000', '10001.00', 100n, 'COMPATIVEL'], ['10000', '10001.01', 101n, 'DIVERGENTE'],
    ['-100', '-100.01', -1n, 'COMPATIVEL'], ['-99.99', '-100', -1n, 'DIVERGENTE'], ['0', '0.01', 1n, 'DIVERGENTE'],
  ] as const)('aplica a tolerância sobre o saldo %s com eventos de %s', async (saldo, total, diferenca, estado) => {
    expect(conciliarLiquidacaoMensalV3(await cenario({ saldo, paginas: [[evento(total)]] }))).toMatchObject({ estado, motivos: [], diferencaCentavos: diferenca });
  });

  it('só aceita zero com fontes presentes, cobertura completa e apuração encerrada', async () => {
    const entrada = await cenario({ saldo: '0', paginas: [[]], lancamentos: [] });
    expect(conciliarLiquidacaoMensalV3(entrada)).toMatchObject({ estado: 'COMPATIVEL', eventosComImpactoCentavos: 0n, saldoLiquidacaoCentavos: 0n });
    exigirPendente({ ...entrada, eventos: null }, 'EVENTOS_AUSENTES');
    exigirPendente({ ...entrada, liquidacoes: null }, 'LIQUIDACAO_AUSENTE');
    for (const [fonte, nome] of [['evidenciaEventos', 'EVENTOS'], ['evidenciaLiquidacao', 'LIQUIDACAO']] as const) {
      exigirPendente({ ...entrada, [fonte]: null }, 'VINCULO_EVIDENCIA_' + nome);
      for (const falha of [false, null, undefined]) {
        exigirPendente({ ...entrada, [fonte]: { ...entrada[fonte], coberturaCompleta: falha } }, 'COBERTURA_' + nome + '_NAO_COMPROVADA');
        exigirPendente({ ...entrada, [fonte]: { ...entrada[fonte], apuracaoEncerrada: falha } }, 'APURACAO_' + nome + '_NAO_ENCERRADA');
      }
    }
    for (const falha of [false, undefined, null]) {
      exigirPendente({ ...entrada, evidenciaLiquidacao: { ...entrada.evidenciaLiquidacao, saldoIntegralDaIdentidade: falha } }, 'SALDO_SEM_ATRIBUICAO_INTEGRAL');
    }
  });

  it('confere identidade completa e vincula cada evidência à consulta, ao calendário e ao filtro da fonte', async () => {
    const entrada = await cenario();
    for (const [fonte, nome] of [['evidenciaEventos', 'EVENTOS'], ['evidenciaLiquidacao', 'LIQUIDACAO']] as const) {
      for (const outro of [{ parceiro: 'parceiro-b' }, { loja: 'loja-b' }, { merchant: outroMerchant }, { produto: 'OUTRO' }, { competencia: '2024-03' }, { moeda: 'EUR' }, { moeda: null }]) {
        exigirPendente({ ...entrada, [fonte]: { ...entrada[fonte], identidade: { ...identidade, ...outro } } }, 'IDENTIDADE_' + nome + '_DIVERGENTE');
      }
      for (const consulta of [{ merchantId: outroMerchant }, { inicio: '2024-02-02' }, { fim: '2024-02-28' }]) {
        exigirPendente({ ...entrada, [fonte]: { ...entrada[fonte], consulta: { ...entrada[fonte].consulta, ...consulta } } }, 'VINCULO_EVIDENCIA_' + nome);
      }
    }
    exigirPendente({ ...entrada, evidenciaEventos: entrada.evidenciaLiquidacao }, 'VINCULO_EVIDENCIA_EVENTOS');
    exigirPendente({ ...entrada, evidenciaLiquidacao: { ...entrada.evidenciaLiquidacao, consulta: { ...consultaApuracao, filtro: 'PAGAMENTO' } } }, 'VINCULO_EVIDENCIA_LIQUIDACAO');
    exigirPendente({ ...entrada, identidade: { ...identidade, competencia: '2024-13' } }, 'IDENTIDADE_CENARIO_INVALIDA');
  });

  it('exige loja, mês civil completo e APURACAO mesmo com atestados das consultas reportadas', async () => {
    exigirPendente(await cenario({ consultaLiquidacao: { ...consultaApuracao, filtro: 'PAGAMENTO' } }), 'FILTRO_LIQUIDACAO_INCOMPATIVEL');
    for (const alteracao of [{ inicio: '2024-02-02' }, { fim: '2024-02-28' }, { fim: '2024-03-01' }]) {
      exigirPendente(await cenario({ consultaLiquidacao: { ...consultaApuracao, ...alteracao } }), 'JANELA_LIQUIDACAO_DIVERGENTE');
      exigirPendente(await cenario({ consultaEventos: { ...consultaMensal, ...alteracao } }), 'JANELA_EVENTOS_DIVERGENTE');
    }
    exigirPendente(await cenario({ consultaEventos: { ...consultaMensal, merchantId: outroMerchant } }), 'LOJA_DIVERGENTE');
    exigirPendente(await cenario({ consultaLiquidacao: { ...consultaApuracao, merchantId: outroMerchant } }), 'LOJA_DIVERGENTE');
  });

  it('exige o merchant consultado como único consolidado, mesmo quando o saldo é zero', async () => {
    for (const consolidados of [undefined, [], [outroMerchant], [merchantId, outroMerchant]]) {
      exigirPendente(await cenario({ consolidados, saldo: '0', paginas: [[]] }),
        consolidados?.length ? 'CONSOLIDACAO_COM_OUTRAS_LOJAS' : 'CONSOLIDACAO_NAO_COMPROVADA');
    }
    const entrada = await cenario();
    const envelope = entrada.liquidacoes.liquidacoes;
    exigirPendente({
      ...entrada, liquidacoes: { ...entrada.liquidacoes, liquidacoes: { ...envelope, quantidadeMerchantsConsolidados: 0 } },
    }, 'CONSOLIDACAO_NAO_COMPROVADA');
  });

  it('confere todos os títulos e grupos, inclusive grupos vazios no limite do mês, sem rateio', async () => {
    for (const product of [null, 'OUTRO']) {
      exigirPendente(await cenario({ lancamentos: [grupo, { ...titulo, product }] }), 'PRODUTO_INCOMPATIVEL');
      exigirPendente(await cenario({ lancamentos: [{ ...grupo, closingItems: [titulo, { ...titulo, product }] }] }), 'PRODUTO_INCOMPATIVEL');
    }
    for (const [inicio, fim] of [['2024-01-29', '2024-02-04'], ['2024-02-26', '2024-03-03'], ['2024-01-01', '2024-01-07'], ['2024-03-01', '2024-03-07']]) {
      exigirPendente(await cenario({ lancamentos: [grupo, { startDateCalculation: inicio, endDateCalculation: fim, closingItems: [] }] }), 'GRUPO_FORA_DA_COMPETENCIA');
    }
  });

  it('considera recebedor, competência e produto em toda ocorrência e exige impacto e valor elegível conhecidos', async () => {
    const informativo = { ...evento(), hasTransferImpact: false, amount: null };
    exigirPendente(await cenario({ paginas: [[evento(), { ...informativo, receiver: { merchantId: outroMerchant } }]] }), 'RECEBEDOR_FORA_DA_LOJA');
    for (const incorreto of [null, '2024-03'])
      exigirPendente(await cenario({ paginas: [[evento(), { ...informativo, competence: incorreto }]] }), 'COMPETENCIA_EVENTO_INCOMPATIVEL');
    for (const incorreto of [null, 'OUTRO'])
      exigirPendente(await cenario({ paginas: [[evento(), { ...informativo, product: incorreto }]] }), 'PRODUTO_INCOMPATIVEL');
    exigirPendente(await cenario({ paginas: [[{ ...evento(), hasTransferImpact: null }]] }), 'IMPACTO_EVENTO_DESCONHECIDO');
    exigirPendente(await cenario({ paginas: [[{ ...evento(), amount: null }]] }), 'VALOR_EVENTO_DESCONHECIDO');
  });

  it('rejeita origens operacionais e valores monetários que não vieram do leitor', async () => {
    const entrada = await cenario();
    // @ts-expect-error Testa também a fronteira de chamadas sem TypeScript.
    expect(() => conciliarLiquidacaoMensalV3({ ...entrada, origem: 'OPERACAO' })).toThrow('Origem');
    const envelope = entrada.liquidacoes.liquidacoes;
    // @ts-expect-error A ausência de saldo em um resultado avulso também não pode virar zero.
    exigirPendente({ ...entrada, liquidacoes: { ...entrada.liquidacoes, liquidacoes: { ...envelope, saldoCentavos: null } } }, 'SALDO_LIQUIDACAO_AUSENTE');
    // @ts-expect-error Um número de ponto flutuante não é um saldo normalizado em centavos.
    expect(() => conciliarLiquidacaoMensalV3({ ...entrada, liquidacoes: { ...entrada.liquidacoes, liquidacoes: { ...envelope, saldoCentavos: 100 } } })).toThrow('Saldo');
  });
});
