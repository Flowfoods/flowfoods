import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SeloOrigemAnalytics } from '@/components/erp/telas/faturamento/selo-origem-analytics';
import type { OrigemAnalyticsNoFaturamento } from '@/lib/integracoes/core/situacao-analytics-campos';

vi.mock('@/lib/db', () => { throw new Error('Selo não consulta banco.'); });
vi.mock('@/lib/integracoes/core/situacao-analytics', () => { throw new Error('Selo não importa reader.'); });
const origem: OrigemAnalyticsNoFaturamento = { origem: 'ifood-analytics', aplicadoEm: '2026-11-07T13:15:00Z', atualizacaoPendente: false };
const html = (o: OrigemAnalyticsNoFaturamento | null = origem, hrefIntegracao?: string) => renderToStaticMarkup(createElement(SeloOrigemAnalytics, { origem: o, hrefIntegracao }));

describe('INT-1.8A · origem mínima no faturamento', () => {
  it('sem origem Analytics não fabrica selo', () => expect(html(null)).toBe(''));
  it('mostra origem e aplicação, sem exigir link técnico nem inventar última coleta', () => {
    const h = html();
    expect(h).toContain('Origem: iFood Analytics'); expect(h).toContain('Aplicado em'); expect(h).toContain('10:15');
    expect(h).toContain('horário de São Paulo'); expect(h).not.toMatch(/<a |R\$|Última coleta|Atualizado agora|pendente/);
  });
  it('pendência conserva a origem e descreve somente a aplicação anterior', () => {
    const h = html({ ...origem, atualizacaoPendente: true });
    expect(h).toContain('Origem: iFood Analytics'); expect(h).toContain('Há uma atualização pendente');
    expect(h).toContain('O valor aplicado anteriormente foi preservado'); expect(h).not.toMatch(/PERIODO_FECHADO|403|recibo|snapshot/);
  });
  it('link aparece só quando o caller fornece o destino autorizado completo', () => {
    const h = html(origem, '/erp/integracoes?loja=loja-a&dia=2026-11-06');
    expect(h).toContain('href="/erp/integracoes?loja=loja-a&amp;dia=2026-11-06"');
    expect(h).toContain('Conferir a situação da integração');
    expect(html()).not.toContain('<a ');
  });
  it('extras financeiros e técnicos não são serializados no selo', () => {
    const o = Object.assign({ ...origem }, { motivo: 'ERRO_PRIVADO', hashAplicado: 'HASH_PRIVADO', valorCentavos: 987654321, pedidos: 998877 });
    expect(html(o)).not.toMatch(/ERRO_PRIVADO|HASH_PRIVADO|987654321|998877/);
  });
});
