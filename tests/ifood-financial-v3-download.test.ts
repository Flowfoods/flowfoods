import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { prepararDownloadConciliacaoV3 } from '@/lib/integracoes/ifood/financial-v3-download';

const merchant = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const outroMerchant = 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb';
const competencia = '2026-07';
const requestId = 'geracao-privada-ficticia.A';
const identidade = { parceiro: 'parceiro-simulado', loja: 'loja-simulada', merchant, competencia, produto: 'IFOOD', moeda: 'BRL' as const };
const protocolo = { merchantId: merchant, competencia, requestId };
const cabecalho = '\uFEFFloja_id;competencia;pedido_associado_ifood;impacto_no_repasse;valor;descricao_lancamento';
const linha = [merchant, competencia, 'pedido-ficticio', 'SIM', '4.11', '"descrição; com ""aspas""\r\ne quebra"'].join(';');
const ajuste = [merchant, competencia, 'pedido-ficticio', 'SIM', '-0.01', 'ajuste'].join(';');
const csv = [cabecalho, linha, ajuste, ''].join('\r\n');

function entrada(texto = csv, totaisInformados = { linhas: 2, pedidos: 1 }) {
  const gzip = gzipSync(texto, { level: 1 });
  const armazenamento = new Uint8Array(gzip.length + 8).fill(99);
  armazenamento.set(gzip, 4);
  return {
    origem: 'SIMULACAO' as const, pedido: { identidade: { ...identidade }, protocolo: { ...protocolo } },
    acompanhamento: { estado: 'DISPONIVEL' as const, protocolo: { ...protocolo } },
    arquivo: { identidade: { ...identidade }, protocolo: { ...protocolo }, totaisInformados, bytes: armazenamento.subarray(4, -4) },
  };
}

describe('Download simulado da conciliação mensal Financial v3', () => {
  it('entrega a janela exata do gzip e o resumo do arquivo com nome determinístico', async () => {
    const cenario = entrada();
    cenario.pedido.identidade.merchant = merchant.toUpperCase();
    cenario.acompanhamento.protocolo.merchantId = merchant.toUpperCase();
    const download = await prepararDownloadConciliacaoV3(cenario);
    expect(download).toStrictEqual({
      nomeArquivo: `conciliacao-simulada-${merchant}-${competencia}.csv.gz`, tipoConteudo: 'application/gzip',
      bytes: cenario.arquivo.bytes,
      resumo: { integridade: 'VERIFICADA', linhas: 2, pedidosDistintos: 1, valorComImpactoCentavos: 410n },
    });
    expect(gunzipSync(download.bytes).toString('utf8')).toBe(csv);
    expect(download.bytes.buffer).not.toBe(cenario.arquivo.bytes.buffer);
    download.bytes.fill(0);
    expect(gunzipSync(cenario.arquivo.bytes).toString('utf8')).toBe(csv);
  });

  it('captura identidade, protocolo, contagens e bytes antes da descompactação assíncrona', async () => {
    const cenario = entrada();
    const esperado = Uint8Array.from(cenario.arquivo.bytes);
    const pendente = prepararDownloadConciliacaoV3(cenario);
    cenario.pedido.identidade.merchant = outroMerchant;
    cenario.pedido.identidade.competencia = '2026-08';
    cenario.pedido.protocolo.requestId = 'outra-geracao';
    cenario.acompanhamento.protocolo.competencia = '2026-08';
    cenario.arquivo.identidade.parceiro = 'outro-parceiro';
    cenario.arquivo.protocolo.merchantId = outroMerchant;
    cenario.arquivo.totaisInformados.linhas = 0;
    cenario.arquivo.bytes.fill(0);
    const download = await pendente;
    expect(download.nomeArquivo).toBe(`conciliacao-simulada-${merchant}-${competencia}.csv.gz`);
    expect(download.bytes).toStrictEqual(esperado);
    expect(download.resumo).toStrictEqual({ integridade: 'VERIFICADA', linhas: 2, pedidosDistintos: 1, valorComImpactoCentavos: 410n });
  });

  it('exige origem simulada e protocolo disponível', async () => {
    const cenario = entrada();
    // @ts-expect-error O motor também confere em tempo de execução a origem informada.
    await expect(prepararDownloadConciliacaoV3({ ...cenario, origem: 'PRODUCAO' })).rejects.toThrow('Origem incompatível');
    for (const estado of ['PROCESSANDO', 'SEM_LANCAMENTOS', 'PROTOCOLO_INDISPONIVEL'] as const) {
      await expect(prepararDownloadConciliacaoV3({ ...cenario, acompanhamento: { ...cenario.acompanhamento, estado } }))
        .rejects.toMatchObject({ codigo: 'INDISPONIVEL' });
    }
  });

  it('vincula parceiro, loja, merchant, competência, produto e moeda do pedido à evidência do arquivo', async () => {
    const cenario = entrada();
    for (const [campo, valor] of Object.entries({
      parceiro: 'outro-parceiro', loja: 'outra-loja', merchant: outroMerchant, competencia: '2026-08', produto: 'OUTRO', moeda: 'USD',
    })) {
      const identidadeDivergente = { ...identidade, [campo]: valor };
      await expect(prepararDownloadConciliacaoV3({ ...cenario, arquivo: { ...cenario.arquivo, identidade: identidadeDivergente } }))
        .rejects.toMatchObject({ codigo: 'ESCOPO' });
    }
    // Mesmo com ambas as identidades iguais, merchant e competência devem corresponder ao protocolo.
    for (const divergencia of [{ merchant: outroMerchant }, { competencia: '2026-08' }, { merchant: 'sem-uuid' }, { parceiro: '' }]) {
      const alterada = { ...identidade, ...divergencia };
      await expect(prepararDownloadConciliacaoV3({
        ...cenario, pedido: { ...cenario.pedido, identidade: alterada }, arquivo: { ...cenario.arquivo, identidade: alterada },
      })).rejects.toMatchObject({ codigo: 'ESCOPO' });
    }
  });

  it('vincula os três protocolos ao mesmo identificador opaco, merchant e competência', async () => {
    for (const fonte of ['pedido', 'acompanhamento', 'arquivo'] as const) {
      for (const [mudanca, codigo] of [
        [{ requestId: requestId.toLowerCase() }, 'PROTOCOLO'], [{ merchantId: outroMerchant }, 'ESCOPO'], [{ competencia: '2026-08' }, 'ESCOPO'],
      ] as const) {
        const cenario = entrada();
        Object.assign(cenario[fonte].protocolo, mudanca);
        await expect(prepararDownloadConciliacaoV3(cenario)).rejects.toMatchObject({ codigo });
      }
    }
    const cenario = entrada();
    for (const fonte of [cenario.pedido, cenario.acompanhamento, cenario.arquivo]) fonte.protocolo.requestId = '../invalido';
    await expect(prepararDownloadConciliacaoV3(cenario)).rejects.toMatchObject({ codigo: 'PROTOCOLO' });
  });

  it('confere as duas contagens externas, inclusive quando uma delas falta ou diverge', async () => {
    const cenario = entrada();
    for (const totaisInformados of [undefined, {}, { linhas: 2 }, { pedidos: 1 }, { linhas: null, pedidos: 1 }]) {
      await expect(prepararDownloadConciliacaoV3({ ...cenario, arquivo: { ...cenario.arquivo, totaisInformados } }))
        .rejects.toMatchObject({ codigo: 'TOTAIS' });
    }
    for (const totaisInformados of [{ linhas: 1, pedidos: 1 }, { linhas: 2, pedidos: 2 }]) {
      await expect(prepararDownloadConciliacaoV3({ ...cenario, arquivo: { ...cenario.arquivo, totaisInformados } }))
        .rejects.toMatchObject({ codigo: 'TOTAIS_DIVERGENTES' });
    }
  });

  it('recusa o download se a última linha estiver fora do escopo ou contiver valor incompatível', async () => {
    for (const [ultima, codigo] of [
      [ajuste.replace(merchant, outroMerchant), 'ESCOPO'], [ajuste.replace(competencia, '2026-08'), 'ESCOPO'],
      [ajuste.replace('-0.01', '-0.001'), 'SUBCENTAVO'], [ajuste + ';extra', 'REGISTRO'],
    ]) {
      await expect(prepararDownloadConciliacaoV3(entrada([cabecalho, linha, ultima].join('\r\n')))).rejects.toMatchObject({ codigo });
    }
  });

  it('permite baixar um mês parcial sem impacto informado e sem declaração de encerramento', async () => {
    const trecho = [cabecalho, linha.replace(';SIM;', ';;')].join('\r\n');
    const download = await prepararDownloadConciliacaoV3(entrada(trecho, { linhas: 1, pedidos: 1 }));
    expect(gunzipSync(download.bytes).toString('utf8')).toBe(trecho);
    expect(download.resumo).toStrictEqual({ integridade: 'VERIFICADA', linhas: 1, pedidosDistintos: 1, valorComImpactoCentavos: null });
  });

  it('entrega um gzip somente com cabeçalho quando as duas contagens em zero foram informadas', async () => {
    const download = await prepararDownloadConciliacaoV3(entrada(cabecalho, { linhas: 0, pedidos: 0 }));
    expect(gunzipSync(download.bytes).toString('utf8')).toBe(cabecalho);
    expect(download.resumo).toStrictEqual({ integridade: 'VERIFICADA', linhas: 0, pedidosDistintos: 0, valorComImpactoCentavos: null });
  });

  it('aplica os limites compactado e descompactado e recusa um gzip inválido', async () => {
    const cenario = entrada();
    const excessivo = new Uint8Array(2 * 1024 * 1024 + 1);
    excessivo.set([0x1f, 0x8b]);
    for (const bytes of [excessivo, gzipSync(Buffer.alloc(8 * 1024 * 1024 + 1, 65))]) {
      await expect(prepararDownloadConciliacaoV3({ ...cenario, arquivo: { ...cenario.arquivo, bytes } })).rejects.toThrow('Limite local');
    }
    for (const bytes of [new Uint8Array(), cenario.arquivo.bytes.subarray(0, -2)]) {
      await expect(prepararDownloadConciliacaoV3({ ...cenario, arquivo: { ...cenario.arquivo, bytes } })).rejects.toThrow('Gzip de conciliação inválido');
    }
  });
});
