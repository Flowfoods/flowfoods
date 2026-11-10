import { describe, expect, it } from 'vitest';
import { lerLiquidacoesV3 } from '@/lib/integracoes/ifood/financial-v3-liquidacoes';

const merchantId = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const outroMerchant = 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb';
const pedido = { merchantId, inicio: '2026-10-05', fim: '2026-10-11' };
const envelope = (campos: Record<string, unknown> = {}) => ({
  merchantId, beginDate: pedido.inicio, endDate: pedido.fim, balance: 175, settlements: [], ...campos,
});
const grupo = (itens: unknown[] = []) => ({
  startDateCalculation: '2026-09-28', endDateCalculation: '2026-10-04', closingItems: itens,
});
const ler = (campos: Record<string, unknown> = {}) => lerLiquidacoesV3(JSON.stringify(envelope(campos)), pedido);
const tituloVazio = { natureza: 'TITULO', tipo: null, produto: null, estado: null, pagamentoEm: null, valorCentavos: null };

describe('Financial v3 · resposta de liquidações', () => {
  it('conserva o saldo, a ordem e a natureza de títulos e grupos sem deduplicar ocorrências ou criar um total', () => {
    const direto = { id: 'id-repetido', type: 'REPASSE', amount: -2.05, status: 'EM_ANALISE', paymentDate: '2026-10-09' };
    const item = { id: 'id-repetido', type: 'OUTRO_TITULO', amount: 0, product: 'IFOOD' };
    const v = ler({ settlements: [direto, grupo([item, item]), direto, grupo()] });
    const esperado = { ...tituloVazio, tipo: 'REPASSE', valorCentavos: -205n, estado: 'EM_ANALISE', pagamentoEm: '2026-10-09' };
    const esperadoDoGrupo = { ...tituloVazio, tipo: 'OUTRO_TITULO', produto: 'IFOOD', valorCentavos: 0n };
    expect(v).toEqual({
      ...pedido, formato: 'OBJETO', saldoCentavos: 17500n, consolidacao: 'NAO_INFORMADA', quantidadeMerchantsConsolidados: null,
      lancamentos: [
        esperado,
        { natureza: 'GRUPO_APURACAO', inicioApuracao: '2026-09-28', fimApuracao: '2026-10-04', itens: [esperadoDoGrupo, esperadoDoGrupo] },
        esperado, { natureza: 'GRUPO_APURACAO', inicioApuracao: '2026-09-28', fimApuracao: '2026-10-04', itens: [] },
      ],
    });
  });

  it('aceita o envelope unitário do exemplo, inclusive com UUID equivalente em outra caixa', () => {
    const value = lerLiquidacoesV3(JSON.stringify([envelope({ merchantId: merchantId.toUpperCase() })]), pedido);
    expect(value).toMatchObject({ formato: 'ARRAY_UNITARIO', merchantId, saldoCentavos: 17500n, lancamentos: [] });
  });

  it('mantém precisão dos tokens de saldo e títulos antes de qualquer conversão para Number', () => {
    const json = JSON.stringify(envelope({ settlements: [{ amount: 123.45 }] }))
      .replace('"balance":175', '"balance":9007199254740993123456789.9100')
      .replace('"amount":123.45', '"amount":-9007199254740993123456789.820');
    const v = lerLiquidacoesV3(json, pedido);
    expect(v.saldoCentavos).toBe(900719925474099312345678991n);
    expect(v.lancamentos).toEqual([{ ...tituloVazio, valorCentavos: -900719925474099312345678982n }]);
  });

  it.each([
    ['1e2', 10000n], ['1E+002', 10000n], ['1e-2', 1n], ['100e-2', 100n], ['100e-4', 1n],
    ['-5.4e1', -5400n], ['1.000E-1', 10n], ['9.00719925474099301e15', 900719925474099301n],
    ['-0.0100e+000', -1n], ['0e-80', 0n], ['-0.0000E+80', 0n], ['1e79', 10n ** 81n],
  ] as const)('converte o literal exponencial exato %s no saldo e nos títulos', (literal, esperado) => {
    const json = JSON.stringify(envelope({ settlements: [{ amount: 123.45 }] }))
      .replace('"balance":175', '"balance":' + literal).replace('"amount":123.45', '"amount":' + literal);
    const valor = lerLiquidacoesV3(json, pedido);
    expect(valor.saldoCentavos).toBe(esperado);
    expect(valor.lancamentos).toEqual([{ ...tituloVazio, valorCentavos: esperado }]);
  });

  it('distingue valor ausente de zero e preserva rótulos fora dos exemplos do provedor', () => {
    const v = ler({ balance: 0, settlements: [
      { type: 'TIPO FUTURO' }, { status: 'SITUAÇÃO NOVA', amount: null }, { amount: 0 }, { id: 'omitido' },
    ] });
    expect(v.saldoCentavos).toBe(0n);
    expect(v.lancamentos).toEqual([
      { ...tituloVazio, tipo: 'TIPO FUTURO' }, { ...tituloVazio, estado: 'SITUAÇÃO NOVA' },
      { ...tituloVazio, valorCentavos: 0n }, tituloVazio,
    ]);
  });

  it('descarta dados bancários, títulos, transações e campos adicionais em todos os níveis', () => {
    const dados = { id: 'identificador-do-titulo', transactionId: 'identificador-da-transacao', accountDetails: { conta: 'conta-ficticia' }, documento: 'documento-ficticio' };
    const v = ler({ dados, consolidatedMerchants: [outroMerchant], settlements: [
      { ...dados, type: 'BOLETO' }, { ...grupo([{ ...dados, product: 'IFOOD' }]), detalheInterno: dados },
    ] });
    const saida = JSON.stringify(v, (_chave, valor) => typeof valor === 'bigint' ? valor.toString() : valor);
    for (const segredo of ['identificador-do-titulo', 'identificador-da-transacao', 'conta-ficticia', 'documento-ficticio', outroMerchant, 'accountDetails']) {
      expect(saida).not.toContain(segredo);
    }
    expect(v.lancamentos).toHaveLength(2);
  });

  it.each([
    [undefined, 'NAO_INFORMADA', null], [[], 'LISTA_VAZIA', 0],
    [[merchantId.toUpperCase(), merchantId], 'SOMENTE_CONSULTADO', 1],
    [[outroMerchant], 'OUTROS_MERCHANTS', 1], [[merchantId, outroMerchant], 'OUTROS_MERCHANTS', 2],
  ] as const)('projeta a referência de consolidação sem expor a lista (%j)', (lista, status, quantidade) => {
    expect(ler({ consolidatedMerchants: lista })).toMatchObject({ consolidacao: status, quantidadeMerchantsConsolidados: quantidade });
  });

  it('recusa arrays vazios ou múltiplos sem selecionar o primeiro merchant', () => {
    for (const raiz of [[], [envelope(), envelope()], [envelope(), envelope({ merchantId: outroMerchant })]]) {
      expect(() => lerLiquidacoesV3(JSON.stringify(raiz), pedido)).toThrow(expect.objectContaining({ codigo: 'ENVELOPE_AMBIGUO' }));
    }
  });
  it.each([
    [{ merchantId: outroMerchant }, 'MERCHANT_DIVERGENTE'], [{ merchantId: 'não-é-uuid' }, 'ESTRUTURA'],
    [{ merchantId: null }, 'ESTRUTURA'], [{ beginDate: '2026-10-04' }, 'PERIODO_DIVERGENTE'],
    [{ endDate: '2026-10-12' }, 'PERIODO_DIVERGENTE'], [{ beginDate: '2026-02-30' }, 'ESTRUTURA'],
    [{ endDate: '2026-10-11T00:00:00Z' }, 'ESTRUTURA'], [{ balance: null }, 'VALOR_MONETARIO'],
    [{ balance: undefined }, 'VALOR_MONETARIO'], [{ balance: '12.00' }, 'VALOR_MONETARIO'],
    [{ consolidatedMerchants: null }, 'ESTRUTURA'], [{ consolidatedMerchants: [''] }, 'ESTRUTURA'],
    [{ consolidatedMerchants: [13] }, 'ESTRUTURA'], [{ settlements: null }, 'ESTRUTURA'],
  ] as const)('recusa campos incompatíveis no envelope (%#)', (campos, codigo) => {
    expect(() => ler(campos)).toThrow(expect.objectContaining({ codigo }));
  });

  it.each([
    [null], [53], [[]], [{}], [{ campoNovo: 1 }], [{ status: 1 }],
    [{ type: {} }], [{ paymentDate: '2025-02-29' }], [{ paymentDate: '2026-10-05T15:00:00Z' }],
    [{ ...grupo(), amount: 0 }], [{ ...grupo(), product: 'IFOOD' }], [{ ...grupo(), accountDetails: {} }],
    [{ closingItems: null }], [{ startDateCalculation: '2026-10-01' }], [grupo([grupo()])],
    [{ ...grupo(), startDateCalculation: '2026-10-10' }], [{ ...grupo(), endDateCalculation: '2026-02-29' }],
  ])('recusa título, grupo ou formato híbrido ambíguo (%#)', item => {
    expect(() => ler({ settlements: [item] })).toThrow(expect.objectContaining({ codigo: 'ESTRUTURA' }));
  });

  it.each([
    ['1.001', 'SUBCENTAVO'], ['9007199254740993.0000000000000000001', 'SUBCENTAVO'],
    ['1.00E-4', 'SUBCENTAVO'], ['1e-80', 'SUBCENTAVO'], ['-1234500e-5', 'SUBCENTAVO'],
    ['9007199254740993001e-3', 'SUBCENTAVO'], ['1e50000', 'LIMITE_LOCAL'], ['1e-50000', 'LIMITE_LOCAL'],
    ['0e50000', 'LIMITE_LOCAL'], ['1e80', 'LIMITE_LOCAL'], ['1e' + '0'.repeat(78) + '1', 'LIMITE_LOCAL'],
    ['"1.00"', 'VALOR_MONETARIO'], ['true', 'VALOR_MONETARIO'], ['{"literal":"3.20"}', 'VALOR_MONETARIO'],
    ['9'.repeat(81), 'LIMITE_LOCAL'],
  ])('recusa literal monetário incompatível no saldo e nos títulos (%s)', (literal, codigo) => {
    const json = JSON.stringify(envelope({ settlements: [{ amount: 123.45 }] }));
    for (const corpo of [json.replace('"balance":175', '"balance":' + literal), json.replace('"amount":123.45', '"amount":' + literal)]) {
      expect(() => lerLiquidacoesV3(corpo, pedido)).toThrow(expect.objectContaining({ codigo }));
    }
  });

  it('exige pedido de merchant e intervalo válidos', () => {
    for (const invalido of [{ ...pedido, merchantId: '' }, { ...pedido, inicio: '0000-01-01' }, { ...pedido, fim: '2026-10-04' }]) {
      expect(() => lerLiquidacoesV3(JSON.stringify(envelope()), invalido)).toThrow(expect.objectContaining({ codigo: 'PEDIDO' }));
    }
  });
  it('mantém mensagens fixas quando um campo ou o próprio JSON é inválido', () => {
    const comDado = JSON.stringify(envelope({ settlements: [{ paymentDate: 'dado-pessoal-sintetico-privado' }] }));
    for (const corpo of [comDado, comDado + 'dado-pessoal-sintetico-privado', comDado.replace('"balance":175', '"balance":175,"balance":0')]) {
      let erro: unknown;
      try { lerLiquidacoesV3(corpo, pedido); } catch (e) { erro = e; }
      expect(erro).toBeInstanceOf(Error);
      expect(String(erro)).not.toContain('dado-pessoal-sintetico-privado');
    }
  });
  it('limita a soma de itens diretos e aninhados e a lista de consolidação', () => {
    expect(() => ler({ settlements: [grupo(Array.from({ length: 10_000 }, () => ({ amount: 0 })))] })).toThrow(expect.objectContaining({ codigo: 'LIMITE_LOCAL' }));
    expect(() => ler({ consolidatedMerchants: Array(10_001).fill(merchantId) })).toThrow(expect.objectContaining({ codigo: 'LIMITE_LOCAL' }));
  });
});
