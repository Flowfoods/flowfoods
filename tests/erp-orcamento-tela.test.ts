/**
 * ERP 2.5 · o orçamento na tela, SEM banco: a linha da prévia da nota (aviso, nunca bloqueio), o aviso do detalhe e a tela
 * de quem não vê a receita (só o "cabe" pelo teto arredondado, sem nenhuma palavra da conta), e a revisão de UX da 2.5
 * (quem passou dito abaixo do número da rede, linha de uma linha, "passou" no lugar de "−R$", sem rodapé repetido).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AvisoDoOrcamento, OrcamentoNaPrevia, TelaOrcamento, tituloNaPrevia } from '@/components/erp/telas/compras/orcamento';
import type { OrcamentoDeCompra, OrcamentoNaNota, VistaCompleta } from '@/lib/erp/orcamento';
import { fraseAcimaDoLimite, fraseDeQuemPassou } from '@/lib/erp/orcamento-campos';

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

  it('a prévia do comprador fala em limite seguro, aproximado e sem centavos; a que cabe não fala em aviso; nunca "orçamento", "passou" nem "teto"', () => {
    const h = html(createElement(OrcamentoNaPrevia, { o: conta({ antesCentavos: 1_376_544, depoisCentavos: 1_226_544, passa: false, arredondado: true }) }));
    expect(h).toContain('antes desta nota, cabe R$ 13.700,00 no limite seguro.');
    expect(h).toContain('Com esta nota, ainda cabe R$ 12.200,00 no limite seguro.');
    expect(h).toContain('O limite seguro é um valor aproximado, sempre para menos');
    expect(h).not.toContain('aviso');
    const acima = html(createElement(OrcamentoNaPrevia, { o: conta({ antesCentavos: 30_000, depoisCentavos: -120_000, passa: true, arredondado: true }) }));
    expect(acima).toContain('Com esta nota, fica acima do limite seguro em R$ 1.200,00.');
    expect(acima).toContain('text-atencao');
    expect(acima).not.toContain('text-erro');
    for (const p of [h, acima]) expect(p).not.toMatch(/orçamento|passou|passa |teto/);
  });

  it('o detalhe para quem não vê a receita: limite seguro, tom de atenção, "Hoje," numa nota antiga; "sem" começa com o nome da loja (maiúscula)', () => {
    const o = conta({ antesCentavos: -30_000, depoisCentavos: -30_000, passa: true, arredondado: true });
    const d = html(createElement(AvisoDoOrcamento, { o }));
    expect(d).toContain('Hoje, Vila da Penha em Outubro de 2026: acima do limite seguro em R$ 300,00.');
    expect(d).toContain('bg-atencao');
    expect(d).not.toMatch(/orçamento|passou/); // nem no link: "Ver o limite seguro"
    expect(html(createElement(AvisoDoOrcamento, { o, href: '/erp/compras/orcamento' }))).toContain('Ver o limite seguro');
    expect(tituloNaPrevia(o)).toBe('Limite seguro de compra');
    expect(tituloNaPrevia({ tipo: 'fora', periodoNome: 'Outubro de 2026' })).toBe('Quanto ainda cabe');
    const sem = html(createElement(AvisoDoOrcamento, { o: { tipo: 'sem', lojaNome: 'Centro', periodoNome: 'Outubro de 2026', motivo: 'falta a meta do CMV', arredondado: false } }));
    expect(sem).toContain('Hoje, Centro em Outubro de 2026: orçamento de compra sem número.');
    expect(sem).toContain('Falta a meta do CMV.');
  });

  it('loja sem nota no período: a prévia diz que o "antes" é o teto inteiro', () => {
    expect(html(createElement(OrcamentoNaPrevia, { o: conta({ antesCentavos: 1_230_000, depoisCentavos: 1_220_000, passa: false, arredondado: false }, { semNota: true }) }))).toContain('ainda não tem nota de compra');
  });

  it('sem número e fora do período dizem o motivo, nunca R$ 0,00', () => {
    expect(html(createElement(OrcamentoNaPrevia, { o: { tipo: 'sem', lojaNome: 'Centro', periodoNome: 'Outubro de 2026', motivo: 'falta a meta do CMV', arredondado: true } }))).toContain('Centro em Outubro de 2026: sem número (falta a meta do CMV).');
    const fora = html(createElement(OrcamentoNaPrevia, { o: { tipo: 'fora', periodoNome: 'Outubro de 2026' } }));
    expect(fora).toContain('o quanto ainda cabe vale só para ele');
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
  const acimaDoLimite = [{ nome: 'Delivery', passouCentavos: 100_000, frase: fraseAcimaDoLimite('Delivery', -100_000) }];
  const resumida: OrcamentoDeCompra = {
    periodo: PERIODO,
    hoje: '2026-10-21',
    dia: { dia: 21, de: 31 },
    metaBp: null,
    rede: { veReceita: false, saldoCentavos: 640_044, motivo: null, diasSemLancamento: 1, semNota: [], quemPassou: acimaDoLimite },
    lojas: [
      { lojaId: 'vp', nome: 'Vila da Penha', vista: { veReceita: false, saldoCentavos: 740_000, motivo: null, diasSemLancamento: 1, semNota: [], quemPassou: [] } },
      { lojaId: 'dl', nome: 'Delivery', vista: { veReceita: false, saldoCentavos: -100_000, motivo: null, diasSemLancamento: 0, semNota: [], quemPassou: [] } },
      { lojaId: 'ct', nome: 'Centro', vista: { veReceita: false, saldoCentavos: null, motivo: 'sem faturamento lançado nas últimas 4 semanas', diasSemLancamento: 0, semNota: [], quemPassou: [] } },
    ],
  };

  it('quem não vê a receita: o "cabe", o "passou", quem passou abaixo do número, o motivo; nenhuma palavra da conta nem rodapé repetido', () => {
    const h = html(createElement(TelaOrcamento, { dados: resumida, contexto: 'Rede Completa', bloqueio: null, lancarHref: '/erp/compras/nova', faturamentoHref: '/erp/faturamento/lancar' }));
    expect(h).toContain('Rede Completa · Outubro de 2026 · dia 21 de 31');
    expect(h).toContain('R$ 6.400,00'); // R$ 6.400,44 aparece sem os centavos que parecem exatos
    expect(h).not.toContain('6.400,44');
    expect(h).toContain('Valor aproximado, sempre para menos: a conta exata pode ter mais folga e fica com quem vê o DRE.');
    expect(h).toContain('cabe no limite seguro');
    expect(h).toContain('Delivery está acima do limite seguro em R$ 1.000,00');
    expect(h).toContain('acima em R$ 1.000,00');
    expect(h).not.toMatch(/passou|teto|já passou/);
    expect(h).toContain('cada nota é de uma loja: o limite também');
    expect(h).toContain('sem faturamento lançado nas últimas 4 semanas');
    expect(h).toContain('1 dia sem lançamento completo de faturamento');
    expect(h.match(/Valor aproximado/g)).toHaveLength(1); // dito uma vez, no subtítulo
    expect(h).toContain('Lançar o faturamento'); // a loja sem faturamento leva ao lançamento (quem lança)
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
    expect(h).toContain('title="Receita prevista"');
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

  it('comprador sem meta (sem número): nada de "Valor aproximado" em cima de "Sem número" (M8)', () => {
    const semNumero: OrcamentoDeCompra = { ...resumida, rede: { veReceita: false, saldoCentavos: null, motivo: 'falta a meta do CMV', diasSemLancamento: 0, semNota: [], quemPassou: [] } };
    const h = html(createElement(TelaOrcamento, { dados: semNumero, contexto: 'Rede Completa', bloqueio: null }));
    expect(h).toContain('Sem número');
    expect(h).not.toContain('Valor aproximado');
  });

  it('loja sem número na tabela: a célula diz "sem número" e o motivo vai uma vez, sob o nome, sem nowrap (B2: sem rolagem lateral)', () => {
    const v = (p: Partial<VistaCompleta>): VistaCompleta => ({ veReceita: true, conta: null, motivo: null, previsao: null, previstaCentavos: null, ritmo: null, cmvAteOntemBp: null, compradoCentavos: 0, compradoAteOntemCentavos: 0, receitaAteOntemCentavos: null, diasSemLancamento: 0, semNota: [], quemPassou: [], ...p });
    const motivo = 'sem faturamento lançado nas últimas 4 semanas';
    const dados: OrcamentoDeCompra = {
      periodo: PERIODO,
      hoje: '2026-10-21',
      dia: { dia: 21, de: 31 },
      metaBp: 3000,
      rede: v({ motivo: 'sem o orçamento de Delivery', ritmo: { tipo: 'sem', motivo: 'faltam lançamentos de faturamento', desvioTexto: null } }),
      lojas: [
        { lojaId: 'vp', nome: 'Vila da Penha', vista: v({ conta: { previstaCentavos: 1, metaBp: 3000, tetoCentavos: 1, compradoCentavos: 0, saldoCentavos: 1 } }) },
        { lojaId: 'dl', nome: 'Delivery', vista: v({ motivo, ritmo: { tipo: 'sem', motivo: 'faltam lançamentos de faturamento', desvioTexto: null } }) },
      ],
    };
    const h = html(createElement(TelaOrcamento, { dados, contexto: 'Rede Completa', bloqueio: null, faturamentoHref: '/erp/faturamento/lancar' }));
    const tabela = h.slice(h.indexOf('<table'), h.indexOf('</table>'));
    expect(tabela.split(motivo)).toHaveLength(2); // uma vez só, na tabela
    expect(tabela).toMatch(/<span class="block max-w-\[16rem\][^"]*">sem faturamento lançado/);
    expect(tabela).not.toMatch(/whitespace-nowrap[^>]*>\s*(<[^>]+>)*sem cor/);
    expect(h).toContain('Lançar o faturamento');
    // M6: a rede sem número não deixa espaço em branco na conta
    expect(h).toContain('Sem a conta da rede: sem o orçamento de Delivery.');
  });
});
