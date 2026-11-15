import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  ErroPacoteFontesFinancial, LIMITE_ARQUIVO_FONTES_FINANCIAL, LIMITE_MANIFESTO_FONTES_FINANCIAL, prepararPacoteFontesFinancial,
  type EscopoFontesFinancial, type VigenciaFontesFinancial,
} from '@/lib/integracoes/ifood/financial-v3-pacote-fontes';
import { criarFontesFinancial } from './fixtures/ifood-financial-pacote';

type Fontes = ReturnType<typeof criarFontesFinancial>;
type Corpo = { page: number; size: number; hasNextPage: boolean; financialEvents: Record<string, unknown>[] };
const outroMerchant = '00000000-1234-4234-8234-abcdef123456';
const bytes = (objeto: unknown) => Buffer.from(JSON.stringify(objeto));
const hash = (entrada: Uint8Array | string) => createHash('sha256').update(entrada).digest('hex');
const preparar = (f: Fontes) => prepararPacoteFontesFinancial(f.escopo, f.arquivoGzip, bytes(f.manifesto));
const codigo = (esperado: ErroPacoteFontesFinancial['codigo']) => expect.objectContaining({ name: 'ErroPacoteFontesFinancial', codigo: esperado });

function substituirArquivo(f: Fontes, transformar: (csv: string) => string) {
  f.arquivoGzip = gzipSync(transformar(gunzipSync(f.arquivoGzip).toString('utf8')));
  f.manifesto.arquivo.sha256 = hash(f.arquivoGzip);
}

function alterarCorpo(f: Fontes, mudanca: (corpo: Corpo) => void) {
  const pagina = f.manifesto.eventos[0];
  const corpo: Corpo = JSON.parse(pagina.corpo);
  mudanca(corpo);
  pagina.corpo = JSON.stringify(corpo);
}

function comDuasPaginas() {
  const f = criarFontesFinancial();
  alterarCorpo(f, c => { c.hasNextPage = true; });
  const primeira = f.manifesto.eventos[0];
  const corpo = JSON.stringify({ ...JSON.parse(primeira.corpo), page: 2, hasNextPage: false });
  f.manifesto.eventos.push({ consulta: { ...primeira.consulta, page: 2 }, corpo });
  return f;
}

describe('recebimento manual das fontes Financial por loja e competência', () => {
  it('calcula SHA-256, contagens e faixas, mesmo com ocorrências de mesmo valor em páginas distintas', async () => {
    const f = comDuasPaginas();
    f.manifesto.arquivo.requestId = 'PROTOCOLO-FICTICIO-PRIVADO';
    alterarCorpo(f, c => {
      Object.assign(c.financialEvents[0], { description: 'PII-FICTICIO', reference: { url: 'https://exemplo.invalid/privado' } });
    });
    const envelope = bytes(f.manifesto);
    const recibo = await prepararPacoteFontesFinancial(f.escopo, f.arquivoGzip, envelope);
    expect(recibo).toEqual({
      versao: 1, escopo: f.escopo, produto: 'IFOOD',
      requestIdSha256: hash(f.manifesto.arquivo.requestId), manifestoSha256: hash(envelope), arquivoSha256: hash(f.arquivoGzip),
      eventosSha256: expect.stringMatching(/^[0-9a-f]{64}$/), pacoteSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      vigenciasSha256: expect.stringMatching(/^[0-9a-f]{64}$/), vigencias: f.manifesto.configuracao.vigencias,
      paginasEventos: 2, quantidadeEventos: 2, linhasArquivo: 2, pedidosDistintos: 1,
      somas: { arquivoCentavos: '8800', eventosCentavos: '-2400' },
    });
    expect(JSON.stringify(recibo)).not.toMatch(/PROTOCOLO-FICTICIO|pedido-sintetico|PII-FICTICIO|https:|ORDER_COMMISSION|100\.00/);
  });

  it('identifica o mesmo pacote após reenvio e formatação do envelope, conservando o hash dos bytes recebidos', async () => {
    const f = criarFontesFinancial();
    const a = await preparar(f);
    expect(await preparar(f)).toEqual(a);
    const envelope = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(f.manifesto).reverse()), null, 2));
    const b = await prepararPacoteFontesFinancial(f.escopo, f.arquivoGzip, envelope);
    expect(b).toEqual({ ...a, manifestoSha256: hash(envelope) });
    expect(a.manifestoSha256).not.toBe(b.manifestoSha256);
    f.manifesto.escopo.merchantId = f.escopo.merchantId.toUpperCase();
    expect((await preparar(f)).pacoteSha256).toBe(a.pacoteSha256);
    f.manifesto.arquivo.requestId += '-2';
    expect((await preparar(f)).pacoteSha256).not.toBe(a.pacoteSha256);
  });

  it('soma apenas impacto no repasse e conserva centavos superiores a int64', async () => {
    const f = criarFontesFinancial();
    substituirArquivo(f, csv => csv.replace('100.00;', '92233720368547758.09;').replace('-12.00;', '-0.01;'));
    alterarCorpo(f, c => {
      const original = c.financialEvents[0];
      c.financialEvents = [
        { ...original, amount: { value: '92233720368547758.08', currency: 'BRL' } },
        { ...original, hasTransferImpact: false },
      ];
    });
    expect((await preparar(f)).somas).toEqual({ arquivoCentavos: '9223372036854775808', eventosCentavos: '9223372036854775808' });
  });

  it('os bytes da página, do arquivo e os valores das vigências participam da impressão do conjunto', async () => {
    const f = criarFontesFinancial();
    const a = await preparar(f);
    f.manifesto.eventos[0].corpo += '\n';
    const b = await preparar(f);
    expect(b.eventosSha256).not.toBe(a.eventosSha256);
    expect(b.pacoteSha256).not.toBe(a.pacoteSha256);
    f.manifesto.configuracao.vigencias[0].pagamentoBp = 2;
    const c = await preparar(f);
    expect(c.vigenciasSha256).not.toBe(b.vigenciasSha256);
    expect(c.pacoteSha256).not.toBe(b.pacoteSha256);
    substituirArquivo(f, csv => csv.replace('100.00;', '111.00;'));
    const d = await preparar(f);
    expect(d.arquivoSha256).not.toBe(c.arquivoSha256);
    expect(d.pacoteSha256).not.toBe(c.pacoteSha256);
  });

  it.each<[keyof EscopoFontesFinancial, string]>([
    ['parceiroId', 'outro-parceiro'], ['lojaId', 'outra-loja'], ['conexaoId', 'outra-conexao'],
    ['merchantId', outroMerchant], ['competencia', '2024-03'], ['ambiente', 'PRODUCAO'],
  ])('vincula %s ao escopo esperado obtido pelo servidor', async (campo, outro) => {
    const f = criarFontesFinancial();
    const base = await preparar(f);
    const esperado = { ...f.escopo, [campo]: outro };
    await expect(prepararPacoteFontesFinancial(esperado, f.arquivoGzip, bytes(f.manifesto))).rejects.toThrow(codigo('ESCOPO'));
    const consistente = criarFontesFinancial(esperado.competencia, esperado);
    expect((await preparar(consistente)).pacoteSha256).not.toBe(base.pacoteSha256);
  });

  it('isola o escopo e as janelas de bytes usados no cálculo durante a leitura assíncrona', async () => {
    const f = criarFontesFinancial();
    const esperado = await preparar(f);
    const janela = Buffer.concat([Buffer.from('X'), f.arquivoGzip, Buffer.from('X')]).subarray(1, -1);
    const manifesto = bytes(f.manifesto);
    const leitura = prepararPacoteFontesFinancial(f.escopo, janela, manifesto);
    janela.fill(0);
    manifesto.fill(0);
    f.escopo.lojaId = 'alterada';
    expect(await leitura).toEqual(esperado);
  });

  it('aceita arquivo apenas com cabeçalho, página explicitamente vazia e duas taxas zero declaradas', async () => {
    const f = criarFontesFinancial();
    substituirArquivo(f, csv => csv.split('\n')[0]);
    Object.assign(f.manifesto.arquivo, { linhas: 0, pedidos: 0 });
    f.manifesto.configuracao.vigencias[0].comissaoBp = 0;
    alterarCorpo(f, c => { c.financialEvents = []; });
    expect(await preparar(f)).toMatchObject({ linhasArquivo: 0, pedidosDistintos: 0, paginasEventos: 1, quantidadeEventos: 0,
      somas: { arquivoCentavos: '0', eventosCentavos: '0' },
      vigencias: [{ inicio: '2024-02-01', fim: '2024-02-29', comissaoBp: 0, pagamentoBp: 0 }],
    });
    f.manifesto.eventos = [];
    await expect(preparar(f)).rejects.toThrow(codigo('EVENTOS'));
  });

  it.each([
    ['sha256', '0'.repeat(64), 'ARQUIVO'], ['linhas', 1, 'ARQUIVO'], ['pedidos', 2, 'ARQUIVO'],
    ['linhas', null, 'ARQUIVO'], ['pedidos', '1', 'ARQUIVO'], ['linhas', 100_001, 'ARQUIVO'], ['produto', '', 'ARQUIVO'],
    ['moeda', 'USD', 'ARQUIVO'], ['requestId', 'https://exemplo.invalid/privado', 'ARQUIVO'],
    ['merchantId', outroMerchant, 'ESCOPO'], ['competencia', '2023-02', 'ESCOPO'],
  ] as const)('recusa inconsistência no metadado %s do arquivo', async (campo, valor, erro) => {
    const f = criarFontesFinancial();
    Object.assign(f.manifesto.arquivo, { [campo]: valor });
    await expect(preparar(f)).rejects.toThrow(codigo(erro));
  });

  it.each([
    ['100.00;', '1.001;'], [';BRL;', ';USD;'], [';IFOOD', ';OUTRO'], [';SIM;', ';;'], [';2024-02;', ';2024-03;'],
    ['abcdefab-1234-4234-8234-abcdef123456;', outroMerchant + ';'],
  ])('confere as linhas reais mesmo quando o SHA-256 e as contagens foram recalculados (%s)', async (de, para) => {
    const f = criarFontesFinancial();
    substituirArquivo(f, csv => csv.replace(de, para));
    await expect(preparar(f)).rejects.toThrow(codigo('ARQUIVO'));
  });

  it('recusa gzip trocado por conteúdo diferente com os mesmos totais indicados', async () => {
    const f = criarFontesFinancial();
    const original = f.manifesto.arquivo.sha256;
    substituirArquivo(f, csv => csv.replace('100.00;', '200.00;'));
    f.manifesto.arquivo.sha256 = original;
    await expect(preparar(f)).rejects.toThrow(codigo('ARQUIVO'));
  });

  it('confere o produto financeiro declarado no CSV e nos eventos, mantendo o canal iFood', async () => {
    const f = criarFontesFinancial();
    f.manifesto.arquivo.produto = 'DELIVERY';
    await expect(preparar(f)).rejects.toThrow(codigo('EVENTOS'));
    alterarCorpo(f, c => { c.financialEvents[0].product = 'DELIVERY'; });
    await expect(preparar(f)).rejects.toThrow(codigo('ARQUIVO'));
    substituirArquivo(f, csv => csv.replaceAll(';IFOOD', ';DELIVERY'));
    expect(f.manifesto.configuracao.canal).toBe('IFOOD');
    expect(await preparar(f)).toMatchObject({ quantidadeEventos: 1, produto: 'DELIVERY' });
  });

  it.each<[(f: Fontes) => void]>([
    [f => { f.manifesto.eventos.pop(); }],
    [f => { f.manifesto.eventos.shift(); }],
    [f => { f.manifesto.eventos.push(f.manifesto.eventos[1]); }],
    [f => { f.manifesto.eventos.reverse(); }],
    [f => { f.manifesto.eventos[1].consulta.page = 1; }],
    [f => { f.manifesto.eventos[1].consulta.size = 20; }],
    [f => { f.manifesto.eventos[1].consulta.inicio = '2024-02-02'; }],
    [f => { f.manifesto.eventos[1].consulta.fim = '2024-02-28'; }],
    [f => { f.manifesto.eventos[1].consulta.merchantId = outroMerchant; }],
    [f => { f.manifesto.eventos[1].corpo = f.manifesto.eventos[0].corpo; }],
    [f => { alterarCorpo(f, c => { c.hasNextPage = false; }); }],
    [f => { alterarCorpo(f, c => { c.financialEvents = []; }); }],
    [f => { alterarCorpo(f, c => { c.financialEvents = Array(101).fill(c.financialEvents[0]); }); }],
    [f => { f.manifesto.eventos = Array(101).fill(f.manifesto.eventos[0]); }],
  ])('recusa grupos de páginas cortados, excedentes ou com consultas diferentes (%#)', async alterar => {
    const f = comDuasPaginas();
    alterar(f);
    await expect(preparar(f)).rejects.toThrow(codigo('EVENTOS'));
  });

  it.each([
    { product: 'OUTRO' }, { competence: '2024-03' }, { competence: null }, { receiver: { merchantId: outroMerchant } },
    { receiver: { merchantId: '' } }, { receiver: 'inválido' }, { hasTransferImpact: null }, { amount: { value: '1.001', currency: 'BRL' } },
    { amount: { value: '1', currency: 'USD' } }, { amount: { value: null } }, { amount: { value: '9'.repeat(81) } },
    { amount: { value: 0 } },
  ])('confere escopo, centavos e impacto nos eventos originais (%#)', async mudanca => {
    const f = criarFontesFinancial();
    alterarCorpo(f, c => { Object.assign(c.financialEvents[0], mudanca); });
    await expect(preparar(f)).rejects.toThrow(codigo('EVENTOS'));
  });

  it('aceita o array unitário da API e valores decimais preservados além da precisão de Number', async () => {
    const f = criarFontesFinancial();
    alterarCorpo(f, c => { c.financialEvents[0].amount = { value: '-9007199254740993.01' }; });
    f.manifesto.eventos[0].corpo = '[' + f.manifesto.eventos[0].corpo + ']';
    expect((await preparar(f)).quantidadeEventos).toBe(1);
  });

  it.each([{ merchantId: outroMerchant }, { beginDate: '2024-02-02' }, { endDate: null }, { currency: 'USD' }, { competence: '2024-03' }])(
    'confere os campos de escopo quando a resposta da página os devolve (%#)', async mudanca => {
      const f = criarFontesFinancial();
      alterarCorpo(f, c => { Object.assign(c, mudanca); });
      await expect(preparar(f)).rejects.toThrow(codigo('EVENTOS'));
    },
  );

  it.each([true, false])('atribui o evento sem recebedor à consulta declarada (eco de merchant no corpo: %s)', async eco => {
    const f = criarFontesFinancial();
    alterarCorpo(f, c => {
      delete c.financialEvents[0].receiver;
      if (eco) Object.assign(c, { merchantId: f.escopo.merchantId });
    });
    expect((await preparar(f)).quantidadeEventos).toBe(1);
    f.manifesto.eventos[0].consulta.merchantId = outroMerchant;
    await expect(preparar(f)).rejects.toThrow(codigo('EVENTOS'));
  });

  it('conserva os dois percentuais de cada intervalo inclusivo e as bordas reais de um contrato anterior/posterior ao mês', async () => {
    const f = criarFontesFinancial();
    const vigencias = [
      { inicio: '2024-01-20', fim: '2024-02-14', comissaoBp: 1200, pagamentoBp: 0 },
      { inicio: '2024-02-15', fim: '2024-03-18', comissaoBp: 0, pagamentoBp: 225 },
    ];
    f.manifesto.configuracao.vigencias = vigencias;
    expect((await preparar(f)).vigencias).toEqual(vigencias);
  });

  it.each([
    [], [{ inicio: '2024-02-02' }], [{ fim: '2024-02-28' }], [{ fim: '2024-02-30' }],
    [{ fim: '2024-02-14' }, { inicio: '2024-02-14' }], [{ fim: '2024-02-14' }, { inicio: '2024-02-16' }],
    [{ inicio: '2024-02-15' }, { fim: '2024-02-14' }], [{ fim: '2024-01-31' }, { inicio: '2024-02-01' }],
    [{ pagamentoBp: null }], [{ pagamentoBp: undefined }], [{ comissaoBp: -1 }], [{ comissaoBp: 9999, pagamentoBp: 1 }],
    [{ comissaoBp: 1.01 }], [{ comissaoBp: '0' }], Array(32).fill({}),
  ].map(faixas => [faixas] as const))('recusa falha de cobertura civil ou taxa sem declaração explícita válida (%#)', async faixas => {
    const f = criarFontesFinancial();
    const base = f.manifesto.configuracao.vigencias[0];
    f.manifesto.configuracao.vigencias = faixas.map(faixa => ({ ...base, ...faixa }) as VigenciaFontesFinancial);
    await expect(preparar(f)).rejects.toThrow(codigo('VIGENCIAS'));
  });

  it.each([['lojaId', 'outra-loja', 'ESCOPO'], ['parceiroId', 'parceiro-2', 'ESCOPO'],
    ['competencia', '2024-01', 'ESCOPO'], ['canal', 'SALAO', 'VIGENCIAS']] as const)(
    'confere %s na configuração', async (campo, valor, erro) => {
      const f = criarFontesFinancial();
      Object.assign(f.manifesto.configuracao, { [campo]: valor });
      await expect(preparar(f)).rejects.toThrow(codigo(erro));
    },
  );

  it('recusa chaves duplicadas e dados numéricos que Number arredondaria para inteiros', async () => {
    const f = criarFontesFinancial();
    const texto = JSON.stringify(f.manifesto);
    for (const [de, para, erro] of [
      ['"versao":1', '"versao":2,"versao":1', 'MANIFESTO'],
      ['"comissaoBp":1200', '"comissaoBp":1200.000000000000000001', 'VIGENCIAS'],
      ['"linhas":2', '"linhas":2.000000000000000001', 'ARQUIVO'],
      ['"page":1', '"page":1.000000000000000001', 'EVENTOS'],
    ] as const) {
      const alterado = texto.replace(de, para);
      expect(alterado).not.toBe(texto);
      await expect(prepararPacoteFontesFinancial(f.escopo, f.arquivoGzip, Buffer.from(alterado))).rejects.toThrow(codigo(erro));
    }
    f.manifesto.eventos[0].corpo = f.manifesto.eventos[0].corpo.replace('"page":1', '"page":2,"page":1');
    await expect(preparar(f)).rejects.toThrow(codigo('EVENTOS'));
  });

  it('aplica os limites de corpo, gzip e descompactação, decodifica UTF-8 estrito e devolve erros sem dados brutos', async () => {
    const f = criarFontesFinancial();
    const envelope = bytes(f.manifesto);
    await expect(prepararPacoteFontesFinancial(f.escopo, Buffer.alloc(LIMITE_ARQUIVO_FONTES_FINANCIAL + 1), envelope))
      .rejects.toThrow(codigo('LIMITE'));
    await expect(prepararPacoteFontesFinancial(f.escopo, f.arquivoGzip, Buffer.alloc(LIMITE_MANIFESTO_FONTES_FINANCIAL + 1)))
      .rejects.toThrow(codigo('LIMITE'));
    await expect(prepararPacoteFontesFinancial(f.escopo, f.arquivoGzip, Buffer.from([0xff, 0xfe]))).rejects.toThrow(codigo('MANIFESTO'));
    substituirArquivo(f, () => 'A'.repeat(8 * 1024 * 1024 + 1));
    await expect(preparar(f)).rejects.toThrow(codigo('ARQUIVO'));
    const marcador = 'PII-FICTICIO-PRIVADO';
    const erro: unknown = await prepararPacoteFontesFinancial(f.escopo, f.arquivoGzip, Buffer.from('{"' + marcador + '":')).catch(e => e);
    expect(erro).toBeInstanceOf(ErroPacoteFontesFinancial);
    expect(JSON.stringify(erro) + String(erro)).not.toContain(marcador);
  });
});
