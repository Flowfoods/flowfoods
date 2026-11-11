import { describe, expect, it } from 'vitest';
import { ErroAntecipacoesV3, lerAntecipacoesV3 } from '@/lib/integracoes/ifood/financial-v3-antecipacoes';

const merchantId = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const pedido = { merchantId, inicio: '2026-10-05', fim: '2026-10-11' };
const envelope = (campos: Record<string, unknown> = {}) => ({
  merchantId, beginDate: pedido.inicio, endDate: pedido.fim, balance: 800, settlements: [], ...campos,
});
const ler = (campos: Record<string, unknown>) => lerAntecipacoesV3(JSON.stringify(envelope(campos)), pedido);
const comItem = (campos: Record<string, unknown>) => ler({ settlements: [{ closingItems: [campos] }] });
const semValores = {
  tipo: null, estado: null, pagamentoOriginalEm: null, pagamentoAntecipadoEm: null,
  valorOriginalCentavos: null, valorAntecipadoCentavos: null, taxaCentavos: null, taxaPercentual: null,
};

describe('Antecipações Financial v3', () => {
  it('mantém cada valor e percentual declarados e preserva grupos, ordem e títulos repetidos', () => {
    const titulo = {
      id: 'referencia-repetida', type: 'TIPO_FUTURO', status: 'SUCCEED',
      originalPaymentDate: '2026-11-02', anticipatedPaymentDate: '2026-10-09',
      originalPaymentAmount: 100, anticipatedPaymentAmount: 96, feeAmount: 0.10, feePercentage: 0.125,
    };
    const grupo = { startDateCalculation: '2026-09-28', endDateCalculation: '2026-10-04', closingItems: [titulo, titulo] };
    const esperado = {
      tipo: 'TIPO_FUTURO', estado: 'SUCCEED',
      pagamentoOriginalEm: '2026-11-02', pagamentoAntecipadoEm: '2026-10-09',
      valorOriginalCentavos: 10000n, valorAntecipadoCentavos: 9600n, taxaCentavos: 10n, taxaPercentual: '0.125',
    };
    const v = ler({ settlements: [grupo, { closingItems: [{ status: 'FAILED' }] }, grupo] });
    const grupoLido = { inicioApuracao: '2026-09-28', fimApuracao: '2026-10-04', itens: [esperado, esperado] };
    expect(v).toEqual({
      ...pedido, formato: 'OBJETO', saldoCentavos: 80000n, cobertura: 'NAO_COMPROVADA',
      grupos: [grupoLido, { inicioApuracao: null, fimApuracao: null, itens: [{ ...semValores, estado: 'FAILED' }] }, grupoLido],
    });
  });

  it('lê o exemplo em lista unitária, com as mesmas regras de escopo e um período vazio explícito', () => {
    expect(lerAntecipacoesV3(JSON.stringify([envelope({ merchantId: merchantId.toUpperCase(), balance: 0 })]), pedido)).toEqual({
      ...pedido, formato: 'ARRAY_UNITARIO', saldoCentavos: 0n, cobertura: 'NAO_COMPROVADA', grupos: [],
    });
  });

  it('preserva limites parciais do grupo, itens não informados, lista vazia e campos nulos ou zero', () => {
    const r = ler({ settlements: [
      {}, { startDateCalculation: '2026-10-01', closingItems: null }, { endDateCalculation: '2026-10-14', closingItems: [] },
      { closingItems: [{}, { originalPaymentAmount: 0, anticipatedPaymentAmount: 0, feeAmount: 0, feePercentage: 0 }] },
    ] });
    expect(r.grupos).toEqual([
      { inicioApuracao: null, fimApuracao: null, itens: null },
      { inicioApuracao: '2026-10-01', fimApuracao: null, itens: null },
      { inicioApuracao: null, fimApuracao: '2026-10-14', itens: [] },
      { inicioApuracao: null, fimApuracao: null, itens: [
        semValores, { ...semValores, valorOriginalCentavos: 0n, valorAntecipadoCentavos: 0n, taxaCentavos: 0n, taxaPercentual: '0' },
      ] },
    ]);
  });

  it('preserva dinheiro numérico grande e exponencial exatamente em centavos', () => {
    const bruto = JSON.stringify(envelope({ balance: 17, settlements: [{ closingItems: [
      { originalPaymentAmount: 31, anticipatedPaymentAmount: 41, feeAmount: 51 },
    ] }] })).replace('"balance":17', '"balance":900719925474099312345.67')
      .replace('"originalPaymentAmount":31', '"originalPaymentAmount":9.0071992547409931234e17')
      .replace('"anticipatedPaymentAmount":41', '"anticipatedPaymentAmount":-9007199254740993123.09')
      .replace('"feeAmount":51', '"feeAmount":1e-2');
    const r = lerAntecipacoesV3(bruto, pedido);
    expect(r.saldoCentavos).toBe(90071992547409931234567n);
    expect(r.grupos[0].itens).toEqual([{
      ...semValores, valorOriginalCentavos: 90071992547409931234n,
      valorAntecipadoCentavos: -900719925474099312309n, taxaCentavos: 1n,
    }]);
  });

  it.each(['0.000123456789012345678900', '9.00719925474099312345678e+16', '0.1250', '0e-30', '-0.0000001'])(
    'conserva o token do percentual %s com a precisão do provedor', token => {
      const bruto = JSON.stringify(envelope({ settlements: [{ closingItems: [{ feePercentage: 7 }] }] }))
        .replace('"feePercentage":7', '"feePercentage":' + token);
      expect(lerAntecipacoesV3(bruto, pedido).grupos[0].itens).toEqual([{ ...semValores, taxaPercentual: token }]);
    },
  );

  it('projeta somente campos de antecipação e omite dados bancários, identificadores e base não documentada', () => {
    const privados = {
      accountDetails: { accountNumber: 'conta-sintetica' }, transactionId: 'transacao-sintetica',
      merchantDocument: 'documento-sintetico', id: 'id-sintetico', feeBase: 12345,
    };
    const r = ler({ ...privados, settlements: [{ ...privados, closingItems: [{ ...privados, type: 'ANTECIPACAO' }] }] });
    expect(r.grupos).toEqual([{ inicioApuracao: null, fimApuracao: null, itens: [{ ...semValores, tipo: 'ANTECIPACAO' }] }]);
    expect(Object.keys(r).sort()).toEqual(['merchantId', 'inicio', 'fim', 'saldoCentavos', 'formato', 'grupos', 'cobertura'].sort());
  });

  it.each([
    [{ merchantId: 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb' }, 'MERCHANT_DIVERGENTE'],
    [{ beginDate: '2026-10-01' }, 'PERIODO_DIVERGENTE'], [{ endDate: '2026-13-01' }, 'ESTRUTURA'],
    [{ balance: null }, 'VALOR_MONETARIO'], [{ balance: '0' }, 'VALOR_MONETARIO'],
    [{ settlements: null }, 'ESTRUTURA'], [{ settlements: {} }, 'ESTRUTURA'], [{ settlements: undefined }, 'ESTRUTURA'],
  ] as const)('exige saldo, escopo e coleção documentados no envelope (%#)', (campos, codigo) => {
    expect(() => ler(campos)).toThrow(expect.objectContaining({ name: 'ErroAntecipacoesV3', codigo }));
  });
  it('recusa pedido incompatível ou resposta sem envelope inequívoco', () => {
    for (const p of [{ ...pedido, inicio: '2026-02-30' }, { ...pedido, fim: pedido.inicio, inicio: pedido.fim }, { ...pedido, merchantId: 'inválido' }]) {
      expect(() => lerAntecipacoesV3(JSON.stringify(envelope()), p)).toThrow(expect.objectContaining({ codigo: 'PEDIDO' }));
    }
    for (const r of [[], [envelope(), envelope()]]) {
      expect(() => lerAntecipacoesV3(JSON.stringify(r), pedido)).toThrow(expect.objectContaining({ codigo: 'ENVELOPE_AMBIGUO' }));
    }
  });

  it.each([
    [{ feePercentage: '0.125' }, 'PERCENTUAL_INVALIDO'], [{ feePercentage: { literal: '0.125' } }, 'PERCENTUAL_INVALIDO'],
    [{ feeAmount: '0.10' }, 'VALOR_MONETARIO'], [{ originalPaymentAmount: 1.001 }, 'SUBCENTAVO'],
    [{ anticipatedPaymentAmount: false }, 'VALOR_MONETARIO'], [{ feeAmount: { literal: '0.01' } }, 'VALOR_MONETARIO'],
    [{ originalPaymentDate: '2025-02-29' }, 'ESTRUTURA'], [{ anticipatedPaymentDate: '2026-10-01T00:00:00Z' }, 'ESTRUTURA'],
    [{ type: 0 }, 'ESTRUTURA'], [{ status: true }, 'ESTRUTURA'], [{ closingItems: [] }, 'ESTRUTURA'],
  ] as const)('recusa os campos inválidos do título com erro sanitizado (%#)', (campos, codigo) => {
    expect(() => comItem(campos)).toThrow(expect.objectContaining({ name: 'ErroAntecipacoesV3', codigo }));
  });
  it('recusa títulos diretos ou híbridos e grupos inconsistentes', () => {
    for (const g of [null, [], 1, { feePercentage: 0.125 }, { closingItems: [], status: 'FAILED' },
      { startDateCalculation: '2026-10-20', endDateCalculation: '2026-10-19' }, { closingItems: 3 },
      { closingItems: [null] }, { closingItems: [false] }]) {
      expect(() => ler({ settlements: [g] })).toThrow(ErroAntecipacoesV3);
    }
  });

  it('limita itens e representações numéricas extensas antes de calcular ou reter resultados', () => {
    expect(() => ler({ settlements: [{ closingItems: Array.from({ length: 10_000 }, () => ({})) }] }))
      .toThrow(expect.objectContaining({ codigo: 'LIMITE_LOCAL' }));
    const longo = JSON.stringify(envelope({ settlements: [{ closingItems: [{ feePercentage: 7 }] }] }))
      .replace('"feePercentage":7', '"feePercentage":0.' + '1'.repeat(80));
    expect(() => lerAntecipacoesV3(longo, pedido)).toThrow(expect.objectContaining({ codigo: 'LIMITE_LOCAL' }));
  });
  it('recusa chaves duplicadas e JSON inválido sem devolver dados do corpo', () => {
    const original = JSON.stringify(envelope({ settlements: [{ closingItems: [{ feeAmount: 1, document: 'dado-privado-sintetico' }] }] }));
    for (const corpo of [original.replace('"feeAmount":1', '"feeAmount":1,"feeAmount":2'), original + 'dado-privado-sintetico']) {
      let falha: unknown;
      try { lerAntecipacoesV3(corpo, pedido); } catch (e) { falha = e; }
      expect(falha).toBeInstanceOf(Error);
      expect(String(falha)).not.toContain('dado-privado-sintetico');
    }
  });
});
