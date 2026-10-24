/**
 * Gráficos e análises (24/10/2026, referência: módulos da Nina) — regras puras:
 * - marcas do eixo redondas e que cobrem o máximo; dinheiro curto;
 * - série diária do faturamento: dia sem lançamento é null (nunca zero), com o estado certo;
 *   a rede soma as lojas e marca falta se alguma loja deixou de lançar;
 * - saúde do cardápio: pronto só com CMV em todo canal ofertado; sem dados pela 1ª coisa que falta.
 */
import { describe, expect, it } from 'vitest';
import { dinheiroCurto, marcasDoEixo, serieDoMes } from '@/lib/erp/grafico';
import { resumirSaude } from '@/lib/erp/saude-do-cardapio';
import type { LojaNoMes } from '@/lib/erp/faturamento';
import type { CmvDoCanal } from '@/lib/erp/cmv-produto-campos';

describe('gráfico · eixo e formato', () => {
  it('marcas redondas de 0 até cobrir o máximo', () => {
    expect(marcasDoEixo(1_832_300)).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    expect(marcasDoEixo(900)).toEqual([0, 250, 500, 750, 1000]);
    expect(marcasDoEixo(0)).toEqual([0]);
    expect(marcasDoEixo(Number.NaN)).toEqual([0]);
    for (const m of [7, 133, 9_999, 123_456]) expect(marcasDoEixo(m).at(-1)!).toBeGreaterThanOrEqual(m);
  });
  it('dinheiro curto em reais, a partir de centavos', () => {
    expect(dinheiroCurto(85_000)).toBe('R$ 850');
    expect(dinheiroCurto(120_000)).toBe('R$ 1,2 mil');
    expect(dinheiroCurto(2_000_000)).toBe('R$ 20 mil');
    expect(dinheiroCurto(340_000_000)).toBe('R$ 3,4 mi');
    expect(dinheiroCurto(0)).toBe('R$ 0');
  });
});

const grao = (v: number) => ({ valorCentavos: v, pedidos: 1, clientes: 1, ticketMedioCentavos: v, lojaId: 'x', data: '', canal: 'LOJA' }) as never;
function loja(primeiraData: string | null, dias: { canais: Record<string, number>; faltam?: string[] }[], datas: string[], hoje: string): LojaNoMes {
  return {
    loja: { id: 'l', nome: 'L', ativa: true, canais: ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] } as never,
    primeiraData,
    dias: dias.map((d, i) => ({
      data: datas[i],
      canais: Object.fromEntries(Object.entries(d.canais).map(([c, v]) => [c, grao(v)])),
      total: null,
      faltam: (d.faltam ?? []) as never,
      emAberto: datas[i] === hoje,
      futuro: datas[i] > hoje,
    })),
    porCanal: {} as never,
    total: {} as never,
    faltasPorCanal: {} as never,
    faltas: 0,
  };
}

describe('gráfico · série diária do faturamento', () => {
  const datas = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
  const hoje = '2026-10-04';
  it('sem lançamento é null, nunca zero; cada dia tem seu estado', () => {
    const a = loja('2026-10-02', [{ canais: {} }, { canais: { LOJA: 1000, IFOOD: 500 } }, { canais: { LOJA: 800 }, faltam: ['IFOOD'] }, { canais: {} }, { canais: {} }], datas, hoje);
    const s = serieDoMes({ dias: datas, lojas: [a], hoje });
    expect(s.dias.map((d) => d.estado)).toEqual(['antes', 'lancado', 'falta', 'em-aberto', 'futuro']);
    expect(s.dias[0].total).toBeNull();
    expect(s.dias[1]).toMatchObject({ total: 1500, valores: { LOJA: 1000, DELIVERY_PROPRIO: null, IFOOD: 500 } });
    expect(s.dias[2]).toMatchObject({ total: 800, faltam: ['IFOOD'] });
    expect(s).toMatchObject({ maximo: 1500, diasLancados: 2, diasComFalta: 1, canais: ['LOJA', 'IFOOD'] });
  });
  it('a rede soma as lojas; um canal zerado de verdade conta como lançado (zero real ≠ sem número)', () => {
    const a = loja('2026-10-01', [{ canais: { LOJA: 1000 } }, { canais: {} }, { canais: {} }, { canais: {} }, { canais: {} }], datas, hoje);
    const b = loja('2026-10-01', [{ canais: { LOJA: 0, DELIVERY_PROPRIO: 300 } }, { canais: {} }, { canais: {} }, { canais: {} }, { canais: {} }], datas, hoje);
    const s = serieDoMes({ dias: datas, lojas: [a, b], hoje });
    expect(s.dias[0]).toMatchObject({ total: 1300, valores: { LOJA: 1000, DELIVERY_PROPRIO: 300, IFOOD: null }, estado: 'lancado' });
    expect(s.dias[1]).toMatchObject({ total: null, estado: 'sem-lancamento' });
    // uma loja escolhida: só ela
    expect(serieDoMes({ dias: datas, lojas: [a, b], hoje }, b).dias[0].total).toBe(300);
  });
});

const conta = (canal: CmvDoCanal['canal'], o: Partial<CmvDoCanal> & { completo?: boolean }): CmvDoCanal =>
  ({
    canal,
    ofertado: true,
    fisico: { valor: { num: 0n, den: 1n }, embalagens: { num: 0n, den: 1n }, completo: o.completo ?? true, falta: [] },
    metaBp: 3000,
    sugerido: {} as never,
    precoCentavos: 1000,
    cmvBp: null,
    status: 'semDados',
    motivo: null,
    resultado: {} as never,
    ...o,
  }) as CmvDoCanal;

describe('saúde do cardápio', () => {
  it('pronto só com CMV em todo canal ofertado; sem dados pela primeira coisa que falta (custo → meta → preço)', () => {
    const cmv = new Map<string, CmvDoCanal[]>([
      ['a', [conta('LOJA', { status: 'dentro' }), conta('DELIVERY_PROPRIO', { status: 'acima' }), conta('IFOOD', { ofertado: false, status: 'naoOfertado' })]],
      ['b', [conta('LOJA', { completo: false, metaBp: null }), conta('DELIVERY_PROPRIO', { metaBp: null }), conta('IFOOD', { precoCentavos: null })]],
    ]);
    const s = resumirSaude([{ id: 'a', custoCompleto: true }, { id: 'b', custoCompleto: false }], cmv);
    expect(s).toMatchObject({ pratos: 2, prontos: 1, custoIncompleto: 1 });
    expect(s.canais).toEqual([
      { canal: 'LOJA', ofertados: 2, dentro: 1, acima: 0, semCusto: 1, semMeta: 0, semPreco: 0 },
      { canal: 'DELIVERY_PROPRIO', ofertados: 2, dentro: 0, acima: 1, semCusto: 0, semMeta: 1, semPreco: 0 },
      { canal: 'IFOOD', ofertados: 1, dentro: 0, acima: 0, semCusto: 0, semMeta: 0, semPreco: 1 },
    ]);
  });
  it('prato sem canal ofertado não conta como pronto; cardápio vazio é zero de zero', () => {
    const s = resumirSaude([{ id: 'c', custoCompleto: true }], new Map([['c', [conta('LOJA', { ofertado: false, status: 'naoOfertado' })]]]));
    expect(s.prontos).toBe(0);
    expect(resumirSaude([], new Map())).toMatchObject({ pratos: 0, prontos: 0, custoIncompleto: 0 });
  });
});
