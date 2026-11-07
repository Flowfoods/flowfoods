import { describe, expect, it } from 'vitest';
import type { CoberturaDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { resumirPagamentosDoPainel } from '@/lib/integracoes/ifood/painel-pagamentos';

const cobertura = (mudancas: Partial<CoberturaDoPainelAnalytics> = {}): CoberturaDoPainelAnalytics => ({
  completa: true, diasEsperados: 1, diasCompletos: 1, fontesSelecionadas: 1,
  paresEsperados: 1, paresCobertos: 1, dias: [], ...mudancas,
});
describe('Distribuição marginal de pagamentos no painel', () => {
  it('soma ocorrências exatas acima de MAX_SAFE sem usar contagem de pedidos', () => {
    const r = resumirPagamentosDoPainel(cobertura(), [
      { metodo: 'CREDIT', ocorrencias: '9007199254740991' }, { metodo: 'CREDIT', ocorrencias: '20' },
      { metodo: 'PIX', ocorrencias: '3' },
    ], false);
    expect(r.distribuicao).toEqual({ estado: 'disponivel', valor: [{ metodo: 'CREDIT', ocorrencias: '9007199254741011' }, { metodo: 'PIX', ocorrencias: '3' }] });
    expect(r.total).toEqual({ estado: 'disponivel', valor: '9007199254741014' });
  });
  it.each(['__proto__', 'constructor', 'toString', 'null', 'Método novo 🧾'])('preserva método literal %s', metodo => {
    const r = resumirPagamentosDoPainel(cobertura(), [{ metodo, ocorrencias: '0' }], false);
    expect(r.distribuicao).toEqual({ estado: 'disponivel', valor: [{ metodo, ocorrencias: '0' }] });
  });
  it('mapa explicitamente vazio é disponível e não declara pedidos', () => {
    expect(resumirPagamentosDoPainel(cobertura(), [], false)).toEqual({ cobertura: cobertura(),
      distribuicao: { estado: 'disponivel', valor: [] }, total: { estado: 'disponivel', valor: '0' } });
  });
  it('agregado NULL não vira zero nem aproveita as demais parcelas', () => {
    const r = resumirPagamentosDoPainel(cobertura(), [{ metodo: 'PIX', ocorrencias: '9' }], true);
    expect(r.total).toEqual({ estado: 'sem-dado', motivo: 'valor-nao-informado' });
    expect(r.distribuicao).toEqual(r.total);
  });
  it('cobertura marginal parcial impede total mesmo com valores presentes', () => {
    const r = resumirPagamentosDoPainel(cobertura({ completa: false }), [{ metodo: 'PIX', ocorrencias: '9' }], false);
    expect(r.total).toEqual({ estado: 'sem-dado', motivo: 'cobertura-parcial' });
  });
  it('sem fontes é separado de período incompleto', () => {
    expect(resumirPagamentosDoPainel(cobertura({ completa: false, fontesSelecionadas: 0 }), [], true).total)
      .toEqual({ estado: 'sem-dado', motivo: 'sem-fontes' });
  });
  it.each(['-1', '1.5', '01', '1e3'])('recusa contagem fora do DTO exato: %s', ocorrencias => {
    expect(() => resumirPagamentosDoPainel(cobertura(), [{ metodo: 'PIX', ocorrencias }], false)).toThrow();
  });
  it('não trunca silenciosamente métodos acima do orçamento', () => {
    expect(() => resumirPagamentosDoPainel(cobertura(), Array.from({ length: 2001 }, (_, i) => ({ metodo: `m${i}`, ocorrencias: '1' })), false)).toThrow(/Reduza/);
  });
});
