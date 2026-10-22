/** A busca por trecho: sem caixa, sem acento e literal (a parte pura; o banco está nos testes da lista de insumos). */
import { describe, expect, it } from 'vitest';
import { padraoDaBusca } from '@/lib/erp/busca';

describe('busca sem acento e sem caixa', () => {
  it('normaliza caixa, acento e espaço', () => {
    expect(padraoDaBusca('  AÇAÍ  ')).toBe('%acai%');
    expect(padraoDaBusca('Ypê')).toBe('%ype%');
    expect(padraoDaBusca('pão   de queijo')).toBe('%pao de queijo%');
  });
  it('curingas do LIKE viram letras', () => {
    expect(padraoDaBusca('50%')).toBe('%50\\%%');
    expect(padraoDaBusca('a_b')).toBe('%a\\_b%');
    expect(padraoDaBusca('\\')).toBe('%\\\\%');
  });
  it('sem o que buscar, não filtra', () => {
    expect(padraoDaBusca('')).toBeNull();
    expect(padraoDaBusca('   ')).toBeNull();
  });
  it('corta no tamanho máximo', () => {
    expect(padraoDaBusca('a'.repeat(200))).toBe(`%${'a'.repeat(80)}%`);
  });
});
