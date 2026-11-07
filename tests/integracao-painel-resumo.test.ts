import { describe, expect, it } from 'vitest';
import { inteiroExatoDoPainel, RecorteGrandeDoPainel, resumirPainelAnalytics, type LinhaAgregadaDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-resumo';
const linha = (p: Partial<LinhaAgregadaDoPainelAnalytics> = {}): LinhaAgregadaDoPainelAnalytics => ({
  dia: '2026-10-19', orderStatus: 'CONCLUDED', salesChannel: 'IFOOD', deliveredBy: 'IFOOD_DELIVERY', pedidos: '2', gmv: '1001', gmvSemEntrega: '901', ...p,
});
const d = <T>(valor: T) => ({ estado: 'disponivel', valor });
describe('Painel Analytics · oráculos exatos', () => {
  it('ticket só concluídos; taxa usa total e distribuições conservam parcelas sem médias de médias', () => {
    const r = resumirPainelAnalytics([linha(), linha({ dia: '2026-10-20', pedidos: '3', gmv: '1999', gmvSemEntrega: '1799', salesChannel: 'POS' }),
      linha({ orderStatus: 'CANCELLED', pedidos: '5', gmv: '700', gmvSemEntrega: '600', deliveredBy: 'MERCHANT_DELIVERY' })], true);
    expect(r.indicadores).toEqual({ gmv: d('3700'), gmvSemEntrega: d('3300'), gmvConcluido: d('3000'), gmvCancelado: d('700'),
      pedidos: d('10'), concluidos: d('5'), cancelados: d('5'), ticketConcluidos: d({ numerador: '3000', denominador: '5' }), taxaCancelamento: d({ numerador: '5', denominador: '10' }) });
    expect(r.distribuicoes.canal).toEqual(d([{ valor: 'IFOOD', pedidos: '7' }, { valor: 'POS', pedidos: '3' }]));
    expect(r.distribuicoes.logistica).toEqual(d([{ valor: 'IFOOD_DELIVERY', pedidos: '5' }, { valor: 'MERCHANT_DELIVERY', pedidos: '5' }]));
  });
  it('soma acima de MAX_SAFE e negativos continuam exatos e serializáveis', () => {
    const r = resumirPainelAnalytics([linha({ pedidos: '9007199254740991', gmv: '9007199254740991' }), linha({ pedidos: '9007199254740991', gmv: '-2' })], true);
    expect(r.indicadores.pedidos).toEqual(d('18014398509481982'));
    expect(r.indicadores.gmv).toEqual(d('9007199254740989'));
    expect(r.indicadores.ticketConcluidos).toEqual(d({ numerador: '9007199254740989', denominador: '18014398509481982' }));
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(resumirPainelAnalytics([linha({ gmv: '-1' })], true).indicadores.ticketConcluidos).toEqual(d({ numerador: '-1', denominador: '2' }));
  });
  it('nulo de cancelado não elimina ticket dos concluídos nem contagens', () => {
    const r = resumirPainelAnalytics([linha(), linha({ orderStatus: 'CANCELLED', gmv: null, gmvSemEntrega: null })], true);
    expect(r.indicadores.gmv).toEqual({ estado: 'sem-dado', motivo: 'valor-nao-informado' });
    expect(r.indicadores.ticketConcluidos).toEqual(d({ numerador: '1001', denominador: '2' }));
    expect(r.indicadores.pedidos).toEqual(d('4'));
    expect(r.indicadores.taxaCancelamento).toEqual(d({ numerador: '2', denominador: '4' }));
  });
  it('nulo de concluído elimina apenas dinheiro/ticket relevante', () => {
    const r = resumirPainelAnalytics([linha({ gmv: null })], true);
    expect(r.indicadores.ticketConcluidos).toEqual({ estado: 'sem-dado', motivo: 'valor-nao-informado' });
    expect(r.indicadores.gmvSemEntrega).toEqual(d('901'));
    expect(r.indicadores.concluidos).toEqual(d('2'));
  });
  it.each([null, 'NEW_STATUS'])('status %s mantém volume, mas impede taxa inventada', orderStatus => {
    const r = resumirPainelAnalytics([linha(), linha({ orderStatus, salesChannel: null, deliveredBy: 'NOVA_LOGISTICA' })], true);
    expect(r.indicadores.pedidos).toEqual(d('4'));
    expect(r.indicadores.taxaCancelamento).toEqual({ estado: 'sem-dado', motivo: 'status-nao-classificado' });
    expect(r.distribuicoes.status).toMatchObject({ estado: 'disponivel', valor: expect.arrayContaining([{ valor: orderStatus, pedidos: '2' }]) });
    expect(r.distribuicoes.canal).toMatchObject({ estado: 'disponivel', valor: expect.arrayContaining([{ valor: null, pedidos: '2' }]) });
  });
  it('vazio comprovado tem somas zero, mas ticket e taxa não têm denominador', () => {
    const r = resumirPainelAnalytics([], true);
    expect(r.indicadores.pedidos).toEqual(d('0')); expect(r.indicadores.gmv).toEqual(d('0'));
    expect(r.indicadores.ticketConcluidos).toEqual({ estado: 'sem-dado', motivo: 'sem-pedidos' });
    expect(r.indicadores.taxaCancelamento).toEqual({ estado: 'sem-dado', motivo: 'sem-pedidos' });
    expect(r.distribuicoes.canal).toEqual(d([]));
  });
  it('cobertura parcial não publica soma parcial como total; nenhuma fonte não significa zero', () => {
    expect(resumirPainelAnalytics([linha()], false).indicadores.gmv).toEqual({ estado: 'sem-dado', motivo: 'cobertura-parcial' });
    expect(resumirPainelAnalytics([], false, false).indicadores.pedidos).toEqual({ estado: 'sem-dado', motivo: 'sem-fontes' });
  });
  it('pagamento, horário e primeiro cliente continuam indisponíveis mesmo com cobertura principal', () => {
    const r = resumirPainelAnalytics([linha()], true);
    for (const m of ['pagamento', 'horario', 'primeiroPedido'] as const) expect(r.distribuicoes[m]).toEqual({ estado: 'sem-dado', motivo: 'contrato-indisponivel' });
  });
  it.each(['01', '-0', '1e3', 'NaN', 'Infinity', '0.1', '+1', ' 2'])('recusa inteiro não canônico %s', n => expect(() => inteiroExatoDoPainel(n)).toThrow());
  it('contagem negativa é recusada; limite de categorias não corta silenciosamente', () => {
    expect(() => resumirPainelAnalytics([linha({ pedidos: '-1' })], true)).toThrow();
    expect(() => resumirPainelAnalytics(Array.from({ length: 2001 }, (_, i) => linha({ salesChannel: `CANAL_${i}` })), true)).toThrow(RecorteGrandeDoPainel);
  });
});
