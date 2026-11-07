import { describe, expect, it } from 'vitest';
import { diasDoPainel, lerFiltrosDoPainelAnalytics, ontemDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';

const merchant = '12345678-abcd-abcd-abcd-123456789abc';
describe('Painel Analytics · filtros e calendário', () => {
  it('default exibe trinta dias terminando em ontem e não corta futuro silenciosamente', () => {
    expect(lerFiltrosDoPainelAnalytics({}, '2026-11-06')).toEqual({ lojaId: '', inicio: '2026-10-08', fim: '2026-11-06', merchants: [] });
    expect(lerFiltrosDoPainelAnalytics({ fim: '2026-11-07' }, '2026-11-06')).toBeNull();
  });
  it.each([
    { inicio: '0000-01-01' }, { inicio: '2026-02-29' }, { inicio: '2026-03-01', fim: '2026-02-28' }, { fim: ['2026-10-10'] },
    { lojaId: ['l1', 'l2'] }, { lojaId: ' l1' }, { merchants: ['inventado'] }, { merchants: [merchant.toUpperCase()] }, { merchants: [42] },
  ])('recusa filtro malformado %j', entrada => expect(lerFiltrosDoPainelAnalytics(entrada, '2026-11-06')).toBeNull());
  it('UUID repetido não dobra cobertura; null não significa seleção vazia', () => {
    expect(lerFiltrosDoPainelAnalytics({ merchants: [merchant, merchant] }, '2026-11-06')?.merchants).toEqual([merchant]);
    expect(lerFiltrosDoPainelAnalytics({ merchants: null }, '2026-11-06')).toBeNull();
  });
  it('dias civis incluem fevereiro bissexto sem horário local', () => {
    expect(diasDoPainel('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    expect(diasDoPainel('2026-02-29', '2026-03-01')).toBeNull();
  });
  it('D−1 respeita meia-noite de São Paulo e virada de ano', () => {
    expect(ontemDoPainelAnalytics(new Date('2026-01-01T02:59:59Z'))).toBe('2025-12-30');
    expect(ontemDoPainelAnalytics(new Date('2026-01-01T03:00:00Z'))).toBe('2025-12-31');
  });
  it('orçamento recusa em vez de truncar uma série longa', () => {
    expect(diasDoPainel('1900-01-01', '2026-11-06')).toBeNull();
  });
});
