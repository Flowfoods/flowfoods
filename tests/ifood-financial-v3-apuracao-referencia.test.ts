import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResultadoApuracaoReferencia } from '@/components/erp/telas/integracoes/resultado-apuracao-referencia';
import { apurarReferenciaFinancial, ErroApuracaoReferencia } from '@/lib/integracoes/ifood/financial-v3-apuracao-referencia';
import { consultarEventosFinancialV3 } from '@/lib/integracoes/ifood/financial-v3-consultas';

const periodo = { competencia: '2024-05', inicio: '2024-05-06', fim: '2024-05-12' };
const loja = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa', outra = 'bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb';
const privado = 'referencia-sintetica-descartada';
const cabecalho = 'loja_id;competencia;data_apuracao_inicio;data_apuracao_fim;valor;impacto_no_repasse;descricao;moeda';
const linha = (valor = '15.30', impacto = 'SIM', observacao = privado, inicio = '06/05/2024', fim = '12/05/2024') =>
  [loja, periodo.competencia, inicio, fim, valor, impacto, observacao, 'BRL'].join(';');
const csv = (...linhas: string[]) => gzipSync([cabecalho, ...linhas].join('\r\n'));
const evento = (value: unknown = 15.3, hasTransferImpact = true, id = 'ocorrencia-a') => ({
  id, amount: { value, currency: 'BRL' }, hasTransferImpact, competence: periodo.competencia,
  receiver: { merchantId: loja }, period: { beginDate: periodo.inicio, endDate: periodo.fim }, reference: { id: privado },
});
const pagina = (financialEvents: unknown[], page = 1, hasNextPage = false, size = 100) =>
  Buffer.from(JSON.stringify({ page, size, hasNextPage, financialEvents }));
const titulo = { id: 'titulo-a', type: 'REPASSE', status: 'SCHEDULED', paymentDate: '2024-05-20', amount: 15.3, accountDetails: { account: privado } };
const grupo = { startDateCalculation: periodo.inicio, endDateCalculation: periodo.fim, closingItems: [titulo] };
const liquidacao = (campos: Record<string, unknown> = {}) => Buffer.from(JSON.stringify({
  merchantId: loja, beginDate: periodo.inicio, endDate: periodo.fim, balance: 15.3, settlements: [grupo], ...campos,
}));
const arquivos = () => ({ conciliacao: csv(linha()), eventos: [pagina([evento()])], liquidacao: liquidacao() });
const apurar = (op: Partial<ReturnType<typeof arquivos>> = {}) => apurarReferenciaFinancial(periodo, { ...arquivos(), ...op });

describe('apuração de referência do aplicativo de homologação', () => {
  it('recorta o CSV mensal pela apuração, preserva ocorrências distintas e confere débitos, créditos e sem impacto', async () => {
    const restante = linha('6.35', 'SIM', 'outra-apuracao', '2024-05-13', '2024-05-19');
    const conciliacao = csv(linha(), linha('15.30', 'SIM', '"campo;entre aspas"'), linha('-3.70'), linha('2.75', 'NAO'), restante);
    const p1 = pagina([evento(), evento('15.30', true, 'ocorrencia-b')], 1, true, 2);
    const p2 = pagina([evento(-3.70, true, 'ocorrencia-c'), evento(2.75, false, 'ocorrencia-d')], 2, false, 2);
    const resultado = await apurar({ conciliacao, eventos: [p2, p1], liquidacao: liquidacao({ balance: 26.9 }) });
    expect(resultado).toMatchObject({ mesmaComposicao: true, saldosIguais: true, arquivo: { linhas: 5, naApuracao: 4, comImpacto: 3,
      outrosComImpacto: 1, outrosCentavos: '635', totais: { creditos: 2, debitos: 1, semImpacto: 1,
        creditosCentavos: '3060', debitosCentavos: '-370', semImpactoCentavos: '275' } },
      eventos: { naApuracao: 4, comImpacto: 3 }, somas: { arquivoCentavos: '2690', eventosCentavos: '2690', liquidacaoCentavos: '2690' } });
    expect(resultado.arquivo.sha256).toBe(createHash('sha256').update(conciliacao).digest('hex'));
    expect(resultado.eventos.paginasSha256).toEqual([p1, p2].map(v => createHash('sha256').update(v).digest('hex')));
    expect(resultado.liquidacao).toMatchObject({ titulos: 1, grupos: [{ tipo: 'REPASSE', estado: 'SCHEDULED', data: '2024-05-20', quantidade: 1, centavos: '1530' }] });
    const html = renderToStaticMarkup(ResultadoApuracaoReferencia({ apuracao: resultado }));
    for (const texto of ['Valores conferem', 'R$ 26,90', '−R$ 3,70', 'SCHEDULED', '20/05/2024', 'Conferência parcial do mês']) expect(html).toContain(texto);
    for (const descartado of [loja, privado, 'ocorrencia-a', 'titulo-a']) expect(JSON.stringify(resultado) + html).not.toContain(descartado);
  });

  it('separa igualdade de saldos de compensações e diferenças de multiplicidade ou de impacto', async () => {
    const conciliacao = csv(linha('10.00'), linha('5.30'), linha('0.00', 'NAO'));
    const resultado = await apurar({ conciliacao });
    expect(resultado).toMatchObject({ mesmaComposicao: false, saldosIguais: true });
    const html = renderToStaticMarkup(ResultadoApuracaoReferencia({ apuracao: resultado }));
    expect(html).toContain('Divergência');
    expect(html).not.toContain('Valores conferem');
    expect(await apurar({ liquidacao: liquidacao({ balance: 15.29 }) })).toMatchObject({ saldosIguais: false, mesmaComposicao: true });
    const zero = evento(0, false, 'zerado');
    expect(await apurar({ eventos: [pagina([evento(), zero])] })).toMatchObject({ saldosIguais: true, mesmaComposicao: false });
  });

  it.each([
    { conciliacao: csv() }, { eventos: [] }, { eventos: [pagina([])] }, { liquidacao: liquidacao({ balance: null }) },
    { conciliacao: csv(linha(), linha()) }, { eventos: [pagina([evento(), { ...evento(), descricao: 'texto diferente' }])] },
    { liquidacao: liquidacao({ settlements: [titulo, grupo] }) }, { eventos: [pagina([evento()], 2)] },
    { liquidacao: liquidacao({ settlements: [{ ...titulo, id: loja }, { ...titulo, id: loja.toUpperCase(), status: 'SUCCEED' }] }) },
    { eventos: [pagina([{ ...evento(), id: 45 }])] },
    { eventos: [pagina([evento()], 1, true)] }, { eventos: [pagina([evento()]), pagina([evento(3, false, 'ocorrencia-b')])] },
    { eventos: [pagina([{ ...evento(), receiver: {} }])] }, { eventos: [pagina([{ ...evento(), receiver: { merchantId: outra } }])] },
    { eventos: [pagina([{ ...evento(), merchantId: outra }])] }, { eventos: [pagina([{ ...evento(), currency: 'EUR' }])] },
    { conciliacao: csv(linha().replace(loja, outra)) }, { liquidacao: liquidacao({ merchantId: outra }) },
    { liquidacao: liquidacao({ settlements: [{ ...titulo, merchantId: outra }] }) }, { liquidacao: liquidacao({ currency: 'USD' }) },
    { liquidacao: liquidacao({ settlements: [{ ...grupo, currency: 'USD' }] }) },
    { liquidacao: liquidacao({ consolidatedMerchants: [loja, outra] }) }, { liquidacao: liquidacao({ endDate: '2024-05-13' }) },
    { liquidacao: liquidacao({ settlements: [{ ...grupo, startDateCalculation: '2024-05-01' }] }) },
    { eventos: [pagina([{ ...evento(), competence: '2024-04' }])] }, { eventos: [pagina([{ ...evento(), period: {} }])] },
    { eventos: [pagina([evento(15.301)])] }, { eventos: [pagina([evento(null)])] },
    { conciliacao: csv(linha('1.001')) }, { conciliacao: csv(linha('1,200')) }, { conciliacao: csv(linha().replace('SIM', '')) },
  ])('recusa fontes incompletas, ambíguas ou divergentes de identidade sem expor o conteúdo %#', async fontes => {
    await expect(apurar(fontes)).rejects.toBeInstanceOf(ErroApuracaoReferencia);
  });

  it('recusa a duplicação de uma linha que entraria no saldo das demais apurações', async () => {
    const outraLinha = linha('2.00', 'SIM', 'recorte-seguinte', '13-05-2024', '19-05-2024');
    await expect(apurar({ conciliacao: csv(linha(), outraLinha, outraLinha) })).rejects.toThrow('duplicado');
  });

  it('distingue agendamento, compensações e desfecho do título e mantém somente o balance na comparação', async () => {
    const compensado = { ...titulo, id: 'comp-a', type: privado, status: 'COMPENSATED', paymentDate: null, amount: -1.25 };
    const liquid = liquidacao({ settlements: [{ ...grupo, closingItems: [titulo, compensado, { ...compensado, id: 'comp-b' },
      { ...titulo, id: 'transferido', status: 'SUCCEED' }] }] });
    const r = await apurar({ liquidacao: liquid });
    expect(r.somas.liquidacaoCentavos).toBe('1530');
    expect(r.liquidacao.grupos).toMatchObject([{ estado: 'SCHEDULED', data: '2024-05-20' },
      { tipo: 'OUTROS', estado: 'COMPENSATED', quantidade: 2, centavos: '-250', data: null }, { estado: 'SUCCEED' }]);
    expect(JSON.stringify(r)).not.toContain(privado);
  });

  it('lê o literal numérico dos GETs com precisão antes de qualquer conversão para Number', async () => {
    const corpo = pagina([evento(15.3)]).toString().replace('"value":15.3', '"value":9007199254740993123.45');
    const lido = await consultarEventosFinancialV3({ ...periodo, merchantId: loja }, async () => ({ status: 200, cabecalhos: {}, corpo }));
    expect(lido.eventos[0].valorCentavos).toBe(900719925474099312345n);
    const resultado = await apurar({ eventos: [Buffer.from(corpo)] });
    expect(resultado.somas.eventosCentavos).toBe('900719925474099312345');
  });
});
