import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WidgetCmvHome, ComparacaoCmvHome } from '@/lib/erp/home-cmv';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { CmvDaHomeNaTela } from '../src/components/erp/telas/cmv-da-home';

vi.mock('@/lib/db', () => { throw new Error('A UI não consulta banco.'); });
vi.mock('@/lib/erp/dre', () => { throw new Error('A UI não importa o serviço DRE.'); });

const widget = (): WidgetCmvHome => ({
  familia: 'cmv', titulo: 'CMV', estado: 'parcial', escopo: { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B sintética' },
  valor: { unidade: 'centavos', valor: 175_000 },
  percentual: { pontosBase: 2500, denominador: { unidade: 'centavos', valor: 700_000, rotulo: 'Receita bruta do mesmo recorte do DRE' } },
  referencia: { base: 'periodo_apuracao', rotulo: 'Quinzena de outubro', inicio: '2026-10-16', fim: '2026-10-31', apuradoAte: '2026-10-28' },
  origem: { fonte: 'dre', modo: 'vivo', fotografia: null },
  cobertura: { lojasIncluidas: ['lojab'], lojasElegiveis: 1, diasApurados: 13, diasDoPeriodo: 16, faltasDeFaturamento: 0, custosDoEstoque: null },
  consultadoEm: '2026-10-29T18:00:00.000Z', fonteDoCmv: 'compras', notaDaConta: 'pelas compras: fecha na contagem', semContar: ['parcela sem base sintética'],
  avisos: [{ codigo: 'periodo-em-curso', texto: 'Período em curso: valores até a data apurada.' }],
  detalhe: { href: '/erp/dre?loja=lojab&periodo=2026-10-16', rotulo: 'Ver o CMV no DRE da loja' },
});
const comparacao = (alteracoes: Partial<ComparacaoCmvHome> = {}): ComparacaoCmvHome => ({
  estado: 'com_meta', tipo: 'percentual', metaBp: 3000, metaCentavos: 210_000, desvioBp: -500,
  desvioTexto: '−5,0 pp', semComparacao: null, origemDaMeta: 'loja', versaoDasFaixas: 1, farolAntigo: false,
  farol: { tipo: 'cor', escala: 'custo', cor: 'AZUL', posicao: 1, palavra: 'bem melhor que a meta', confira: 'confira se está tudo lançado', desvioTexto: '−5,0 pp', rotulo: 'Farol: bem melhor que a meta, confira se está tudo lançado, −5,0 pp, faixa 1 de 5' },
  ...alteracoes,
});
const html = (cmv = widget(), compacto = true) => renderToStaticMarkup(createElement(CmvDaHomeNaTela, { cmv, compacto }));
const com = (meta: unknown, modificar: Partial<WidgetCmvHome> = {}) => html(Object.assign({ ...widget(), ...modificar }, { comparacaoComMeta: meta }));
const bloco = (h: string) => /<section aria-label="CMV versus meta"[\s\S]*?<\/section>/.exec(h)?.[0] ?? '';

describe('CMV versus meta · somente apresentação dos dados canônicos', () => {
  it('DTO anterior continua sem bloco de comparação', () => {
    const h = html();
    expect(h).not.toContain('CMV versus meta');
    expect(h).toContain(formatarDinheiro(175_000));
    expect(h).toContain('25,00%');
  });

  it('apresenta realizado, meta, dinheiro, desvio textual e farol do mesmo DTO', () => {
    const h = com(comparacao());
    const b = bloco(h);
    expect(b).toContain('Realizado'); expect(b).toContain('25,00%');
    expect(b).toContain('30,00%'); expect(b).toContain(formatarDinheiro(210_000));
    expect(b).toContain('−5,0 pp'); expect(b).toContain('Meta da loja');
    expect(b).toContain('aria-label="Farol do CMV"');
    expect(b).toContain('aria-label="Farol: bem melhor que a meta, confira se está tudo lançado, −5,0 pp, faixa 1 de 5"');
    expect(b).toContain('bem melhor que a meta');
    expect(b).toContain('confira se está tudo lançado');
    expect(h).not.toMatch(/role="progressbar"|<button|Configurar|Editar meta/);
  });

  it('o desvio é copiado, sem subtração ou reclassificação na apresentação', () => {
    const c = comparacao({ desvioBp: 875, desvioTexto: '+8,75 pp', farol: { tipo: 'sem', motivo: 'faixas não disponíveis nesta leitura', desvioTexto: '+8,75 pp' } });
    const b = bloco(com(c));
    expect(b).toContain('+8,75 pp');
    expect(b).not.toContain('−5,0 pp');
    expect(b).toContain('sem cor: faixas não disponíveis nesta leitura');
  });

  it('meta zero e realizado zero não inventam desvio zero ou cor favorável', () => {
    const c = comparacao({ metaBp: 0, metaCentavos: 0, desvioBp: null, desvioTexto: null, semComparacao: 'sem lançamento', farol: { tipo: 'sem', motivo: 'sem lançamento', desvioTexto: null } });
    const h = com(c, { valor: { unidade: 'centavos', valor: 0 }, percentual: { pontosBase: 0, denominador: { unidade: 'centavos', valor: 700_000, rotulo: 'Receita do recorte' } } });
    const b = bloco(h);
    expect(b.match(/0,00%/g)).toHaveLength(2);
    expect(b).toContain(formatarDinheiro(0));
    expect(b).toContain('Desvio não disponível');
    expect(b).toContain('sem cor: sem lançamento');
    expect(b).not.toMatch(/text-farol-|0,0 pp|Sem meta registrada/);
  });

  it('sem meta é explícito e diferente de meta zero', () => {
    const c = comparacao({ estado: 'sem_meta', metaBp: null, metaCentavos: null, desvioBp: null, desvioTexto: null, semComparacao: null, origemDaMeta: null, farol: null, versaoDasFaixas: null });
    const b = bloco(com(c));
    expect(b).toContain('Sem meta registrada nesta leitura.');
    expect(b).not.toMatch(/0,00%|R\$|text-farol-/);
  });

  it('meta conhecida sem realizado mantém a meta e o motivo canônico, sem percentual falso', () => {
    const c = comparacao({ metaCentavos: null, desvioBp: null, desvioTexto: null, semComparacao: 'sem valor apurado', farol: { tipo: 'sem', motivo: 'sem valor apurado', desvioTexto: null } });
    const b = bloco(com(c, { valor: { unidade: 'centavos', valor: null }, percentual: null, estado: 'sem_base' }));
    expect(b).toContain('30,00%');
    expect(b).toContain('Realizado não disponível');
    expect(b).toContain('Valor da meta não disponível');
    expect(b).toContain('sem cor: sem valor apurado');
    expect(b).not.toMatch(/>0,00%</);
  });

  it.each([[-525, '−5,25%', '−35,3 pp'], [12525, '125,25%', '+95,3 pp']])('realizado %s bp mantém sinal/escala fora de 0–100 sem clamp', (bp, texto, desvio) => {
    const c = comparacao({ desvioBp: bp < 0 ? -3525 : 9525, desvioTexto: desvio, farol: { tipo: 'sem', motivo: 'confira a base desta leitura', desvioTexto: desvio } });
    const b = bloco(com(c, { percentual: { pontosBase: bp, denominador: { unidade: 'centavos', valor: 700_000, rotulo: 'Receita do recorte' } } }));
    expect(b).toContain(texto); expect(b).toContain(desvio);
    expect(b).not.toMatch(/role="progressbar"|max="100"|width:100%/);
  });

  it('fotografia preserva meta/origem do fechamento, período/corte e ressalvas principais', () => {
    const h = com(comparacao({ origemDaMeta: 'fotografia' }), { origem: { fonte: 'dre', modo: 'fotografia', fotografia: { id: 'id-interno-foto', versao: 2, versaoDaConta: 5, fechadaEm: '2026-11-02T12:00:00.000Z' } } });
    expect(h).toContain('Meta da fotografia do fechamento');
    expect(h).toContain('Fotografia versão 2');
    expect(h).toContain('De 16/10/2026 a 31/10/2026');
    expect(h).toContain('Apurado até 28/10/2026');
    expect(h).toContain('Período em curso: valores até a data apurada.');
    expect(h).toContain('Não considerado: parcela sem base sintética.');
    expect(h).toContain('href="/erp/dre?loja=lojab&amp;periodo=2026-10-16"');
    expect(h).not.toMatch(/id-interno-foto|conta versão/);
  });

  it.each([['rede', 'Meta da rede'], [null, 'Origem da meta não informada nesta leitura'] ] as const)('origem %s é literal sem inferência pela seleção da loja', (origemDaMeta, texto) => {
    expect(bloco(com(comparacao({ origemDaMeta })))).toContain(texto);
  });

  it('versão desconhecida conserva farol sem cor e seu motivo', () => {
    const c = comparacao({ versaoDasFaixas: 99, farol: { tipo: 'sem', motivo: 'as faixas deste fechamento são da versão 99, que este sistema não conhece', desvioTexto: '−5,0 pp' } });
    const b = bloco(com(c));
    expect(b).toContain('sem cor: as faixas deste fechamento são da versão 99');
    expect(b).not.toContain('text-farol-');
  });

  it('farolAntigo da receita não remove a cor do CMV canônico, mesmo com estado parcial', () => {
    const b = bloco(com(comparacao({ farolAntigo: true })));
    expect(b).toContain('text-farol-azul');
    expect(b).toContain('bem melhor que a meta');
  });

  it('ausência do farol não é convertida em classificação', () => {
    const b = bloco(com(comparacao({ farol: null })));
    expect(b).toContain('Farol não disponível nesta leitura.');
    expect(b).not.toContain('text-farol-');
  });

  it('comparação indisponível não exibe metadados residuais nem elimina CMV', () => {
    const h = com(comparacao({ estado: 'indisponivel' }));
    expect(bloco(h)).toContain('Comparação indisponível nesta leitura.');
    expect(bloco(h)).not.toMatch(/30,00%|text-farol-/);
    expect(h).toContain(formatarDinheiro(175_000));
    expect(h).toContain('25,00%');
    expect(h).toContain('Período em curso: valores até a data apurada.');
  });

  it.each([null, [], {}, { estado: { toString: null }, tipo: 'percentual' }, { estado: 'com_meta', tipo: 'crescimento' }, { ...comparacao(), metaBp: NaN }, { ...comparacao(), desvioTexto: { reason: 'PRIVADO' } }, { ...comparacao(), farol: { tipo: 'cor', cor: 'ROXO', posicao: 99 } }])('metadata malformada fica isolada da conta principal: %#', (bad) => {
    const h = com(bad);
    expect(bloco(h)).toContain('Comparação indisponível nesta leitura.');
    expect(h).toContain(formatarDinheiro(175_000));
    expect(h).toContain('25,00%');
    expect(h).toContain('Apurado até 28/10/2026');
    expect(h).toContain('Não considerado: parcela sem base sintética.');
    expect(h).toContain('href="/erp/dre?loja=lojab&amp;periodo=2026-10-16"');
    expect(h).not.toContain('PRIVADO');
  });
});
