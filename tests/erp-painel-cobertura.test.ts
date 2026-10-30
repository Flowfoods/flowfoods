import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PainelDoDiaNaTela } from '@/components/erp/telas/painel-do-dia';

describe('Faturamento da Home distingue ausência e zero informado', () => {
  const tela = (centavos: number | null) => renderToStaticMarkup(createElement(PainelDoDiaNaTela, {
    painel: { indicadores: [{ chave: 'faturamento', rotulo: 'Faturamento de outubro',
      valor: { tipo: 'dinheiro', centavos }, contexto: centavos === null ? 'nenhum dia lançado ainda' : '1 dia lançado',
      href: '/erp/faturamento' }], pendencias: [] },
  }));
  it('nenhum lançamento mostra ausência acessível, sem um zero monetário fictício', () => {
    expect(tela(null)).toContain('Sem lançamentos');
    expect(tela(null)).toContain('nenhum dia lançado ainda');
    expect(tela(null)).not.toMatch(/R\$|0,00/);
  });
  it('zero comprovado e valor lançado continuam monetários', () => {
    expect(tela(0)).toMatch(/R\$.*0,00/);
    expect(tela(12345)).toMatch(/R\$.*123,45/);
    expect(tela(0)).not.toContain('Sem lançamentos');
  });
});
