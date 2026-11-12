import { describe, expect, it } from 'vitest';
import type { TituloAntecipacaoV3 } from '@/lib/integracoes/ifood/financial-v3-antecipacoes';
import { consultarAntecipacoesFinancialV3, type ConsultaAntecipacoesV3 } from '@/lib/integracoes/ifood/financial-v3-consultas';
import { conferirCustoAntecipacaoMensalV3, type EntradaCustoAntecipacaoMensalV3 } from '@/lib/integracoes/ifood/financial-v3-custo-antecipacao';

const merchantId = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const outroMerchant = 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb';
const apuracao: ConsultaAntecipacoesV3 = { merchantId, inicio: '2024-02-01', fim: '2024-02-29', filtro: 'APURACAO' };
const identidade = { parceiro: 'parceiro-fixture', loja: 'loja-fixture', merchant: merchantId, produto: 'DELIVERY', competencia: '2024-02', moeda: 'BRL' as const };
const titulo = (campos: Record<string, unknown> = {}) => ({
  type: 'TIPO_FIXTURE', status: 'SUCCEED', originalPaymentDate: '2024-04-08', anticipatedPaymentDate: '2024-03-04',
  originalPaymentAmount: 800, anticipatedPaymentAmount: 796, feeAmount: 4, feePercentage: 0.5, ...campos,
});
const grupo = (closingItems: unknown[] | null, campos: Record<string, unknown> = {}) => ({
  startDateCalculation: '2024-02-23', endDateCalculation: '2024-02-29', closingItems, ...campos,
});

async function cenario(grupos: unknown[] = [grupo([titulo()])], consulta: ConsultaAntecipacoesV3 = apuracao) {
  const envelope = { merchantId: consulta.merchantId, beginDate: consulta.inicio, endDate: consulta.fim, balance: 777777, settlements: grupos };
  // Permite fixtures com tokens JSON exatos além de Number.
  const corpo = JSON.stringify(envelope).replace(/"numero:([-+.\deE]+)"/g, '$1');
  const fonte = await consultarAntecipacoesFinancialV3(consulta, async () => ({ status: 200, cabecalhos: {}, corpo }));
  return {
    origem: 'SIMULACAO' as const, identidade, fonte,
    evidencia: { identidade: { ...identidade }, consulta: { ...consulta }, coberturaCompleta: true, apuracaoEncerrada: true,
      titulosDaIdentidade: true, descontoExclusivoDaAntecipacao: true },
  } satisfies EntradaCustoAntecipacaoMensalV3;
}

function comBases(entrada: Awaited<ReturnType<typeof cenario>>, ...bases: (bigint | null)[]) {
  const itens = entrada.fonte.antecipacoes.grupos.flatMap(g => g.itens ?? []);
  const basesPorTitulo = new Map<TituloAntecipacaoV3, bigint>();
  bases.forEach((base, i) => { if (base !== null) basesPorTitulo.set(itens[i], base); });
  return { ...entrada, basesPorTitulo };
}

function exigirMesPendente(entrada: EntradaCustoAntecipacaoMensalV3, motivo: string) {
  const r = conferirCustoAntecipacaoMensalV3(entrada);
  expect(r).toMatchObject({ estado: 'PENDENTE', motivos: expect.arrayContaining([motivo]),
    monetario: { estado: 'PENDENTE', taxaInformadaCentavos: null, diferencaBrutoLiquidoCentavos: null },
    percentual: { estado: 'PENDENTE', efetivoPonderado: null } });
  return r;
}

describe('Custo simulado das antecipações por loja e mês civil de apuração', () => {
  it('confere cada título na ordem do grupo e pondera somente bases e taxas dos SUCCEED', async () => {
    const falha = titulo({ type: 'FALHA_FIXTURE', status: 'FAILED', feeAmount: 90, feePercentage: 60 });
    const outro = titulo({ type: 'OUTRO_FIXTURE', originalPaymentDate: '2024-02-05', anticipatedPaymentDate: '2024-01-30',
      originalPaymentAmount: 200, anticipatedPaymentAmount: 196, feeAmount: 4, feePercentage: 2 });
    const entrada = comBases(await cenario([grupo([titulo(), falha]), grupo([outro])]), 80000n, 999999n, 20000n);
    expect(entrada.fonte.antecipacoes.cobertura).toBe('NAO_COMPROVADA');
    const r = conferirCustoAntecipacaoMensalV3(entrada);
    expect(r).toMatchObject({ origem: 'SIMULACAO', identidade, estado: 'COMPATIVEL', motivos: [],
      monetario: { estado: 'COMPATIVEL', motivos: [], taxaInformadaCentavos: 800n, diferencaBrutoLiquidoCentavos: 800n },
      percentual: { estado: 'COMPATIVEL', motivos: [], efetivoPonderado: { taxaCentavos: 800n, baseCentavos: 100000n } } });
    expect(r.titulos).toMatchObject([
      { indiceGrupo: 0, indiceTitulo: 0, tipo: 'TIPO_FIXTURE', estadoDeclarado: 'SUCCEED', tratamento: 'REALIZADO',
        inicioApuracao: '2024-02-23', fimApuracao: '2024-02-29', pagamentoOriginalEm: '2024-04-08', pagamentoAntecipadoEm: '2024-03-04',
        valorOriginalCentavos: 80000n, valorAntecipadoCentavos: 79600n, taxaCentavos: 400n, taxaPercentual: '0.5',
        monetario: { estado: 'COMPATIVEL', diferencaBrutoLiquidoCentavos: 400n }, percentual: { estado: 'COMPATIVEL', baseCentavos: 80000n } },
      { indiceGrupo: 0, indiceTitulo: 1, tipo: 'FALHA_FIXTURE', tratamento: 'EXCLUIDO_FAILED', estadoDeclarado: 'FAILED',
        taxaCentavos: 9000n, taxaPercentual: '60', monetario: { estado: 'EXCLUIDO' }, percentual: { estado: 'EXCLUIDO' } },
      { indiceGrupo: 1, indiceTitulo: 0, tipo: 'OUTRO_FIXTURE', tratamento: 'REALIZADO', taxaCentavos: 400n, taxaPercentual: '2',
        monetario: { estado: 'COMPATIVEL' }, percentual: { estado: 'COMPATIVEL', baseCentavos: 20000n } },
    ]);
  });

  it('usa a base atestada da própria ocorrência, mesmo com títulos idênticos e base diferente do original', async () => {
    const repetido = titulo({ originalPaymentAmount: 900, anticipatedPaymentAmount: 896 });
    const entrada = comBases(await cenario([grupo([repetido, repetido])]), 80000n);
    const segundo = entrada.fonte.antecipacoes.grupos[0].itens![1];
    entrada.basesPorTitulo.set({ ...segundo }, 80000n);
    const r = conferirCustoAntecipacaoMensalV3(entrada);
    expect(r.monetario).toMatchObject({ estado: 'COMPATIVEL', taxaInformadaCentavos: 800n });
    expect(r.percentual).toEqual({ estado: 'PENDENTE', motivos: ['BASE_DO_TITULO_NAO_ATESTADA'], efetivoPonderado: null });
    expect(r.titulos.map(t => [t.indiceTitulo, t.taxaPercentual, t.percentual.estado, t.percentual.baseCentavos]))
      .toEqual([[0, '0.5', 'COMPATIVEL', 80000n], [1, '0.5', 'PENDENTE', null]]);
  });

  it('mantém divergências por ocorrência mesmo que as diferenças totais de R$ e de percentual se anulem', async () => {
    const a = titulo({ originalPaymentAmount: 100, anticipatedPaymentAmount: 99, feeAmount: 2, feePercentage: 3 });
    const b = titulo({ originalPaymentAmount: 100, anticipatedPaymentAmount: 97, feeAmount: 2, feePercentage: 1 });
    const r = conferirCustoAntecipacaoMensalV3(comBases(await cenario([grupo([a, b])]), 10000n, 10000n));
    expect(r).toMatchObject({ estado: 'DIVERGENTE',
      monetario: { estado: 'DIVERGENTE', taxaInformadaCentavos: 400n, diferencaBrutoLiquidoCentavos: 400n },
      percentual: { estado: 'DIVERGENTE', efetivoPonderado: { taxaCentavos: 400n, baseCentavos: 20000n } } });
    expect(r.titulos.map(t => [t.monetario.estado, t.percentual.estado, t.monetario.diferencaBrutoLiquidoCentavos]))
      .toEqual([['DIVERGENTE', 'DIVERGENTE', 100n], ['DIVERGENTE', 'DIVERGENTE', 300n]]);
  });

  it('exige prova de desconto exclusivo para confrontar bruto e líquido e mantém o percentual independente', async () => {
    const entrada = comBases(await cenario([grupo([titulo({ anticipatedPaymentAmount: 790 })])]), 80000n);
    expect(conferirCustoAntecipacaoMensalV3(entrada)).toMatchObject({ monetario: { estado: 'DIVERGENTE' }, percentual: { estado: 'COMPATIVEL' } });
    const r = conferirCustoAntecipacaoMensalV3({ ...entrada, evidencia: { ...entrada.evidencia, descontoExclusivoDaAntecipacao: false } });
    expect(r).toMatchObject({ estado: 'PENDENTE', monetario: { estado: 'PENDENTE', motivos: ['DESCONTO_EXCLUSIVO_NAO_COMPROVADO'],
      taxaInformadaCentavos: 400n, diferencaBrutoLiquidoCentavos: 1000n }, percentual: { estado: 'COMPATIVEL' } });
  });

  it('conserva a razão efetiva quando o percentual declarado envolve arredondamento a centavos sem regra', async () => {
    const entrada = comBases(await cenario([grupo([titulo({ originalPaymentAmount: 47.90, anticipatedPaymentAmount: 46.37,
      feeAmount: 1.53, feePercentage: 3.2 })])]), 4790n);
    expect(conferirCustoAntecipacaoMensalV3(entrada)).toMatchObject({ estado: 'PENDENTE',
      monetario: { estado: 'COMPATIVEL', taxaInformadaCentavos: 153n },
      percentual: { estado: 'PENDENTE', motivos: ['ARREDONDAMENTO_NAO_COMPROVADO'], efetivoPonderado: { taxaCentavos: 153n, baseCentavos: 4790n } },
      titulos: [{ taxaPercentual: '3.2', percentual: { estado: 'PENDENTE' } }] });
  });

  it('mantém valores acima de Number e confronta expoentes positivos e negativos sem perder o último dígito', async () => {
    const grande = { originalPaymentAmount: 'numero:9.007199254740993123456789e+22', anticipatedPaymentAmount: 0,
      feeAmount: 'numero:90071992547409931234567.89' };
    const p = '9.007199254740993123456789e+24', vizinho = '9.007199254740993123456788e+24';
    const pequeno = titulo({ originalPaymentAmount: 1, anticipatedPaymentAmount: 0.99, feeAmount: 0.01, feePercentage: 'numero:1.2500e-3' });
    const entrada = comBases(await cenario([grupo([titulo({ ...grande, feePercentage: 'numero:' + p }),
      titulo({ ...grande, feePercentage: 'numero:' + vizinho }), pequeno])]), 100n, 100n, 80000n);
    const r = conferirCustoAntecipacaoMensalV3(entrada);
    expect(r.titulos.map(t => [t.taxaCentavos, t.taxaPercentual, t.percentual.estado])).toEqual([
      [9007199254740993123456789n, p, 'COMPATIVEL'], [9007199254740993123456789n, vizinho, 'DIVERGENTE'], [1n, '1.2500e-3', 'COMPATIVEL'],
    ]);
    expect(r.monetario.estado).toBe('COMPATIVEL');
  });

  it.each(['1e99999999999999999999', '1e-99999999999999999999', '0e+1000000000'])(
    'limita o expoente de %s antes da potência e mantém os centavos e o literal', async literal => {
      const entrada = comBases(await cenario([grupo([titulo({ feePercentage: 'numero:' + literal })])]), 80000n);
      expect(conferirCustoAntecipacaoMensalV3(entrada)).toMatchObject({ monetario: { estado: 'COMPATIVEL', taxaInformadaCentavos: 400n },
        percentual: { estado: 'PENDENTE', motivos: ['PERCENTUAL_FORA_DO_LIMITE_LOCAL'] }, titulos: [{ taxaPercentual: literal }] });
    });

  it.each([0n, -1n])('uma base %s não demonstra o percentual e preserva a taxa monetária realizada', async base => {
    const r = conferirCustoAntecipacaoMensalV3(comBases(await cenario(), base));
    expect(r).toMatchObject({ monetario: { estado: 'COMPATIVEL', taxaInformadaCentavos: 400n },
      percentual: { estado: 'PENDENTE', efetivoPonderado: null, motivos: ['BASE_DO_TITULO_NAO_POSITIVA'] } });
  });

  it('distingue valores zero, ausentes e negativos em cada conferência', async () => {
    const zero = titulo({ originalPaymentAmount: 0, anticipatedPaymentAmount: 0, feeAmount: 0, feePercentage: 'numero:-0e-2' });
    const conferir = async (campos: Record<string, unknown>) => conferirCustoAntecipacaoMensalV3(comBases(await cenario([grupo([{ ...zero, ...campos }])]), 100n));
    expect(await conferir({})).toMatchObject({ estado: 'COMPATIVEL', monetario: { taxaInformadaCentavos: 0n, diferencaBrutoLiquidoCentavos: 0n },
      percentual: { efetivoPonderado: { taxaCentavos: 0n, baseCentavos: 100n } }, titulos: [{ taxaPercentual: '-0e-2' }] });
    for (const campo of ['originalPaymentAmount', 'anticipatedPaymentAmount']) for (const valor of [null, -1]) {
      expect(await conferir({ [campo]: valor })).toMatchObject({ monetario: { estado: 'PENDENTE', taxaInformadaCentavos: 0n, diferencaBrutoLiquidoCentavos: null },
        percentual: { estado: 'COMPATIVEL' } });
    }
    for (const feeAmount of [null, -1]) expect(await conferir({ feeAmount })).toMatchObject({
      monetario: { estado: 'PENDENTE', taxaInformadaCentavos: null, diferencaBrutoLiquidoCentavos: 0n },
      percentual: { estado: 'PENDENTE', efetivoPonderado: null } });
    for (const feePercentage of [null, -1]) expect(await conferir({ feePercentage })).toMatchObject({
      monetario: { estado: 'COMPATIVEL', taxaInformadaCentavos: 0n },
      percentual: { estado: 'PENDENTE', motivos: ['PERCENTUAL_AUSENTE_OU_INVALIDO'], efetivoPonderado: { taxaCentavos: 0n, baseCentavos: 100n } } });
  });

  it('não realiza um status desconhecido e preserva a comparação dos outros títulos', async () => {
    for (const status of ['FUTURO', 'succeed', null]) {
      const r = exigirMesPendente(comBases(await cenario([grupo([titulo(), titulo({ status })])]), 80000n, 80000n), 'ESTADO_DO_TITULO_DESCONHECIDO');
      expect(r.titulos).toMatchObject([{ tratamento: 'REALIZADO', monetario: { estado: 'COMPATIVEL' } },
        { tratamento: 'PENDENTE', estadoDeclarado: status, taxaCentavos: 400n, percentual: { estado: 'PENDENTE' } }]);
    }
  });

  it('exige datas de pagamento válidas e antecedência demonstrável para um SUCCEED', async () => {
    for (const campos of [{ originalPaymentDate: null }, { anticipatedPaymentDate: null }])
      exigirMesPendente(comBases(await cenario([grupo([titulo(campos)])]), 80000n), 'DATAS_DO_TITULO_AUSENTES_OU_INVALIDAS');
    for (const anticipatedPaymentDate of ['2024-04-08', '2024-04-09'])
      exigirMesPendente(comBases(await cenario([grupo([titulo({ anticipatedPaymentDate })])]), 80000n), 'ANTECEDENCIA_NAO_COMPROVADA');
    await expect(cenario([grupo([titulo({ originalPaymentDate: '2024-02-31' })])])).rejects.toMatchObject({ codigo: 'ESTRUTURA' });
  });

  it('mantém parcial o mês com grupo fora da competência ou sem datas, mesmo que os pagamentos caiam nele', async () => {
    for (const [campos, motivo] of [
      [{ startDateCalculation: '2024-01-29' }, 'GRUPO_FORA_DA_COMPETENCIA'],
      [{ endDateCalculation: '2024-03-02' }, 'GRUPO_FORA_DA_COMPETENCIA'],
      [{ startDateCalculation: '2024-01-10', endDateCalculation: '2024-01-12' }, 'GRUPO_FORA_DA_COMPETENCIA'],
      [{ startDateCalculation: null }, 'PERIODO_GRUPO_INDETERMINADO'], [{ endDateCalculation: null }, 'PERIODO_GRUPO_INDETERMINADO'],
    ] as const) {
      const item = titulo({ originalPaymentDate: '2024-02-26', anticipatedPaymentDate: '2024-02-14' });
      const r = exigirMesPendente(comBases(await cenario([grupo([titulo()]), grupo([item], campos)]), 80000n, 80000n), motivo);
      expect(r.titulos).toMatchObject([{ tratamento: 'REALIZADO' }, { tratamento: 'PENDENTE', taxaCentavos: 400n }]);
    }
  });

  it('separa mês vazio comprovado, lista vazia, tentativas FAILED e lista de títulos ausente', async () => {
    for (const grupos of [[], [grupo([])], [grupo([{ status: 'FAILED' }])]]) {
      expect(conferirCustoAntecipacaoMensalV3(await cenario(grupos))).toMatchObject({ estado: 'COMPATIVEL', motivos: [],
        monetario: { estado: 'COMPATIVEL', taxaInformadaCentavos: 0n, diferencaBrutoLiquidoCentavos: 0n },
        percentual: { estado: 'SEM_APLICACAO', efetivoPonderado: null } });
    }
    exigirMesPendente(await cenario([grupo(null)]), 'LISTA_DE_TITULOS_AUSENTE');
    exigirMesPendente({ ...await cenario(), fonte: null }, 'ANTECIPACOES_AUSENTES');
  });

  it('vincula a evidência às seis partes da identidade, ao filtro e aos limites da consulta', async () => {
    const entrada = await cenario();
    for (const campos of [{ parceiro: 'parceiro-b' }, { loja: 'loja-b' }, { merchant: outroMerchant }, { produto: 'OUTRO' }, { competencia: '2024-03' }, { moeda: 'EUR' }]) {
      const evidencia = { ...entrada.evidencia, identidade: { ...identidade, ...campos } };
      expect(exigirMesPendente({ ...entrada, evidencia }, 'IDENTIDADE_ANTECIPACOES_DIVERGENTE').titulos).toEqual([]);
    }
    for (const campos of [{ merchantId: outroMerchant }, { inicio: '2024-02-02' }, { fim: '2024-02-28' }, { filtro: 'PAGAMENTO_ANTECIPADO' as const }]) {
      const evidencia = { ...entrada.evidencia, consulta: { ...apuracao, ...campos } };
      exigirMesPendente({ ...entrada, evidencia }, 'VINCULO_EVIDENCIA_ANTECIPACOES');
    }
    for (const [consulta, motivo] of [
      [{ ...apuracao, merchantId: outroMerchant }, 'LOJA_DIVERGENTE'], [{ ...apuracao, filtro: 'PAGAMENTO_ANTECIPADO' }, 'FILTRO_ANTECIPACOES_INCOMPATIVEL'],
      [{ ...apuracao, fim: '2024-02-28' }, 'JANELA_ANTECIPACOES_DIVERGENTE'],
    ] as const) exigirMesPendente(await cenario([grupo([titulo()])], consulta), motivo);
    exigirMesPendente({ ...entrada, identidade: { ...identidade, competencia: '2024-13' } }, 'IDENTIDADE_CENARIO_INVALIDA');
    expect(() => conferirCustoAntecipacaoMensalV3({ ...entrada, origem: 'TEST' as never })).toThrow('Origem incompatível');
  });

  it('não extrai cobertura, apuração encerrada ou atribuição dos títulos da resposta de consulta', async () => {
    const entrada = comBases(await cenario(), 80000n);
    for (const valor of [false, null, undefined]) {
      for (const [campo, motivo] of [['coberturaCompleta', 'COBERTURA_ANTECIPACOES_NAO_COMPROVADA'],
        ['apuracaoEncerrada', 'APURACAO_ANTECIPACOES_NAO_ENCERRADA']] as const) {
        const r = exigirMesPendente({ ...entrada, evidencia: { ...entrada.evidencia, [campo]: valor } }, motivo);
        expect(r.titulos[0].monetario.estado).toBe('COMPATIVEL');
      }
      expect(exigirMesPendente({ ...entrada, evidencia: { ...entrada.evidencia, titulosDaIdentidade: valor } }, 'TITULOS_SEM_ATRIBUICAO').titulos).toEqual([]);
    }
    exigirMesPendente({ ...entrada, evidencia: null }, 'VINCULO_EVIDENCIA_ANTECIPACOES');
  });
});
