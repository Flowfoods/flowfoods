import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compararConciliacaoEventosV3, type EntradaComparacaoV3 } from '@/lib/integracoes/ifood/financial-v3-comparacao';
import { consultarEventosFinancialV3 } from '@/lib/integracoes/ifood/financial-v3-consultas';

const merchantId = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const outraLoja = 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb';
const competencia = '2024-02';
const produto = 'DELIVERY';
const consultaMensal = { merchantId, inicio: '2024-02-01', fim: '2024-02-29' };
const cabecalho = 'loja_id;competencia;pedido_associado_ifood;impacto_no_repasse;valor';
const lancamento = (valor: string, impacto = 'SIM') => [merchantId, competencia, 'pedido-ficticio', impacto, valor].join(';');
const evento = (valor = '1.00') => ({
  product: produto, competence: competencia, hasTransferImpact: true, amount: { value: valor },
  period: { beginDate: '2024-01-29', endDate: '2024-02-04' },
});

async function cenario(
  paginas: unknown[][] = [[evento()]],
  linhas = [lancamento('1.00')],
  consulta = consultaMensal,
) {
  const protocolo = { merchantId, competencia, requestId: 'geracao-mensal-ficticia' };
  const eventos = await consultarEventosFinancialV3(consulta, async pedido => {
    const numero = Number(new URL(pedido.url).searchParams.get('page'));
    return {
      status: 200, cabecalhos: {}, corpo: JSON.stringify({
        page: numero, size: 100, hasNextPage: numero < paginas.length, financialEvents: paginas[numero - 1],
      }),
    };
  });
  return {
    origem: 'SIMULACAO' as const, acompanhamento: { estado: 'DISPONIVEL' as const, protocolo }, eventos,
    arquivo: {
      protocolo, bytes: gzipSync([cabecalho, ...linhas].join('\n')),
      totaisInformados: { linhas: linhas.length, pedidos: linhas.length ? 1 : 0 },
    },
    evidenciaArquivo: { protocolo: { ...protocolo }, produto, moeda: 'BRL', coberturaCompleta: true, apuracaoEncerrada: true },
    evidenciaEventos: { consulta: { ...consulta }, produto, moeda: 'BRL', coberturaCompleta: true, apuracaoEncerrada: true },
  } satisfies EntradaComparacaoV3;
}

async function exigirPendente(entrada: EntradaComparacaoV3, ...motivos: string[]) {
  const resultado = await compararConciliacaoEventosV3(entrada);
  expect(resultado).toMatchObject({
    origem: 'SIMULACAO', estado: 'PENDENTE', motivos: expect.arrayContaining(motivos),
    eventosComImpactoCentavos: null, arquivoComImpactoCentavos: null, diferencaCentavos: null,
  });
}

describe('Comparação sintética do CSV mensal com Financial Events v3', () => {
  it('conserva ocorrências de duas páginas, centavos grandes e sinal; apuração semanal pode cruzar o mês', async () => {
    const valorGrande = '9007199254740993.99';
    const paginas = [[evento(valorGrande), evento('-0.21')], [
      evento('-0.21'), { ...evento(), hasTransferImpact: false, amount: null },
    ]];
    const linhas = [lancamento(valorGrande), lancamento('-0.21'), lancamento('-0.21'), lancamento('100.00', 'NAO')];
    const entrada = await cenario(paginas, linhas);
    expect(entrada.eventos.paginasLidas).toBe(2);
    expect(await compararConciliacaoEventosV3(entrada)).toStrictEqual({
      origem: 'SIMULACAO', estado: 'COINCIDENTE', motivos: [],
      arquivoComImpactoCentavos: 900719925474099357n, eventosComImpactoCentavos: 900719925474099357n, diferencaCentavos: 0n,
    });
  });

  it.each([['10000.01', 1n], ['9999.99', -1n]] as const)(
    'calcula eventos menos arquivo e apresenta diferença de um centavo para R$ %s', async (valor, diferenca) => {
      expect(await compararConciliacaoEventosV3(await cenario([[evento(valor)]], [lancamento('10000')]))).toMatchObject({
        estado: 'DIVERGENTE', motivos: [], arquivoComImpactoCentavos: 1000000n, diferencaCentavos: diferenca,
      });
    },
  );

  it('distingue zero observado, fontes vazias com cobertura comprovada e fontes ausentes', async () => {
    const zero = await cenario([[{ ...evento(), hasTransferImpact: false, amount: null }]], [lancamento('1.00', 'NAO')]);
    expect(await compararConciliacaoEventosV3(zero)).toMatchObject({
      estado: 'COINCIDENTE', eventosComImpactoCentavos: 0n, arquivoComImpactoCentavos: 0n,
    });
    expect(await compararConciliacaoEventosV3(await cenario([[]]))).toMatchObject({ estado: 'DIVERGENTE', diferencaCentavos: -100n });
    expect(await compararConciliacaoEventosV3(await cenario([[evento()]], []))).toMatchObject({ estado: 'DIVERGENTE', diferencaCentavos: 100n });
    const vazio = await cenario([[]], []);
    expect(await compararConciliacaoEventosV3(vazio)).toMatchObject({ estado: 'COINCIDENTE', diferencaCentavos: 0n });
    await exigirPendente({ ...vazio, arquivo: { ...vazio.arquivo, totaisInformados: { linhas: 0 } } }, 'ARQUIVO_PARCIAL');
    await exigirPendente({ ...vazio, evidenciaArquivo: { ...vazio.evidenciaArquivo, coberturaCompleta: false } }, 'COBERTURA_ARQUIVO_NAO_COMPROVADA');
    await exigirPendente({ ...vazio, evidenciaEventos: { ...vazio.evidenciaEventos, apuracaoEncerrada: false } }, 'APURACAO_EVENTOS_NAO_ENCERRADA');
    await exigirPendente({ ...zero, eventos: null }, 'EVENTOS_AUSENTES');
    await exigirPendente({ ...zero, arquivo: null }, 'ARQUIVO_INDISPONIVEL');
    for (const estado of ['PROCESSANDO', 'SEM_LANCAMENTOS', 'PROTOCOLO_INDISPONIVEL'] as const) {
      await exigirPendente({
        ...zero, acompanhamento: { ...zero.acompanhamento, estado }, arquivo: { ...zero.arquivo, bytes: new Uint8Array() },
      }, 'ARQUIVO_INDISPONIVEL');
    }
  });

  it('exige cobertura e apuração independentes para cada fonte mesmo após paginação e contagens conferidas', async () => {
    const entrada = await cenario();
    for (const [fonte, nome] of [['evidenciaArquivo', 'ARQUIVO'], ['evidenciaEventos', 'EVENTOS']] as const) {
      await exigirPendente({ ...entrada, [fonte]: { ...entrada[fonte], coberturaCompleta: false } }, 'COBERTURA_' + nome + '_NAO_COMPROVADA');
      await exigirPendente({ ...entrada, [fonte]: { ...entrada[fonte], apuracaoEncerrada: null } }, 'APURACAO_' + nome + '_NAO_ENCERRADA');
      await exigirPendente({ ...entrada, [fonte]: null }, 'VINCULO_EVIDENCIA_' + nome);
      for (const moeda of [null, 'EUR']) {
        await exigirPendente({ ...entrada, [fonte]: { ...entrada[fonte], moeda } }, 'MOEDA_' + nome + '_SEM_BRL');
      }
      for (const valor of [null, 'OUTRO', ' ']) {
        await exigirPendente({ ...entrada, [fonte]: { ...entrada[fonte], produto: valor } }, 'PRODUTO_INCOMPATIVEL');
      }
    }
  });

  it('recusa atestado vinculado a outro protocolo, competência, merchant ou janela de consulta', async () => {
    const entrada = await cenario();
    for (const outro of [{ requestId: 'outra-geracao' }, { merchantId: outraLoja }, { competencia: '2024-01' }]) {
      await exigirPendente({
        ...entrada, evidenciaArquivo: { ...entrada.evidenciaArquivo, protocolo: { ...entrada.arquivo.protocolo, ...outro } },
      }, 'VINCULO_EVIDENCIA_ARQUIVO');
    }
    for (const outro of [{ merchantId: outraLoja }, { inicio: '2024-02-02' }, { fim: '2024-02-28' }]) {
      await exigirPendente({
        ...entrada, evidenciaEventos: { ...entrada.evidenciaEventos, consulta: { ...consultaMensal, ...outro } },
      }, 'VINCULO_EVIDENCIA_EVENTOS');
    }
  });

  it('exige a mesma loja e a janela exata do mês civil bissexto mesmo com cobertura atestada', async () => {
    await exigirPendente(await cenario(undefined, undefined, { ...consultaMensal, merchantId: outraLoja }), 'LOJA_DIVERGENTE');
    for (const outraJanela of [
      { inicio: '2024-02-02' }, { fim: '2024-02-28' }, { fim: '2024-03-01' }, { inicio: '2024-01-31' },
    ]) {
      await exigirPendente(await cenario(undefined, undefined, { ...consultaMensal, ...outraJanela }), 'JANELA_EVENTOS_DIVERGENTE');
    }
  });

  it('confere escopo de toda ocorrência, inclusive informativa, sem recortar loja, produto ou competência', async () => {
    const informativo = { ...evento(), hasTransferImpact: false, creationDate: '2024-02-02' };
    for (const incorreto of [null, '2024-01']) {
      await exigirPendente(await cenario([[evento(), { ...informativo, competence: incorreto }]]), 'COMPETENCIA_EVENTO_INCOMPATIVEL');
    }
    for (const incorreto of [null, 'OUTRO']) {
      await exigirPendente(await cenario([[evento(), { ...informativo, product: incorreto }]]), 'PRODUTO_INCOMPATIVEL');
    }
    await exigirPendente(await cenario([[evento(), { ...informativo, receiver: { merchantId: outraLoja } }]]), 'RECEBEDOR_FORA_DA_LOJA');
  });

  it('distingue contagem parcial, impacto desconhecido em cada fonte e valor relevante desconhecido', async () => {
    const entrada = await cenario();
    await exigirPendente({ ...entrada, arquivo: { ...entrada.arquivo, totaisInformados: { linhas: 1 } } }, 'ARQUIVO_PARCIAL');
    await exigirPendente(await cenario(undefined, [lancamento('1.00', '')]), 'IMPACTO_ARQUIVO_DESCONHECIDO');
    await exigirPendente(await cenario([[{ ...evento(), hasTransferImpact: null }]]), 'IMPACTO_EVENTO_DESCONHECIDO');
    await exigirPendente(await cenario([[{ ...evento(), amount: null }]]), 'VALOR_EVENTO_DESCONHECIDO');
  });

  it('rejeita erro estrutural e resumo avulso; preserva erros do leitor de arquivo mesmo com apuração pendente', async () => {
    const entrada = await cenario();
    const pendente = { ...entrada, evidenciaEventos: { ...entrada.evidenciaEventos, apuracaoEncerrada: false } };
    await expect(compararConciliacaoEventosV3({
      // @ts-expect-error Estado estranho não é um dos estados indisponíveis que o GET projeta.
      ...pendente, acompanhamento: { ...entrada.acompanhamento, estado: 'OUTRO' },
    })).rejects.toThrow('Estado de acompanhamento');
    await expect(compararConciliacaoEventosV3({
      ...pendente, arquivo: { ...entrada.arquivo, bytes: Uint8Array.of(1, 2) },
    })).rejects.toThrow('Gzip');
    await expect(compararConciliacaoEventosV3({
      ...pendente, arquivo: { ...entrada.arquivo, totaisInformados: { linhas: 2, pedidos: 1 } },
    })).rejects.toMatchObject({ codigo: 'TOTAIS_DIVERGENTES' });
    await expect(compararConciliacaoEventosV3({
      ...pendente, arquivo: { ...entrada.arquivo, protocolo: { ...entrada.arquivo.protocolo, requestId: 'outro-protocolo' } },
    })).rejects.toMatchObject({ codigo: 'PROTOCOLO' });
    await expect(compararConciliacaoEventosV3({
      // @ts-expect-error A fronteira exige o arquivo, inclusive em execução sem tipos.
      ...pendente, arquivo: { integridade: 'VERIFICADA', linhas: 1, valorComImpactoCentavos: 100n },
    })).rejects.toThrow();
    await expect(compararConciliacaoEventosV3({
      ...pendente, eventos: { ...entrada.eventos, paginasLidas: 0 },
    })).rejects.toThrow('consulta de eventos');
    await expect(compararConciliacaoEventosV3({
      // @ts-expect-error Os valores do leitor de eventos são bigint ou null.
      ...pendente, eventos: { ...entrada.eventos, eventos: [{ ...entrada.eventos.eventos[0], valorCentavos: 100 }] },
    })).rejects.toThrow('Ocorrência');
    await expect(compararConciliacaoEventosV3({
      // @ts-expect-error Origem obrigatoriamente simulada antes de ler os bytes.
      ...entrada, origem: 'OUTRA', arquivo: { ...entrada.arquivo, bytes: new Uint8Array() },
    })).rejects.toThrow('Origem');
  });

  it('usa as entradas do instante da chamada mesmo quando o chamador as altera durante a descompactação', async () => {
    const entrada = await cenario();
    const resultado = compararConciliacaoEventosV3(entrada);
    entrada.arquivo.bytes.fill(0);
    entrada.arquivo.protocolo.competencia = '2024-03';
    entrada.arquivo.totaisInformados.linhas = 99;
    entrada.eventos.eventos.length = 0;
    entrada.evidenciaEventos.consulta.fim = '2024-02-10';
    entrada.evidenciaArquivo.moeda = 'EUR';
    expect(await resultado).toMatchObject({
      estado: 'COINCIDENTE', eventosComImpactoCentavos: 100n, arquivoComImpactoCentavos: 100n, diferencaCentavos: 0n,
    });
  });
});
