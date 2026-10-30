import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-dom', async original => ({ ...await original<typeof import('react-dom')>(), useFormState: () => [null, undefined], useFormStatus: () => ({ pending: false }) }));
import { taxaConfiguradaDaLinha } from '@/lib/erp/canal-campos';
import { FormMetasDeCmv } from '@/components/erp/telas/fichas/form-metas-cmv';

describe('taxa desconhecida é independente da meta iFood', () => {
  it('linha ausente e linha só com meta retornam null, sem inventar zero', () => {
    expect(taxaConfiguradaDaLinha(null)).toBeNull();
    expect(taxaConfiguradaDaLinha({ taxaConfigurada: false, taxaBp: 0, taxaPagamentoBp: 0 })).toBeNull();
  });
  it('zero explícito e taxa positiva continuam conhecidos', () => {
    expect(taxaConfiguradaDaLinha({ taxaConfigurada: true, taxaBp: 0, taxaPagamentoBp: 0 })).toEqual({ comissaoBp: 0, pagamentoBp: 0 });
    expect(taxaConfiguradaDaLinha({ taxaConfigurada: true, taxaBp: 1200, taxaPagamentoBp: 320 })).toEqual({ comissaoBp: 1200, pagamentoBp: 320 });
  });
  it('o formulário permite informar meta iFood antes de haver taxa; bloqueio do parceiro continua valendo', () => {
    const props = { acao: async () => null, aqui: '/erp/fichas/canais', versao: '', inicial: { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null }, bloqueio: null };
    const html = renderToStaticMarkup(createElement(FormMetasDeCmv, props));
    const campo = html.match(/<input[^>]*name="metaCmv_IFOOD"[^>]*>/)?.[0];
    expect(campo).toBeDefined();
    expect(campo).not.toMatch(/\sdisabled(?:\s|=|\/?>)/);
    expect(html).not.toContain('Configure a taxa do iFood acima antes');
    expect(renderToStaticMarkup(createElement(FormMetasDeCmv, { ...props, bloqueio: 'Somente leitura' }))).toContain('<fieldset disabled=""');
  });
});
