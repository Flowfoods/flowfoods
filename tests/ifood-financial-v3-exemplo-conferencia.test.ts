import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { gerarArquivoMensalSimulado } from '@/lib/integracoes/ifood/financial-v3-arquivo-simulado';
import { montarExemploConferenciaFinancial } from '@/lib/integracoes/ifood/financial-v3-exemplo-conferencia';

it('concilia as quatro fontes fictícias e entrega o CSV.gz validado do mesmo mês e loja usado no CLI', async () => {
  const exemplo = await montarExemploConferenciaFinancial();
  expect(exemplo).toMatchObject({
    origem: 'SIMULACAO', nomeLoja: 'Loja fictícia', competencia: '2026-02', cenario: 'conforme',
    arquivoEventos: { estado: 'COINCIDENTE', arquivoComImpactoCentavos: 2700n, eventosComImpactoCentavos: 2700n, diferencaCentavos: 0n },
    liquidacao: { estado: 'COMPATIVEL', saldoLiquidacaoCentavos: 2700n, eventosComImpactoCentavos: 2700n, diferencaCentavos: 0n },
    taxas: { estado: 'COMPATIVEL', porTipo: {
      ORDER_COMMISSION: { estado: 'COMPATIVEL', previstoCentavos: -240n, cobradoCentavos: -240n, diferencaCentavos: 0n,
        ocorrencias: [{ configuradaBp: 800, percentualCobrado: '8', baseCentavos: 3000n }] },
      PAYMENT_TRANSACTION_FEE: { estado: 'COMPATIVEL', previstoCentavos: -60n, cobradoCentavos: -60n,
        ocorrencias: [{ configuradaBp: 200, percentualCobrado: '2', baseCentavos: 3000n }] },
    } },
    antecipacao: { estado: 'COMPATIVEL', monetario: { taxaInformadaCentavos: 27n, diferencaBrutoLiquidoCentavos: 27n },
      percentual: { efetivoPonderado: { taxaCentavos: 27n, baseCentavos: 2700n } },
      titulos: [{ pagamentoOriginalEm: '2026-03-04', pagamentoAntecipadoEm: '2026-02-18', valorAntecipadoCentavos: 2673n }] },
  });
  const merchant = '00000000-0000-4000-8000-000000000001';
  expect(exemplo.download).toMatchObject({ nomeArquivo: `conciliacao-simulada-${merchant}-2026-02.csv.gz`, linhas: 3, pedidosDistintos: 1 });
  const partes = /^data:application\/gzip;base64,([A-Za-z0-9+/]+={0,2})$/.exec(exemplo.download.href);
  expect(partes).not.toBeNull();
  const bytes = Buffer.from(partes![1], 'base64');
  expect(bytes).toEqual((await gerarArquivoMensalSimulado()).arquivoInjetado.bytes);
  expect(gunzipSync(bytes).toString('utf8').split('\r\n')).toEqual([
    'valor;competencia;pedido_associado_ifood;loja_id;impacto_no_repasse',
    `30.00;2026-02;pedido-simulado;${merchant};SIM`, `-3.00;2026-02;pedido-simulado;${merchant};SIM`,
    `4.00;2026-02;;${merchant};NAO`,
  ]);
});

it('atribui a divergência de trinta centavos à cobrança da comissão e a propaga aos confrontos do repasse', async () => {
  const exemplo = await montarExemploConferenciaFinancial('divergente');
  expect(exemplo.arquivoEventos).toMatchObject({ estado: 'DIVERGENTE', arquivoComImpactoCentavos: 2700n, eventosComImpactoCentavos: 2670n,
    diferencaCentavos: -30n });
  expect(exemplo.liquidacao).toMatchObject({ estado: 'DIVERGENTE', saldoLiquidacaoCentavos: 2700n, diferencaCentavos: -30n });
  expect(exemplo.taxas.porTipo.ORDER_COMMISSION).toMatchObject({ estado: 'DIVERGENTE', cobradoCentavos: -270n,
    previstoCentavos: -240n, diferencaCentavos: -30n, ocorrencias: [{ percentualCobrado: '9', configuradaBp: 800 }] });
  expect(exemplo.taxas.porTipo.PAYMENT_TRANSACTION_FEE.estado).toBe('COMPATIVEL');
  expect(exemplo.antecipacao.estado).toBe('COMPATIVEL');
});

it('mantém só o arquivo disponível no exemplo incompleto e os quatro confrontos pendentes', async () => {
  const exemplo = await montarExemploConferenciaFinancial('incompleto');
  expect(exemplo.arquivoEventos).toMatchObject({ estado: 'PENDENTE', diferencaCentavos: null, eventosComImpactoCentavos: null });
  expect(exemplo.liquidacao).toMatchObject({ estado: 'PENDENTE', saldoLiquidacaoCentavos: null, diferencaCentavos: null });
  expect(exemplo.taxas).toMatchObject({ estado: 'PENDENTE', porTipo: {
    ORDER_COMMISSION: { cobradoCentavos: null, ocorrencias: [] }, PAYMENT_TRANSACTION_FEE: { cobradoCentavos: null, ocorrencias: [] },
  } });
  expect(exemplo.antecipacao).toMatchObject({ estado: 'PENDENTE', titulos: [], monetario: { taxaInformadaCentavos: null },
    percentual: { efetivoPonderado: null } });
  expect(exemplo.download.linhas).toBe(3);
});
