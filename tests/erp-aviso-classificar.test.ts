/**
 * Pós-deploy da I.1b, tratado na I.2a: o aviso de insumos sem categoria definitiva nunca diz "R$ 0,00 em estoque"; sem saldo diz "sem saldo"
 * (como a fila de classificar), e com saldo mostra o valor.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvisoDaClassificacao, AvisosDaLista } from '@/components/erp/telas/insumos/aviso-classificar';
import type { ResumoDoQueFalta } from '@/lib/erp/classificar';

const sp = (s: string) => s.replace(/ /g, ' ');
const resumo = (valorCentavos: number | null): ResumoDoQueFalta => ({ total: 2, semCategoria: 1, emOutros: 1, valorCentavos }) as ResumoDoQueFalta;

describe('aviso de insumos sem categoria · estoque', () => {
  it('sem saldo diz "sem saldo", nunca R$ 0,00, no aviso da tela e no da lista', () => {
    const a = sp(renderToStaticMarkup(createElement(AvisoDaClassificacao, { resumo: resumo(0), href: '/x' })));
    const b = sp(renderToStaticMarkup(createElement(AvisosDaLista, { resumo: resumo(0), hrefClassificar: '/x', aConfirmar: 0, base: '/erp/insumos', jaFiltrado: false })));
    for (const h of [a, b]) {
      expect(h).toContain('sem saldo nas lojas que você acessa');
      expect(h).not.toContain('R$ 0,00');
      expect(h).not.toContain('em estoque');
    }
  });

  it('com saldo mostra o valor; sem permissão de ver estoque (nulo) não diz nada do valor', () => {
    expect(sp(renderToStaticMarkup(createElement(AvisoDaClassificacao, { resumo: resumo(123_456) })))).toContain('R$ 1.234,56 em estoque nas lojas que você acessa');
    const nulo = sp(renderToStaticMarkup(createElement(AvisoDaClassificacao, { resumo: resumo(null) })));
    expect(nulo).not.toContain('estoque');
    expect(nulo).not.toContain('saldo');
  });
});
