import { describe, expect, it } from 'vitest';
import { consultarEventosFinancialV3 } from '@/lib/integracoes/ifood/financial-v3-consultas';
import { compararTaxasMensaisV3, type EntradaTaxasMensaisV3, type VigenciaTaxaMensalV3 } from '@/lib/integracoes/ifood/financial-v3-taxas-mensais';

const merchant = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const identidade = { parceiro: 'parceiro-fixture', loja: 'loja-fixture', merchant, competencia: '2024-02', produto: 'IFOOD', moeda: 'BRL' as const };
const mes = { merchantId: merchant, inicio: '2024-02-01', fim: '2024-02-29' };
const comissao = 'ORDER_COMMISSION';
const pagamento = 'PAYMENT_TRANSACTION_FEE';
const linha = { parceiroId: identidade.parceiro, canal: 'IFOOD', taxaConfigurada: true, taxaBp: 1200, taxaPagamentoBp: 320 };
const vigencia = {
  identidade, inicio: mes.inicio, fim: mes.fim, linha, basesAtestadas: [comissao, pagamento], periodoDaVendaAplicavel: true,
} as const satisfies VigenciaTaxaMensalV3;

function venda(name: string = comissao, value = '-12.00', baseValue = '100.00', feePercentage = '12') {
  return { name, trigger: 'SALE_CONCLUDED', product: identidade.produto, competence: identidade.competencia,
    hasTransferImpact: true, period: { beginDate: '2024-02-05', endDate: '2024-02-11' },
    billing: { baseValue, feePercentage }, amount: { value }, receiver: { merchantId: merchant } };
}
const taxaDePagamento = venda(pagamento, '-1.60', '50', '3.2');

async function cenario(paginas: unknown[][] = [[venda(), taxaDePagamento]], consulta = mes) {
  const eventos = await consultarEventosFinancialV3(consulta, async pedido => {
    const page = Number(new URL(pedido.url).searchParams.get('page'));
    return { status: 200, cabecalhos: {}, corpo: JSON.stringify({ page, size: 100, hasNextPage: page < paginas.length, financialEvents: paginas[page - 1] }) };
  });
  return {
    origem: 'SIMULACAO' as const, identidade, eventos, vigencias: [vigencia], evidenciaEventos: {
      consulta: eventos.consulta, identidade, coberturaCompleta: true, apuracaoEncerrada: true,
    },
  } satisfies EntradaTaxasMensaisV3;
}

const comparar = compararTaxasMensaisV3;
function comissaoPendente(entrada: EntradaTaxasMensaisV3, motivo: string) {
  const resultado = comparar(entrada);
  expect(resultado.estado).toBe('PENDENTE');
  expect(resultado.porTipo[comissao]).toMatchObject({ estado: 'PENDENTE', motivos: expect.arrayContaining([motivo]),
    cobradoCentavos: null, previstoCentavos: null, diferencaCentavos: null });
}

describe('Financial v3 • taxas configuradas e cobradas da loja por competência', () => {
  it('compara a taxa e a base próprias de cada tipo, mantendo paginação, repetições e centavos acima de MAX_SAFE_INTEGER', async () => {
    const evento = venda(comissao, '-1080863910568919.16', '9007199254740993.00', '12.00');
    const outraRubrica = { ...venda(), name: 'ORDER_PAYMENT', billing: { baseValue: '100.00' } };
    const entrada = await cenario([[evento, outraRubrica], [evento, taxaDePagamento]]);
    expect(entrada.eventos.paginasLidas).toBe(2);
    const r = comparar(entrada);
    expect(r).toMatchObject({ origem: 'SIMULACAO', identidade, estado: 'COMPATIVEL', motivos: [] });
    expect(r.porTipo[comissao]).toMatchObject({ cobradoCentavos: -216172782113783832n, previstoCentavos: -216172782113783832n, diferencaCentavos: 0n });
    expect(r.porTipo[comissao].ocorrencias.map(o => o.indice)).toEqual([0, 2]);
    expect(r.porTipo[pagamento]).toMatchObject({ cobradoCentavos: -160n, ocorrencias: [
      { natureza: 'DEBITO', configuradaBp: 320, baseCentavos: 5000n, percentualCobrado: '3.2', percentualCompativel: true },
    ] });
  });

  it('duas divergências monetárias se compensam no líquido e continuam divergentes; um centavo já diverge', async () => {
    const r = comparar(await cenario([[venda(comissao, '-12.01'), venda(comissao, '-11.99'), taxaDePagamento]]));
    expect(r.estado).toBe('DIVERGENTE');
    expect(r.porTipo[comissao]).toMatchObject({ estado: 'DIVERGENTE', diferencaCentavos: 0n,
      ocorrencias: [{ estado: 'DIVERGENTE', diferencaCentavos: -1n }, { estado: 'DIVERGENTE', diferencaCentavos: 1n }] });
    expect(r.porTipo[pagamento].estado).toBe('COMPATIVEL');
  });

  it('identifica percentual declarado divergente mesmo quando o dinheiro confere e a diferença é uma fração de bp', async () => {
    const r = comparar(await cenario([[venda(comissao, '-12.00', '100', '12.000000000000000001'), taxaDePagamento]]));
    expect(r.porTipo[comissao]).toMatchObject({ estado: 'DIVERGENTE', diferencaCentavos: 0n, ocorrencias: [
      { configuradaBp: 1200, percentualCobrado: '12.000000000000000001', percentualCompativel: false },
    ] });
  });

  it('respeita a troca de regra no meio do mês sem usar média simples de taxas ou o último valor', async () => {
    const primeiro = { ...venda(), period: { beginDate: mes.inicio, endDate: '2024-02-14' } };
    const segundo = { ...venda(comissao, '-0.80', '10', '8'), period: { beginDate: '2024-02-15', endDate: mes.fim } };
    const vigencias = [{ ...vigencia, fim: '2024-02-14' }, { ...vigencia, inicio: '2024-02-15', linha: { ...linha, taxaBp: 800 } }];
    const entrada = await cenario([[primeiro, segundo, taxaDePagamento]]);
    expect(comparar({ ...entrada, vigencias }).porTipo[comissao]).toMatchObject({ estado: 'COMPATIVEL', previstoCentavos: -1280n,
      ocorrencias: [{ configuradaBp: 1200 }, { configuradaBp: 800 }] });

    const cruza = { ...primeiro, period: { beginDate: '2024-02-14', endDate: '2024-02-15' } };
    const atravessa = await cenario([[cruza, taxaDePagamento]]);
    const carga = { ...atravessa, vigencias };
    comissaoPendente(carga, 'PERIODO_ABRANGE_VIGENCIAS');
    // Uma cópia idêntica ou uma ocorrência de outra consulta não prova o dia desta cobrança.
    comissaoPendente({ ...carga, datasAplicaveis: new Map([[{ ...carga.eventos.eventos[0] }, '2024-02-14']]) }, 'PERIODO_ABRANGE_VIGENCIAS');
    const atestar = (dia: string) => ({ ...carga, datasAplicaveis: new Map([[carga.eventos.eventos[0], dia]]) });
    expect(comparar(atestar('2024-02-14')).estado).toBe('COMPATIVEL');
    expect(comparar(atestar('2024-02-15')).estado).toBe('DIVERGENTE');
    comissaoPendente(atestar('2024-02-13'), 'DATA_APLICAVEL_NAO_COMPROVADA');
  });

  it('só usa a configuração histórica da venda original para estornos e confere o sinal de cada ocorrência', async () => {
    const estorno = { ...venda(comissao, '8', '100', '8'), trigger: 'SALE_PARTIAL_CANCELLED' };
    const entrada = await cenario([[venda(), estorno, taxaDePagamento]]);
    comissaoPendente(entrada, 'DATA_APLICAVEL_NAO_COMPROVADA');
    const vigencias = [{ ...vigencia, inicio: '2024-01-01', fim: '2024-01-31', linha: { ...linha, taxaBp: 800 } }, vigencia];
    const datasAplicaveis = new Map([[entrada.eventos.eventos[1], '2024-01-27']]);
    comissaoPendente({ ...entrada, datasAplicaveis }, 'VIGENCIA_AUSENTE');
    expect(comparar({ ...entrada, vigencias, datasAplicaveis }).porTipo[comissao]).toMatchObject({
      estado: 'COMPATIVEL', cobradoCentavos: -400n, ocorrencias: [{ natureza: 'DEBITO', previstoCentavos: -1200n },
        { natureza: 'ESTORNO', configuradaBp: 800, previstoCentavos: 800n }],
    });
    const sinal = comparar(await cenario([[venda(comissao, '12'), taxaDePagamento]]));
    expect(sinal.porTipo[comissao]).toMatchObject({ estado: 'DIVERGENTE', diferencaCentavos: 2400n });
    const debitoNoCancelamento = await cenario([[{ ...estorno, amount: { value: '-8' } }, taxaDePagamento]]);
    expect(comparar({ ...debitoNoCancelamento, vigencias, datasAplicaveis: new Map([[debitoNoCancelamento.eventos.eventos[0], '2024-01-27']]) })
      .porTipo[comissao]).toMatchObject({ estado: 'DIVERGENTE', diferencaCentavos: -1600n });
  });

  it('um estorno da competência não pode usar a configuração de uma venda do mês seguinte', async () => {
    const estorno = { ...venda(comissao, '10', '100', '10'), trigger: 'SALE_CANCELLED',
      period: { beginDate: '2024-02-26', endDate: '2024-03-03' } };
    const entrada = await cenario([[estorno, taxaDePagamento]]);
    const marco = { ...vigencia, inicio: '2024-03-01', fim: '2024-03-31', linha: { ...linha, taxaBp: 1000 } };
    comissaoPendente({ ...entrada, vigencias: [vigencia, marco],
      datasAplicaveis: new Map([[entrada.eventos.eventos[0], '2024-03-02']]) }, 'DATA_APLICAVEL_NAO_COMPROVADA');
  });

  it('zero informado é verificável e preserva taxa e base; nenhuma ocorrência ou uma meta sozinha não comprova zero', async () => {
    const entrada = await cenario([[venda(comissao, '0', '0.00', '0.00'), taxaDePagamento]]);
    const taxaZero = { ...vigencia, linha: { ...linha, taxaBp: 0 } };
    expect(comparar({ ...entrada, vigencias: [taxaZero] }).porTipo[comissao]).toMatchObject({
      estado: 'COMPATIVEL', cobradoCentavos: 0n, previstoCentavos: 0n, ocorrencias: [{ configuradaBp: 0, baseCentavos: 0n }],
    });
    comissaoPendente({ ...entrada, vigencias: [{ ...taxaZero, linha: { ...taxaZero.linha, taxaConfigurada: false } }] }, 'CONFIGURACAO_AUSENTE');
    comissaoPendente(await cenario([[taxaDePagamento]]), 'SEM_OCORRENCIAS_DO_TIPO');
    comissaoPendente(await cenario([[]]), 'SEM_OCORRENCIAS_DO_TIPO');
  });

  it('uma lacuna ou sobreposição em qualquer dia civil impede fechar o mês mesmo fora do período dos eventos', async () => {
    const entrada = await cenario();
    comissaoPendente({ ...entrada, vigencias: [] }, 'VIGENCIA_AUSENTE');
    comissaoPendente({ ...entrada, vigencias: [{ ...vigencia, fim: '2024-02-28' }] }, 'VIGENCIA_AUSENTE');
    comissaoPendente({ ...entrada, vigencias: [vigencia, { ...vigencia, inicio: mes.fim }] }, 'VIGENCIAS_SOBREPOSTAS');
    comissaoPendente({ ...entrada, vigencias: [vigencia, { ...vigencia, basesAtestadas: [pagamento] }] }, 'VIGENCIAS_SOBREPOSTAS');
    comissaoPendente({ ...entrada, vigencias: [{ ...vigencia, fim: '2024-02-31' }] }, 'VIGENCIA_INVALIDA');
    comissaoPendente({ ...entrada, vigencias: [{ ...vigencia, periodoDaVendaAplicavel: false }] }, 'DATA_APLICAVEL_NAO_COMPROVADA');
    const semBase = comparar({ ...entrada, vigencias: [{ ...vigencia, basesAtestadas: [pagamento] }] });
    expect(semBase.porTipo[comissao].motivos).toContain('BASE_CONTRATUAL_NAO_ATESTADA');
    expect(semBase.porTipo[pagamento].estado).toBe('COMPATIVEL');
    for (const taxaBp of [NaN, 0.5, -1, 10_000]) {
      comissaoPendente({ ...entrada, vigencias: [{ ...vigencia, linha: { ...linha, taxaBp } }] }, 'CONFIGURACAO_AUSENTE');
    }
  });

  it('exige vínculo da linha do parceiro, loja, merchant, moeda, produto e competência em todos os atestados', async () => {
    const entrada = await cenario();
    const outroMerchant = 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb';
    for (const outro of [{ parceiro: 'outro' }, { loja: 'outra' }, { merchant: outroMerchant }, { competencia: '2024-03' }, { moeda: 'USD' }, { produto: 'OUTRO' }]) {
      const outra = { ...identidade, ...outro };
      comissaoPendente({ ...entrada, evidenciaEventos: { ...entrada.evidenciaEventos, identidade: outra } }, 'IDENTIDADE_EVENTOS_DIVERGENTE');
      comissaoPendente({ ...entrada, vigencias: [{ ...vigencia, identidade: outra }] }, 'IDENTIDADE_CONFIGURACAO_DIVERGENTE');
    }
    for (const outraLinha of [{ ...linha, parceiroId: 'outro' }, { ...linha, canal: 'DELIVERY_PROPRIO' }]) {
      comissaoPendente({ ...entrada, vigencias: [{ ...vigencia, linha: outraLinha }] }, 'IDENTIDADE_CONFIGURACAO_DIVERGENTE');
    }
    const outro = await cenario([[{ ...venda(), receiver: { merchantId: outroMerchant } }, taxaDePagamento]]);
    comissaoPendente(outro, 'RECEBEDOR_FORA_DA_LOJA');
    expect(comparar(outro).porTipo[comissao].ocorrencias).toEqual([]);
    comissaoPendente(await cenario([[{ ...venda(), product: 'OUTRO' }, taxaDePagamento]]), 'PRODUTO_INCOMPATIVEL');
    comissaoPendente(await cenario([[{ ...venda(), competence: '2024-03' }, taxaDePagamento]]), 'COMPETENCIA_EVENTO_INCOMPATIVEL');
  });

  it('exige consulta do mês, fechamento e cobertura vinculados à origem da simulação', async () => {
    const entrada = await cenario();
    for (const coberturaCompleta of [false, null, undefined]) {
      comissaoPendente({ ...entrada, evidenciaEventos: { ...entrada.evidenciaEventos, coberturaCompleta } }, 'COBERTURA_EVENTOS_NAO_COMPROVADA');
    }
    comissaoPendente({ ...entrada, evidenciaEventos: { ...entrada.evidenciaEventos, apuracaoEncerrada: false } }, 'APURACAO_EVENTOS_NAO_ENCERRADA');
    comissaoPendente({ ...entrada, evidenciaEventos: { ...entrada.evidenciaEventos, consulta: { ...mes, fim: '2024-02-28' } } }, 'VINCULO_EVIDENCIA_EVENTOS');
    comissaoPendente(await cenario([[venda(), taxaDePagamento]], { ...mes, fim: '2024-02-28' }), 'JANELA_EVENTOS_DIVERGENTE');
    comissaoPendente({ ...entrada, eventos: null }, 'EVENTOS_AUSENTES');
    expect(() => comparar({ ...entrada, origem: 'TEST' as 'SIMULACAO' })).toThrow('Origem incompatível');
  });

  it.each([
    ['BASE_COBRANCA_AUSENTE', { billing: { feePercentage: '12' } }],
    ['BASE_NEGATIVA_SEM_REGRA', { billing: { baseValue: '-100.00', feePercentage: '12' } }],
    ['PERCENTUAL_AUSENTE_OU_INVALIDO', { billing: { baseValue: '100.00' } }],
    ['ARREDONDAMENTO_NAO_COMPROVADO', { billing: { baseValue: '100.01', feePercentage: '12' } }],
    ['VALOR_EVENTO_DESCONHECIDO', { amount: {} }],
    ['IMPACTO_NAO_COMPROVADO', { hasTransferImpact: null }],
    ['IMPACTO_NAO_COMPROVADO', { hasTransferImpact: false }],
    ['GATILHO_NAO_CLASSIFICADO', { trigger: 'MANUAL_REBILLING' }],
    ['GATILHO_NAO_CLASSIFICADO', { trigger: 'NO_CONCLUDED_STATUS' }],
    ['PERIODO_EVENTO_INCOMPATIVEL', { period: {} }],
    ['PERIODO_EVENTO_INCOMPATIVEL', { period: { beginDate: '2024-01-01', endDate: '2024-01-07' } }],
  ] as const)('conserva o motivo por ocorrência e permite conferir o outro tipo (%s)', async (motivo, mudanca) => {
    const entrada = await cenario([[{ ...venda(), ...mudanca }, taxaDePagamento]]);
    comissaoPendente(entrada, motivo);
    const r = comparar(entrada);
    expect(r.porTipo[comissao].ocorrencias[0]).toMatchObject({ estado: 'PENDENTE', previstoCentavos: null, diferencaCentavos: null });
    expect(r.porTipo[pagamento].estado).toBe('COMPATIVEL');
  });

  it('rubrica sem nome ou com percentual e tipo desconhecido impede falso fechamento', async () => {
    for (const rubrica of [{ ...venda(), name: null }, venda('TAXA_FUTURA'), { ...venda('TAXA_FUTURA'), billing: { feePercentage: {} } }]) {
      comissaoPendente(await cenario([[venda(), taxaDePagamento, rubrica]]), 'TAXA_NAO_CLASSIFICADA');
    }
  });
});
