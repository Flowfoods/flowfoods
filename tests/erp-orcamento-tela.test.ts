/**
 * ERP 2.5 · o orçamento na tela, SEM banco: a linha da prévia da nota (aviso, nunca bloqueio), o aviso do detalhe e a tela
 * de quem não vê a receita (só o "cabe" arredondado, sem nenhuma palavra da conta).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AvisoDoOrcamento, OrcamentoNaPrevia, TelaOrcamento } from '@/components/erp/telas/compras/orcamento';
import type { OrcamentoDeCompra } from '@/lib/erp/orcamento';

vi.mock('next/navigation', () => ({ usePathname: () => '/erp/compras/orcamento' }));

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, ' ');
const PERIODO = { inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' };

describe('2.5 · a nota: aviso, nunca bloqueio', () => {
  it('a prévia que passa diz quanto passa e que a nota entra igual', () => {
    const h = html(createElement(OrcamentoNaPrevia, { o: { tipo: 'conta', lojaNome: 'Vila da Penha', periodoNome: 'Outubro de 2026', impacto: { antesCentavos: 230_000, depoisCentavos: -70_000, passa: true, arredondado: false } } }));
    expect(h).toContain('antes desta nota, cabe R$ 2.300,00');
    expect(h).toContain('Com esta nota, passa R$ 700,00 do orçamento.');
    expect(h).toContain('É um aviso: a nota pode ser lançada.');
  });

  it('a prévia do comprador diz que é arredondado; a que cabe não fala em aviso', () => {
    const h = html(createElement(OrcamentoNaPrevia, { o: { tipo: 'conta', lojaNome: 'Vila da Penha', periodoNome: 'Outubro de 2026', impacto: { antesCentavos: 230_000, depoisCentavos: 220_000, passa: false, arredondado: true } } }));
    expect(h).toContain('(arredondado a R$ 100)');
    expect(h).toContain('Com esta nota, ainda cabe R$ 2.200,00.');
    expect(h).not.toContain('aviso');
  });

  it('sem número e fora do período dizem o motivo, nunca R$ 0,00', () => {
    expect(html(createElement(OrcamentoNaPrevia, { o: { tipo: 'sem', lojaNome: 'Centro', periodoNome: 'Outubro de 2026', motivo: 'falta a meta do CMV' } }))).toContain('Centro em Outubro de 2026: sem número (falta a meta do CMV).');
    const fora = html(createElement(OrcamentoNaPrevia, { o: { tipo: 'fora', periodoNome: 'Outubro de 2026' } }));
    expect(fora).toContain('o orçamento de compra é só dele');
    expect(fora).not.toContain('R$ 0,00');
  });

  it('o detalhe da nota que passou: aviso com o valor e o link; fora do período, nada', () => {
    const h = html(createElement(AvisoDoOrcamento, { o: { tipo: 'conta', lojaNome: 'Vila da Penha', periodoNome: 'Outubro de 2026', impacto: { antesCentavos: -70_000, depoisCentavos: -70_000, passa: true, arredondado: false } }, href: '/erp/compras/orcamento' }));
    expect(h).toContain('Vila da Penha passou R$ 700,00 do orçamento de compra de Outubro de 2026.');
    expect(h).toContain('o orçamento avisa, não bloqueia');
    expect(h).toContain('href="/erp/compras/orcamento"');
    expect(html(createElement(AvisoDoOrcamento, { o: { tipo: 'fora', periodoNome: 'Outubro de 2026' } }))).toBe('');
  });
});

describe('2.5 · a tela de quem não vê a receita', () => {
  const dados: OrcamentoDeCompra = {
    periodo: PERIODO,
    hoje: '2026-10-21',
    dia: { dia: 21, de: 31 },
    metaBp: null,
    rede: { veReceita: false, saldoCentavos: 640_000, motivo: null, diasSemLancamento: 1 },
    lojas: [
      { lojaId: 'vp', nome: 'Vila da Penha', vista: { veReceita: false, saldoCentavos: -10_000, motivo: null, diasSemLancamento: 1 } },
      { lojaId: 'dl', nome: 'Delivery', vista: { veReceita: false, saldoCentavos: null, motivo: 'sem faturamento lançado nas últimas 4 semanas', diasSemLancamento: 0 } },
    ],
  };

  it('só o "cabe" arredondado, o "passou", o motivo e a frase do dia sem lançamento; nenhuma palavra da conta', () => {
    const h = html(createElement(TelaOrcamento, { dados, contexto: 'Rede Completa', bloqueio: null, lancarHref: '/erp/compras/nova' }));
    expect(h).toContain('Rede Completa · Outubro de 2026 · dia 21 de 31');
    expect(h).toContain('R$ 6.400,00');
    expect(h).toContain('arredondado a R$ 100');
    expect(h).toContain('passou do orçamento');
    expect(h).toContain('sem faturamento lançado nas últimas 4 semanas');
    expect(h).toContain('O faturamento de 1 dia ainda não foi lançado completo');
    for (const p of ['Receita prevista', 'Meta do CMV', 'Teto', 'Já comprado', 'Ritmo', 'R$ 0,00']) expect(h, p).not.toContain(p);
    expect(h.match(/<h1/g)).toHaveLength(1);
  });
});
