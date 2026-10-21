/**
 * ERP 2.5 · o orçamento na tela, SEM banco: a linha da prévia da nota (aviso, nunca bloqueio), o aviso do detalhe e a tela
 * de quem não vê a receita (só o "cabe" pelo teto arredondado, sem nenhuma palavra da conta), e a revisão de UX da 2.5
 * (quem passou dito abaixo do número da rede, linha de uma linha, "passou" no lugar de "−R$", sem rodapé repetido).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AvisoDoOrcamento, OrcamentoNaPrevia, TelaOrcamento } from '@/components/erp/telas/compras/orcamento';
import type { OrcamentoDeCompra, OrcamentoNaNota, VistaCompleta } from '@/lib/erp/orcamento';
import { fraseDeQuemPassou } from '@/lib/erp/orcamento-campos';

vi.mock('next/navigation', () => ({ usePathname: () => '/erp/compras/orcamento' }));

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, ' ');
const PERIODO = { inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' };
const conta = (impacto: Extract<OrcamentoNaNota, { tipo: 'conta' }>['impacto'], p: Partial<Extract<OrcamentoNaNota, { tipo: 'conta' }>> = {}): OrcamentoNaNota => ({
  tipo: 'conta',
  lojaNome: 'Vila da Penha',
  periodoNome: 'Outubro de 2026',
  impacto,
  semNota: false,
  defineMetas: false,
  ...p,
});

describe('2.5 · a nota: aviso, nunca bloqueio', () => {
  it('a prévia que passa diz quanto passa e que a nota entra igual; "combinar com quem define as metas" só para quem não define', () => {
    const i = { antesCentavos: 230_000, depoisCentavos: -70_000, passa: true, arredondado: false };
    const h = html(createElement(OrcamentoNaPrevia, { o: conta(i) }));
    expect(h).toContain('antes desta nota, cabe R$ 2.300,00');
    expect(h).toContain('Com esta nota, passa R$ 700,00 do orçamento.');
    expect(h).toContain('É um aviso: a nota pode ser lançada. Vale combinar com quem define as metas.');
    expect(html(createElement(OrcamentoNaPrevia, { o: conta(i, { defineMetas: true }) }))).not.toContain('Vale combinar');
  });

  it('a prévia do comprador diz que parte do teto arredondado para baixo; a que cabe não fala em aviso', () => {
    const h = html(createElement(OrcamentoNaPrevia, { o: conta({ antesCentavos: 230_000, depoisCentavos: 220_000, passa: false, arredondado: true }) }));
    expect(h).toContain('pelo teto arredondado para baixo (sem a receita)');
    expect(h).toContain('Com esta nota, ainda cabe R$ 2.200,00.');
    expect(h).not.toContain('aviso');
  });

  it('loja sem nota no período: a prévia diz que o "antes" é o teto inteiro', () => {
    expect(html(createElement(OrcamentoNaPrevia, { o: conta({ antesCentavos: 1_230_000, depoisCentavos: 1_220_000, passa: false, arredondado: false }, { semNota: true }) }))).toContain('ainda não tem nota de compra');
  });

  it('sem número e fora do período dizem o motivo, nunca R$ 0,00', () => {
    expect(html(createElement(OrcamentoNaPrevia, { o: { tipo: 'sem', lojaNome: 'Centro', periodoNome: 'Outubro de 2026', motivo: 'falta a meta do CMV' } }))).toContain('Centro em Outubro de 2026: sem número (falta a meta do CMV).');
    const fora = html(createElement(OrcamentoNaPrevia, { o: { tipo: 'fora', periodoNome: 'Outubro de 2026' } }));
    expect(fora).toContain('o orçamento de compra é só dele');
    expect(fora).not.toContain('R$ 0,00');
  });

  it('o detalhe: nota recém-lançada fala da nota; nota antiga começa com "Hoje," (ela não causou sozinha o estouro); fora do período, nada', () => {
    const o = conta({ antesCentavos: -70_000, depoisCentavos: -70_000, passa: true, arredondado: false });
    const agora = html(createElement(AvisoDoOrcamento, { o, href: '/erp/compras/orcamento', agora: true }));
    expect(agora).toContain('Vila da Penha passou R$ 700,00 do orçamento de compra de Outubro de 2026.');
    expect(agora).toContain('A nota está lançada: o orçamento avisa, não bloqueia.');
    expect(agora).toContain('href="/erp/compras/orcamento"');
    const antiga = html(createElement(AvisoDoOrcamento, { o, href: '/erp/compras/orcamento' }));
    expect(antiga).toContain('Hoje, Vila da Penha passou R$ 700,00');
    expect(antiga).not.toContain('A nota está lançada');
    expect(html(createElement(AvisoDoOrcamento, { o: { tipo: 'fora', periodoNome: 'Outubro de 2026' } }))).toBe('');
  });
});

describe('2.5 · a tela', () => {
  const quemPassou = [{ nome: 'Delivery', passouCentavos: 100_000, frase: fraseDeQuemPassou('Delivery', 100_000) }];
  const resumida: OrcamentoDeCompra = {
    periodo: PERIODO,
    hoje: '2026-10-21',
    dia: { dia: 21, de: 31 },
    metaBp: null,
    rede: { veReceita: false, saldoCentavos: 640_000, motivo: null, diasSemLancamento: 1, semNota: [], quemPassou },
    lojas: [
      { lojaId: 'vp', nome: 'Vila da Penha', vista: { veReceita: false, saldoCentavos: 740_000, motivo: null, diasSemLancamento: 1, semNota: [], quemPassou: [] } },
      { lojaId: 'dl', nome: 'Delivery', vista: { veReceita: false, saldoCentavos: -100_000, motivo: null, diasSemLancamento: 0, semNota: [], quemPassou: [] } },
      { lojaId: 'ct', nome: 'Centro', vista: { veReceita: false, saldoCentavos: null, motivo: 'sem faturamento lançado nas últimas 4 semanas', diasSemLancamento: 0, semNota: [], quemPassou: [] } },
    ],
  };

  it('quem não vê a receita: o "cabe", o "passou", quem passou abaixo do número, o motivo; nenhuma palavra da conta nem rodapé repetido', () => {
    const h = html(createElement(TelaOrcamento, { dados: resumida, contexto: 'Rede Completa', bloqueio: null, lancarHref: '/erp/compras/nova', faturamentoHref: '/erp/faturamento/lancar' }));
    expect(h).toContain('Rede Completa · Outubro de 2026 · dia 21 de 31');
    expect(h).toContain('R$ 6.400,00');
    expect(h).toContain('Pelo teto arredondado para baixo, sem a receita');
    expect(h).toContain('Delivery já passou R$ 1.000,00: a sobra de outra loja não cobre');
    expect(h).toContain('passou R$ 1.000,00');
    expect(h).toContain('sem faturamento lançado nas últimas 4 semanas');
    expect(h).toContain('1 dia sem lançamento completo de faturamento');
    expect(h.match(/arredondado/g)).toHaveLength(1); // dito uma vez, no subtítulo
    for (const p of ['Receita prevista', 'Meta do CMV', 'Teto', 'Já comprado', 'Ritmo', 'R$ 0,00', 'É um aviso, não um bloqueio: a nota que passa']) expect(h, p).not.toContain(p);
    expect(h).not.toContain('<table'); // lista, não uma tabela de 2 colunas esticada
    expect(h.match(/<h1/g)).toHaveLength(1);
  });

  it('quem vê a receita: tabela de uma linha por loja, "passou" no lugar de "−R$", "sem nota de compra" no lugar de R$ 0,00, a explicação do ritmo e a previsão sem meta', () => {
    const vista = (p: Partial<VistaCompleta>): VistaCompleta => ({
      veReceita: true,
      conta: null,
      motivo: null,
      previsao: { realizadoCentavos: 2_600_000, projetadoCentavos: 1_500_000, previstaCentavos: 4_100_000, diasCompletos: 20, diasSemLancamento: 0, diasRestantes: 11, diasNaJanela: 28, diasAntesDeAbrir: 0, frasesDoZero: [] },
      previstaCentavos: 4_100_000,
      ritmo: { tipo: 'cor', escala: 'custo', cor: 'VERMELHO', posicao: 5, palavra: 'muito pior que a meta', confira: null, desvioTexto: '+7,6 pp', rotulo: 'Farol' },
      cmvAteOntemBp: 3760,
      compradoCentavos: 1_000_000,
      compradoAteOntemCentavos: 900_000,
      receitaAteOntemCentavos: 2_600_000,
      diasSemLancamento: 0,
      semNota: [],
      quemPassou: [],
      ...p,
    });
    const dados: OrcamentoDeCompra = {
      periodo: PERIODO,
      hoje: '2026-10-21',
      dia: { dia: 21, de: 31 },
      metaBp: 3000,
      rede: vista({ conta: { previstaCentavos: 6_150_000, metaBp: 3000, tetoCentavos: 1_845_000, compradoCentavos: 2_166_000, saldoCentavos: -321_600 }, previsao: null, quemPassou }),
      lojas: [
        { lojaId: 'vp', nome: 'Vila da Penha', vista: vista({ conta: { previstaCentavos: 4_100_000, metaBp: 3000, tetoCentavos: 1_230_000, compradoCentavos: 0, saldoCentavos: 1_230_000 }, compradoCentavos: 0, semNota: ['Vila da Penha'] }) },
        { lojaId: 'dl', nome: 'Delivery', vista: vista({ conta: { previstaCentavos: 2_050_000, metaBp: 3000, tetoCentavos: 615_000, compradoCentavos: 2_166_000, saldoCentavos: -1_551_000 }, compradoCentavos: 2_166_000 }) },
      ],
    };
    const h = html(createElement(TelaOrcamento, { dados, contexto: 'Rede Completa', bloqueio: null }));
    expect(h).toContain('passou R$ 3.216,00');
    expect(h).not.toContain('-R$');
    expect(h).not.toContain('= −R$');
    expect(h).toContain('sem nota de compra');
    expect(h).toContain('Delivery já passou R$ 1.000,00');
    expect(h).toContain('O farol olha o ritmo das compras até ontem; o número de cima olha o período inteiro.');
    expect(h).toContain('<table');
    expect(h).toContain('h-11');
    expect(h).not.toContain('ainda cabe no período</span></td>');
    // sem meta, a previsão aparece para quem vê a receita
    const semMeta = html(
      createElement(TelaOrcamento, {
        dados: { ...dados, metaBp: null, rede: null, lojas: [{ lojaId: 'vp', nome: 'Vila da Penha', vista: vista({ conta: null, motivo: 'falta a meta do CMV', ritmo: null }) }] },
        contexto: 'Vila da Penha',
        bloqueio: null,
        planoHref: '/erp/dre/plano',
      }),
    );
    expect(semMeta).toContain('Receita prevista R$ 41.000,00');
    expect(semMeta).toContain('Definir a meta do CMV em Plano e metas');
    // a rede sem meta também mostra a receita prevista (soma das lojas)
    const redeSemMeta = html(createElement(TelaOrcamento, { dados: { ...dados, metaBp: null, rede: vista({ conta: null, motivo: 'falta a meta do CMV', ritmo: null, previsao: null, previstaCentavos: 6_150_000 }) }, contexto: 'Rede Completa', bloqueio: null }));
    expect(redeSemMeta).toContain('Receita prevista R$ 61.500,00 (a soma das lojas). Sem a meta do CMV não há teto.');
  });
});
