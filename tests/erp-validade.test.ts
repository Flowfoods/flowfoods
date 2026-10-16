/**
 * ERP 1.4 · Validade por conservação, sem banco — e as heranças puras da 1.3:
 * (a) o insumo produzido por um pré-preparo não entra como insumo comum.
 */
import { describe, expect, it } from 'vitest';
import { lerFormFicha, type InsumoDaFicha, type PreparoDaFicha } from '@/lib/erp/ficha-campos';

const ins = (id: string, nome: string, extra: Partial<InsumoDaFicha> = {}): InsumoDaFicha => ({
  id,
  nome,
  unidade: 'KG',
  ativo: true,
  conteudoMilesimos: 1000,
  precoEmbalagemCentavos: 500,
  taxaEntregaCentavos: 0,
  ...extra,
});

describe('ERP 1.4 (herança a da 1.3) · insumo produzido não entra como insumo comum', () => {
  const CEBOLA = ins('cebola', 'Cebola');
  const MOLHO_INSUMO = ins('molho-insumo', 'Molho cheddar', { produzidoPor: 'Molho cheddar', precoEmbalagemCentavos: 0 });
  const MOLHO: PreparoDaFicha = { id: 'molho', nome: 'Molho cheddar', tipo: 'PRE_PREPARO', ativa: true, unidadeRendimento: 'KG' };
  const doCadastro = new Map([CEBOLA, MOLHO_INSUMO].map((i) => [i.id, i]));

  it('formulário forjado com o id do insumo produzido é recusado na linha, apontando o pré-preparo', () => {
    const r = lerFormFicha(
      { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: 'molho-insumo', quantidade: '40', unidade: 'g' }] },
      doCadastro,
      new Set(['molho-insumo']), // nem estando "já na ficha" ele passa
      { preparos: new Map([[MOLHO.id, MOLHO]]) },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros['item-0']).toMatch(/pré-preparo “Molho cheddar”: escolha-o em “Pré-preparos”/);
  });

  it('pelo pré-preparo (subficha) entra normalmente', () => {
    const r = lerFormFicha(
      { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: [{ subfichaId: 'molho', quantidade: '40', unidade: 'g' }, { insumoId: 'cebola', quantidade: '10', unidade: 'g' }] },
      doCadastro,
      new Set(),
      { preparos: new Map([[MOLHO.id, MOLHO]]) },
    );
    expect(r.ok).toBe(true);
  });
});
