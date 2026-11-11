import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { lerArquivoConciliacaoV3 } from '@/lib/integracoes/ifood/financial-v3-arquivo';
import { acompanharConciliacaoFinancialV3 } from '@/lib/integracoes/ifood/financial-v3-consultas';

const protocolo = {
  merchantId: 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa', competencia: '2026-07', requestId: 'geracao-A.1',
};
const acompanhamento = { estado: 'DISPONIVEL' as const, protocolo };
const cabecalho = 'loja_id;competencia;pedido_associado_ifood;impacto_no_repasse;valor';
const pedido = 'pedido-longo-ficticio-A';
const linha = (id = pedido, impacto = 'SIM', valor = '9.10') =>
  [protocolo.merchantId, protocolo.competencia, id, impacto, valor].join(';');
const arquivo = (csv: string, totaisInformados?: { linhas?: number | null; pedidos?: number | null }) =>
  ({ protocolo, bytes: gzipSync(csv), totaisInformados });
const ler = (csv: string, totais?: { linhas?: number | null; pedidos?: number | null }) =>
  lerArquivoConciliacaoV3(acompanhamento, arquivo(csv, totais));

describe('Arquivo de conciliação sintético ligado ao acompanhamento mensal', () => {
  it('projeta apenas o resumo, preserva sinal e precisão e conta lançamentos e pedidos em grãos diferentes', async () => {
    const resultadoDoGet = await acompanharConciliacaoFinancialV3(protocolo, async () => ({
      status: 200, cabecalhos: {}, corpo: JSON.stringify({
        status: 'processed', id: protocolo.requestId, downloadPath: 'https://example.invalid/ficticio.csv.gz',
      }),
    }), async () => {});
    const csv = [
      'descricao_lancamento;valor;impacto_no_repasse;pedido_associado_ifood;loja_id;competencia;pedido_associado_ifood_curto',
      ['"texto; privado\ncom ""aspas"""', '9007199254740993.09', 'SIM', pedido, protocolo.merchantId.toUpperCase(), '2026-07', '0027'].join(';'),
      ['taxa', '-0.21', 'SIM', pedido, protocolo.merchantId, '2026-07', '0027'].join(';'),
      ['informativo', '999.00', 'NAO', pedido.toLowerCase(), protocolo.merchantId, '2026-07', '0027'].join(';'),
      ['mensalidade', '-30.87', 'SIM', '', protocolo.merchantId, '2026-07', ''].join(';'),
    ].join('\r\n');
    expect(await lerArquivoConciliacaoV3(resultadoDoGet, arquivo(csv, { linhas: 4, pedidos: 2 }))).toStrictEqual({
      integridade: 'VERIFICADA', linhas: 4, pedidosDistintos: 2, valorComImpactoCentavos: 900719925474096201n,
    });
  });

  it('recusa antes de abrir os bytes quando o GET ou a identidade não autorizam a leitura', async () => {
    const inacessivel = { protocolo, bytes: new Uint8Array() };
    for (const estado of ['PROCESSANDO', 'SEM_LANCAMENTOS', 'PROTOCOLO_INDISPONIVEL'] as const) {
      await expect(lerArquivoConciliacaoV3({ estado, protocolo }, inacessivel)).rejects.toMatchObject({ codigo: 'INDISPONIVEL' });
    }
    for (const troca of [{ competencia: '2026-08' }, { merchantId: 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb' }]) {
      await expect(lerArquivoConciliacaoV3(acompanhamento, { ...inacessivel, protocolo: { ...protocolo, ...troca } }))
        .rejects.toMatchObject({ codigo: 'ESCOPO' });
    }
    await expect(lerArquivoConciliacaoV3(acompanhamento, {
      ...inacessivel, protocolo: { ...protocolo, requestId: protocolo.requestId.toLowerCase() },
    })).rejects.toMatchObject({ codigo: 'PROTOCOLO' });
    const invalido = { ...protocolo, requestId: '../outro' };
    await expect(lerArquivoConciliacaoV3({ ...acompanhamento, protocolo: invalido }, { ...inacessivel, protocolo: invalido }))
      .rejects.toMatchObject({ codigo: 'PROTOCOLO' });
  });

  it('exige ambos os totais externos para liberar a soma e confere cada um quando só um é conhecido', async () => {
    const csv = [cabecalho, linha(), linha()].join('\n');
    for (const totais of [undefined, {}, { linhas: null, pedidos: null }, { linhas: 2 }, { pedidos: 1 }]) {
      expect(await ler(csv, totais)).toStrictEqual({
        integridade: 'PARCIAL', linhas: 2, pedidosDistintos: 1, valorComImpactoCentavos: null,
      });
    }
    for (const totais of [{ linhas: 3 }, { pedidos: 2 }, { linhas: 2, pedidos: 0 }]) {
      await expect(ler(csv, totais)).rejects.toMatchObject({ codigo: 'TOTAIS_DIVERGENTES' });
    }
    for (const invalido of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '2']) {
      await expect(ler(csv, { linhas: invalido as number })).rejects.toMatchObject({ codigo: 'TOTAIS' });
    }
    for (const invalido of ['2', [], { totalLinhas: 2 }]) {
      await expect(ler(csv, invalido as { linhas: number })).rejects.toMatchObject({ codigo: 'TOTAIS' });
    }
  });

  it('distingue ausência de linhas, linha avulsa sem impacto e impacto desconhecido', async () => {
    expect(await ler(cabecalho, { linhas: 0, pedidos: 0 })).toStrictEqual({
      integridade: 'VERIFICADA', linhas: 0, pedidosDistintos: 0, valorComImpactoCentavos: null,
    });
    expect(await ler([cabecalho, linha('', 'NAO')].join('\n'), { linhas: 1, pedidos: 0 })).toStrictEqual({
      integridade: 'VERIFICADA', linhas: 1, pedidosDistintos: 0, valorComImpactoCentavos: 0n,
    });
    for (const lancamentos of [[linha(), linha('', '')], [linha('', ''), linha()]]) {
      expect(await ler([cabecalho, ...lancamentos].join('\n'), { linhas: 2, pedidos: 1 })).toStrictEqual({
        integridade: 'VERIFICADA', linhas: 2, pedidosDistintos: 1, valorComImpactoCentavos: null,
      });
    }
  });

  it('exige as colunas de domínio, títulos únicos e a largura do cabeçalho em cada registro', async () => {
    const colunas = cabecalho.split(';');
    for (const [indice] of colunas.entries()) {
      await expect(ler(colunas.filter((_, i) => i !== indice).join(';'))).rejects.toMatchObject({ codigo: 'CABECALHO' });
    }
    for (const fim of [';valor', ';extra;extra', ';', '; ']) {
      await expect(ler(cabecalho + fim)).rejects.toMatchObject({ codigo: 'CABECALHO' });
    }
    for (const curtaOuLonga of [linha().split(';').slice(0, -1).join(';'), linha() + ';extra']) {
      await expect(ler([cabecalho, linha(), curtaOuLonga].join('\n'))).rejects.toMatchObject({ codigo: 'REGISTRO' });
    }
  });

  it('verifica a competência e a loja em toda linha e recusa dados incompatíveis sem reproduzi-los no erro', async () => {
    const privado = 'informacao-ficticia-privada';
    for (const mudanca of [linha().replace(protocolo.competencia, '2026-08'), linha().replace(protocolo.merchantId, privado)]) {
      await expect(ler([cabecalho, linha(), mudanca].join('\n'))).rejects.toMatchObject({ codigo: 'ESCOPO' });
    }
    for (const malformada of [linha(pedido, privado), linha(' '), linha(' privado'), linha('"a\nb"'),
      linha(pedido, 'SIM', ''), linha(pedido, 'NAO', privado), linha(pedido, 'SIM', '1.001'), linha(pedido, 'SIM', '1,99')]) {
      const leitura = ler([cabecalho, linha(), malformada].join('\n'), { linhas: 2, pedidos: 1 });
      await expect(leitura).rejects.toThrow();
      await expect(leitura).rejects.not.toThrow(new RegExp(privado));
    }
  });
});
