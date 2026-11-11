import { describe, expect, it } from 'vitest';
import { ErroEventosV3, lerPaginaEventosV3 } from '@/lib/integracoes/ifood/financial-v3-eventos';

const pedido = { page: 1, size: 100 };
const pagina = (...eventos: unknown[]) => ({ ...pedido, hasNextPage: false, financialEvents: eventos });
const ler = (corpo: unknown) => lerPaginaEventosV3(JSON.stringify(corpo), pedido);

describe('leitura de uma página Financial Events v3', () => {
  it('normaliza o UUID da loja da consulta e recusa um escopo inválido', () => {
    const merchantId = 'abcdefab-1234-4234-8234-abcd01020304';
    const corpo = JSON.stringify(pagina({ receiver: { merchantId } }));
    const resultado = lerPaginaEventosV3(corpo, { ...pedido, merchantId: merchantId.toUpperCase() });
    expect(resultado.eventos[0].recebedorForaDaLoja).toBeUndefined();
    expect(() => lerPaginaEventosV3(corpo, { ...pedido, merchantId: 'invalido' }))
      .toThrow(expect.objectContaining({ codigo: 'PEDIDO_INVALIDO' }));
  });

  it('projeta só os campos financeiros necessários e mantém as ocorrências na ordem recebida', () => {
    const evento = {
      name: 'NOME_FUTURO', trigger: 'GATILHO_FUTURO', product: 'PRODUTO_NOVO', competence: '2024-02',
      period: { beginDate: '2024-02-01', endDate: '2024-02-29' }, hasTransferImpact: true,
      amount: { value: '-900719925474099312345.6700' }, description: 'texto descartado',
      receiver: { merchantId: 'RECEBEDOR_FICTICIO' }, reference: { id: 'REFERENCIA_FICTICIA' }, payment: { liability: 'futuro' },
    };
    const esperado = {
      nome: 'NOME_FUTURO', gatilho: 'GATILHO_FUTURO', produto: 'PRODUTO_NOVO', competencia: '2024-02',
      periodo: { inicio: '2024-02-01', fim: '2024-02-29' }, impactoNoRepasse: true, valorCentavos: -90071992547409931234567n,
    };
    expect(ler({ ...pagina(evento, evento), hasNextPage: true, metadataFutura: {} })).toEqual({
      formato: 'OBJETO', ...pedido, hasNextPage: true, eventos: [esperado, esperado],
    });
  });

  it('reconhece o array unitário do exemplo e conserva a diferença entre ausência, zero e sem impacto', () => {
    const lida = ler([pagina({}, { amount: { value: null }, hasTransferImpact: null, period: { beginDate: '2026-11-01' } },
      { amount: { value: '0' }, hasTransferImpact: false })]);
    expect(lida.formato).toBe('ARRAY_UNITARIO');
    expect(lida.hasNextPage).toBe(false);
    expect(lida.eventos[0]).toEqual({ nome: null, gatilho: null, produto: null, competencia: null, periodo: null, impactoNoRepasse: null, valorCentavos: null });
    expect(lida.eventos[1]).toMatchObject({ valorCentavos: null, impactoNoRepasse: null, periodo: { inicio: '2026-11-01', fim: null } });
    expect(lida.eventos[2]).toMatchObject({ valorCentavos: 0n, impactoNoRepasse: false });
  });

  it('uma página vazia conserva os metadados recebidos sem concluir competência', () => {
    expect(ler(pagina())).toEqual({ formato: 'OBJETO', ...pedido, hasNextPage: false, eventos: [] });
  });

  it('conserva a base em centavos e o percentual decimal declarado, inclusive zero e frações de ponto-base', () => {
    const evento = (name: string, billing: unknown) => ({ name, billing });
    const eventos = ler(pagina(
      evento('ORDER_COMMISSION', { baseValue: '9007199254740993.57', feePercentage: '12.0010', description: 'descartar' }),
      evento('PAYMENT_TRANSACTION_FEE', { baseValue: '0.00', feePercentage: '0' }),
      evento('TAXA_FUTURA', { feePercentage: '1.5' }),
      evento('ORDER_PAYMENT', { baseValue: '50.00' }),
    )).eventos;
    expect(eventos.map(e => e.cobranca)).toEqual([
      { baseCentavos: 900719925474099357n, percentual: '12.0010' }, { baseCentavos: 0n, percentual: '0' },
      { baseCentavos: null, percentual: '1.5' }, undefined,
    ]);
  });

  it.each([[null, null], ['1.001', '1e1'], ['1,00', 12], [1, '-2'], ['1'.repeat(81), '1'.repeat(81)]])(
    'mantém o repasse legível com dados de cobrança incompatíveis', (baseValue, feePercentage) => {
      const [evento] = ler(pagina({ name: 'ORDER_COMMISSION', amount: { value: '-2' }, billing: { baseValue, feePercentage } })).eventos;
      expect(evento).toMatchObject({ valorCentavos: -200n, cobranca: { baseCentavos: null, percentual: null } });
    },
  );

  it.each(['name', 'trigger', 'product'])('limita a retenção do campo %s sem truncar o texto recebido', campo => {
    const limite = 'A'.repeat(256);
    expect(Object.values(ler(pagina({ [campo]: limite })).eventos[0])).toContain(limite);
    expect(() => ler(pagina({ [campo]: limite + 'B' }))).toThrow(expect.objectContaining({ codigo: 'LIMITE_LOCAL' }));
  });

  it.each([null, [], [pagina(), pagina()], [[pagina()]], [3], { financialEvents: [] }, { ...pagina(), page: '1' },
    { ...pagina(), size: 0 }, { ...pagina(), hasNextPage: 'false' }, { ...pagina(), financialEvents: {} },
    { ...pagina(), page: 2 }, { ...pagina(), size: 99 }])('recusa envelope ausente, ambíguo ou divergente', corpo => {
    expect(() => ler(corpo)).toThrow(ErroEventosV3);
  });

  it.each(['1.000000000000000000001', '0.9999999999999999999999', '-1', '0', '9007199254740993', '1e999'])('valida o token inteiro de paginação antes de aceitar %s', paginaRaw => {
    const raw = `{"page":${paginaRaw},"size":100,"hasNextPage":false,"financialEvents":[]}`;
    expect(() => lerPaginaEventosV3(raw, pedido)).toThrow(ErroEventosV3);
  });

  it('aceita a escrita decimal ou exponencial de inteiros matematicamente exatos', () => {
    expect(lerPaginaEventosV3('{"page":0.1e1,"size":1.00e2,"hasNextPage":true,"financialEvents":[]}', pedido)).toMatchObject({ ...pedido, hasNextPage: true });
  });

  it.each([null, { page: 0, size: 100 }, { page: 1, size: 1.5 }, { page: Number.MAX_SAFE_INTEGER + 1, size: 100 }])('recusa pedido inválido', p => {
    expect(() => lerPaginaEventosV3(JSON.stringify(pagina()), p as typeof pedido)).toThrow(ErroEventosV3);
  });

  it.each([1, null, [], { amount: 0 }, { amount: { value: 1.23 } }, { amount: { value: '1.001' } },
    { amount: { value: '1,10' } }, { hasTransferImpact: 1 }, { product: true }, { trigger: {} },
    { name: [] }, { competence: '2026-13' }, { period: 4 }, { period: { beginDate: '2026-02-29' } },
    { period: { endDate: '2026-04-31' } }, { period: { beginDate: '2026-11-02', endDate: '2026-11-01' } }])('recusa tipos e datas incompatíveis em campos projetados', evento => {
    expect(() => ler(pagina(evento))).toThrow(ErroEventosV3);
  });

  it('não perde subcentavos ou o valor ausente transformando-os em zero', () => {
    expect(() => ler(pagina({ amount: { value: '0.001' } }))).toThrow(expect.objectContaining({ codigo: 'SUBCENTAVO' }));
    expect(ler(pagina({ amount: null }, { amount: {} })).eventos.map(e => e.valorCentavos)).toEqual([null, null]);
  });

  it('recusa itens acima do tamanho da página e impõe teto local antes de projetar ocorrências', () => {
    expect(() => lerPaginaEventosV3(JSON.stringify({ ...pagina({}, {}), size: 1 }), { page: 1, size: 1 })).toThrow(ErroEventosV3);
    const texto = JSON.stringify({ ...pagina(), size: 10_001, financialEvents: Array(10_001).fill({}) });
    expect(() => lerPaginaEventosV3(texto, { page: 1, size: 10_001 })).toThrow(expect.objectContaining({ codigo: 'LIMITE_LOCAL' }));
  });

  it('recusa corpo além do limite, chaves JSON repetidas e JSON inválido sem ecoar sua entrada', () => {
    const marcador = 'CONTEUDO_SINTETICO_NUNCA_EXIBIR';
    for (const raw of [JSON.stringify({ ...pagina(), extra: 'A'.repeat(2 * 1024 * 1024) }),
      `{"page":1,"size":100,"hasNextPage":false,"financialEvents":[{"name":"${marcador}","na\\u006de":null}]}`,
      `{"${marcador}":`, JSON.stringify(pagina({ period: { beginDate: marcador } }))]) {
      try { lerPaginaEventosV3(raw, pedido); expect.unreachable(); }
      catch (erro) {
        expect(erro).toBeInstanceOf(ErroEventosV3);
        expect(String(erro)).not.toContain(marcador);
      }
    }
  });
});
