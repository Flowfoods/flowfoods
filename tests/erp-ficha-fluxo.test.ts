import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => null, useSearchParams: () => null }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, undefined], useFormStatus: () => ({ pending: false }) }));
import { FormEmbalagens } from '@/components/erp/telas/fichas/form-embalagens';

type Props = ComponentProps<typeof FormEmbalagens>;
const base: Props = { acao: async () => null, aqui: '/erp/fichas/teste/canais', cancelar: '/erp/fichas/teste', opcoes: [], inicial: [], impressao: '', porcao: { num: '1000', den: '1' }, faltaPreco: [], podeConferirPrecos: true, bloqueio: null };
const html = (p: Partial<Props>) => renderToStaticMarkup(createElement(FormEmbalagens, { ...base, ...p })).replace(/\s/g, ' ');

describe('resumo das embalagens: ausência, custo parcial e rascunho inválido', () => {
  it('nenhuma embalagem conserva só o custo conhecido da receita', () => {
    const h = html({});
    expect(h).toContain('Nenhuma embalagem neste canal.');
    expect(h).toContain('Custo físico da receita e embalagens: R$ 10,00 por porção');
    expect(h).not.toContain('Custo físico parcial');
  });
  it('receita sem custo não vira total zero mesmo sem embalagens', () => {
    const h = html({ porcao: { num: '0', den: '1' }, faltaPreco: ['Molho da casa'] });
    expect(h).toContain('Custo físico parcial conhecido: —');
    expect(h).toContain('falta o custo de Molho da casa');
    expect(h).not.toContain('Custo físico da receita e embalagens');
  });
  it('embalagem sem preço identifica o parcial e mantém o outro canal independente', () => {
    const h = html({
      opcoes: [{ id: 'sacola', nome: 'Sacola', unidade: 'UN', ativo: true, embalagem: true, custo: null }],
      inicial: [{ canal: 'IFOOD', insumoId: 'sacola', quantidade: '1', unidade: 'un' }],
    });
    expect(h).toContain('Custo físico parcial conhecido: R$ 10,00 por porção, antes da taxa do iFood');
    expect(h).toContain('Falta informar o custo de 1 embalagem.');
    expect(h).toContain('Custo físico da receita e embalagens: R$ 10,00 por porção');
  });
  it('rascunho ainda sem item não anuncia custo completo nem atalho sem permissão', () => {
    const h = html({ inicial: [{ canal: 'DELIVERY_PROPRIO', insumoId: '', quantidade: '1', unidade: 'un' }], podeConferirPrecos: false });
    expect(h).toContain('Complete as embalagens e quantidades para conferir o custo.');
    expect(h).toContain('Custo físico parcial conhecido: R$ 10,00 por porção');
    expect(h).not.toContain('Salvar e conferir preços');
  });
});
