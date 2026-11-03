import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { montarDre, type DespesaApropriada } from '@/lib/erp/dre-campos';
import { PLANO_PADRAO, planoEfetivo, type LinhaDoBanco } from '@/lib/erp/dre-plano';
import type { DreDoPeriodo } from '@/lib/erp/dre';
import type { Alcance } from '@/lib/erp/permissoes';
import { resolverAlcance } from '@/lib/erp/permissoes';
import type { ContextoHomeLoja } from '@/lib/erp/home-analitico';
import { despesasDaHome, type WidgetDespesasHome } from '@/lib/erp/home-despesas';
import type { PainelDoDia } from '@/lib/erp/painel-do-dia';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { ajudaParaATela } from '@/lib/erp/ajuda';
import { HubDoParceiro } from '../src/components/erp/telas/hub-do-parceiro';
import { DespesasDaHomeNaTela } from '../src/components/erp/telas/despesas-da-home';

vi.mock('@/lib/db', () => { throw new Error('A apresentação não consulta banco.'); });
vi.mock('@/lib/erp/dre', () => { throw new Error('A apresentação não importa o serviço DRE.'); });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const consulta = '2026-10-29T18:00:00.000Z';
const loja = { id: 'lojab', nome: 'Loja B sintética', ativa: true, canais: ['LOJA' as const] };
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const contexto = (alcance: Alcance = dono): ContextoHomeLoja => ({ alcance, loja: { id: loja.id, nome: loja.nome }, raiz: '/erp', hoje: '2026-10-29', consultadoEm: consulta });
const plano = planoEfetivo(PLANO_PADRAO.map((p, i): LinhaDoBanco => ({ id: 'l' + p.codigo.replace(/-/g, ''), codigo: p.codigo, nome: p.nome, grupo: p.grupo, calculada: p.calculada, sentido: p.sentido, ordem: (i + 1) * 10, ativa: true, atualizadoEm: new Date('2026-10-01T12:00:00.000Z') })));
const DESPESAS: DespesaApropriada[] = [
  { linhaId: 'laluguel', lojaId: 'lojab', centavos: 280_000 },
  { linhaId: 'lsalarios', lojaId: 'lojab', centavos: 451_613 },
  { linhaId: 'linternet', lojaId: 'lojab', centavos: 14_000 },
  { linhaId: 'limpostos', lojaId: 'lojab', centavos: 45_161 },
  { linhaId: 'lenergia', lojaId: null, centavos: 99_900 },
];
function dre(alteracoes: Partial<DreDoPeriodo> = {}, despesas = DESPESAS): DreDoPeriodo {
  const escopo = { tipo: 'loja', lojaId: loja.id, nome: loja.nome } as const;
  const cmv = { lojas: [{ lojaId: loja.id, lojaNome: loja.nome, compraCentavos: 35_000, real: null, motivoSemReal: 'estoque não aberto' }], parcial: true };
  const resultado = montarDre({ escopo, plano, despesas, cmv, taxaIfood: null, receitas: [{ lojaId: loja.id, canal: 'LOJA', valorCentavos: 1_000_000 }] });
  return {
    periodo: { inicio: '2026-10-01', fim: '2026-10-31', nome: 'Outubro de 2026' }, hoje: '2026-10-29', ate: '2026-10-28', emCurso: true, encerrado: false,
    diasDoPeriodo: 31, diaDeHoje: 29, diasApurados: 28, status: null, escopo, resultado, porLoja: null, faltas: { total: 0 }, faltaLancar: [],
    taxaConfigurada: false, anterior: null, proximo: null, lojasDoEscopo: [loja], metas: {}, anoPassado: null, fechamento: null,
    cmv: { antigo: false, painel: null }, cmvDasLojas: cmv, metaDoCmvDaLoja: null, lojasComMetaPropria: [], trocasDeCusto: [],
    farol: {} as DreDoPeriodo['farol'], farolAntigo: false, canais: [], ...alteracoes,
  };
}
const TOTAL = 280_000 + 451_613 + 14_000;
const widget = (d: DreDoPeriodo = dre(), alcance: Alcance = dono) => despesasDaHome({ estado: 'lido', dre: d }, contexto(alcance))!;
const painel = (w: WidgetDespesasHome): PainelDoDia => ({ indicadores: [], pendencias: [], consultadoEm: consulta, analitico: { tipo: 'loja', loja: { id: loja.id, nome: loja.nome }, widgets: [w] } });
const html = (w: WidgetDespesasHome) => renderToStaticMarkup(createElement(HubDoParceiro, { titulo: 'Áreas da Rede', subtitulo: 'Parceiro QA · Loja B sintética', modulos: [], semAcesso: false, painel: painel(w) }));
const doPainel = (w: WidgetDespesasHome) => renderToStaticMarkup(createElement(DespesasDaHomeNaTela, { widget: w }));
const texto = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ZERO = formatarDinheiro(0);
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('Despesas na Home · apresentação', () => {
  it('card e painel com total, recorte, grupos em tabela, selo Parcial, origem, período e link do mesmo período', () => {
    const w = widget();
    const h = html(w);
    expect(h).toContain('aria-label="Indicador de Despesas"');
    expect(h).toContain('aria-label="Despesas da loja"');
    expect(h).toContain('data-valor-monetario="' + formatarDinheiro(TOTAL) + '"');
    expect(h.match(/No período do DRE · sem CMV e deduções/g)).toHaveLength(2);
    expect(h).toContain('Parcial');
    expect(h).toContain('<caption class="mb-2 text-left font-semibold text-texto">Despesas por grupo do DRE</caption>');
    const corpo = h.slice(h.indexOf('<tbody>'), h.indexOf('</tbody>'));
    expect(corpo.match(/<tr[ >]/g)).toHaveLength(8 + 3); // os oito grupos e as três linhas com valor
    for (const rotulo of ['Despesas variáveis', 'Pessoal', 'Ocupação', 'Utilidades', 'Administrativas', 'Marketing', 'Outras despesas', 'Financeiras']) expect(corpo).toContain(`>${rotulo}</th>`);
    expect(corpo).toContain(formatarDinheiro(280_000));
    expect(corpo).toContain(formatarDinheiro(451_613));
    expect(corpo).toContain(formatarDinheiro(14_000));
    expect(h).toContain('Período de apuração · Outubro de 2026');
    expect(h).toContain('De 01/10/2026 a 31/10/2026');
    expect(h).toContain('Apurado até 28/10/2026');
    expect(h).toContain('DRE até 28/10');
    expect(h).toContain('Fonte: DRE da loja · leitura ao vivo');
    expect(h).toContain('Cobertura: 28 de 31 dias apurados nesta loja.');
    expect(h).toContain('href="/erp/dre?loja=lojab&amp;periodo=2026-10-01"');
    expect(h).toContain('Ver as despesas no DRE da loja');
    expect(h).toContain('Resumo consultado em');
    // O aviso aparece uma vez (no painel), sem bloco de Atenção ou pendência nova.
    expect(h.match(/Período em curso: as despesas entram dia a dia/g)).toHaveLength(1);
    expect(h).not.toMatch(/Atenção|Pontos de atenção/);
    // "Conferir este valor" só nas linhas do painel (decisão 517): nunca no card da faixa, que já é um link.
    const card = h.slice(h.indexOf('aria-label="Indicador de Despesas"'), h.indexOf('</a>', h.indexOf('aria-label="Indicador de Despesas"')));
    expect(card).not.toContain('Conferir');
    expect(h.match(/>Conferir este valor<\/a>/g)).toHaveLength(3);
  });

  it('decisão 517: cada grupo lista as linhas com valor e cada linha abre a composição dela no mesmo recorte e loja, com volta para a Home', () => {
    const h = doPainel(widget());
    const corpo = h.slice(h.indexOf('<tbody>'), h.indexOf('</tbody>'));
    const linhas = corpo.match(/<tr data-linha-do-grupo="[A-Z_]+"/g)!.map((x) => x.slice(25, -1));
    expect(linhas).toEqual(['PESSOAL', 'OCUPACAO', 'UTILIDADES']);
    for (const [grupo, nome, id, centavos] of [['Pessoal', 'Salários', 'lsalarios', 451_613], ['Ocupação', 'Aluguel', 'laluguel', 280_000], ['Utilidades', 'Internet e telefone', 'linternet', 14_000]] as const) {
      expect(corpo).toContain(`<span class="sr-only">${grupo}: </span>${nome}`);
      const link = new RegExp(`<a aria-label="${escapar(`Conferir este valor: ${nome}, ${formatarDinheiro(centavos)}`)}"[^>]*href="${escapar(`/erp/dre/despesas?linha=${id}&amp;de=2026-10-01&amp;ate=2026-10-28&amp;loja=lojab&amp;volta=%2Ferp`)}">Conferir este valor</a>`);
      expect(corpo).toMatch(link);
    }
    // O total e os grupos não têm composição própria: nenhum link no rodapé nem na linha do grupo.
    const rodape = h.slice(h.indexOf('<tfoot>'), h.indexOf('</tfoot>'));
    expect(rodape).not.toContain('<a');
    expect(corpo.match(/<a /g)).toHaveLength(3);
    expect(h).toContain('Conferir este valor abre as despesas que formam a linha, nesta loja e neste período. Os grupos e o total são a soma dessas linhas.');
    expect(h).not.toContain('Período fechado: os valores vêm da fotografia');
    // Espelho do nível 1: a mesma tela, com a raiz do parceiro e a volta para a Home dele.
    const n1 = renderToStaticMarkup(createElement(DespesasDaHomeNaTela, { widget: despesasDaHome({ estado: 'lido', dre: dre() }, { ...contexto(), raiz: '/rodolfo/erp/casa-alfa' })! }));
    expect(n1).toContain('href="/rodolfo/erp/casa-alfa/dre/despesas?linha=laluguel&amp;de=2026-10-01&amp;ate=2026-10-28&amp;loja=lojab&amp;volta=%2Frodolfo%2Ferp%2Fcasa-alfa"');
    expect(n1).not.toContain('href="/erp/');
  });

  it('decisão 517: DTO com linhas que não somam o grupo, linha repetida ou link de fora vira indisponível, sem link', () => {
    const w = widget();
    const trocar = (f: (g: WidgetDespesasHome['composicaoPorGrupo'] & object) => WidgetDespesasHome['composicaoPorGrupo']) => ({ ...w, composicaoPorGrupo: f(w.composicaoPorGrupo!) });
    const naOcupacao = (mudar: (l: { chave: string; nome: string; centavos: number; conferir: string | null }[]) => unknown[]) =>
      trocar((c) => ({ ...c, grupos: c.grupos.map((g) => (g.grupo === 'OCUPACAO' ? { ...g, linhas: mudar(g.linhas) as typeof g.linhas } : g)) }));
    for (const ruim of [
      naOcupacao((ls) => ls.map((l) => ({ ...l, centavos: l.centavos + 1 }))), // linhas não somam o grupo
      naOcupacao(() => []), // grupo com lançamento sem linha
      naOcupacao((ls) => [...ls, { ...ls[0], centavos: 0 }]), // linha zerada
      naOcupacao((ls) => ls.map((l) => ({ ...l, conferir: 'https://fora.test/erp/dre/despesas?linha=x&de=1' }))),
      naOcupacao((ls) => ls.map((l) => ({ ...l, conferir: '//fora.test/erp/dre/despesas?linha=x&de=1' }))),
      naOcupacao((ls) => ls.map((l) => ({ ...l, chave: 'salarios' }))), // a mesma linha em dois grupos
      trocar((c) => ({ ...c, grupos: c.grupos.map((g) => (g.grupo === 'MARKETING' ? { ...g, linhas: [{ chave: 'marketing', nome: 'Marketing', centavos: 1, conferir: null }] } : g)) })),
    ]) {
      const h = doPainel(ruim);
      expect(h).toContain('As despesas estão indisponíveis nesta leitura.');
      expect(h).not.toMatch(/<table|Conferir este valor|dre\/despesas\?linha/);
      expect(texto(html(ruim))).not.toMatch(/R\$/);
    }
  });

  it('decisão 517: sem link quando não há leitura ao vivo, mesmo que o DTO traga o endereço', () => {
    const w = widget();
    const foto = { ...w, origem: { fonte: 'dre' as const, modo: 'fotografia' as const, fotografia: { id: 'f', versao: 1, versaoDaConta: 1, fechadaEm: '2026-11-02T12:00:00.000Z' } } };
    const h = doPainel(foto);
    expect(h).toContain(formatarDinheiro(280_000));
    expect(h).toContain('<span class="sr-only">Ocupação: </span>Aluguel');
    expect(h).not.toMatch(/Conferir este valor<\/a>|dre\/despesas\?linha/);
    expect(h).toContain('Período fechado: os valores vêm da fotografia do fechamento. Conferir este valor não aparece');
  });

  it('não mostra CMV, deduções nem a despesa da rede; grupo sem lançamento é "—", nunca R$ 0,00', () => {
    const h = doPainel(widget());
    expect(texto(h)).not.toContain(ZERO);
    expect(h).not.toMatch(new RegExp([35_000, 45_161, 99_900].map(formatarDinheiro).map((v) => v.replace(/[$.]/g, '\\$&')).join('|')));
    expect(h).toContain('<span class="sr-only">Sem lançamento</span>');
    expect(h).toContain(formatarDinheiro(TOTAL));
  });

  it('sem dados (nenhum lançamento ou nenhum dia apurado) não desenha tabela nem R$ 0,00', () => {
    for (const d of [dre({}, [{ linhaId: 'limpostos', lojaId: 'lojab', centavos: 45_161 }]), dre({ ate: null, diasApurados: 0, diaDeHoje: 1 }, [])]) {
      const w = widget(d);
      expect(w.estado).toBe('sem_dados');
      const h = html(w);
      expect(h).toContain('Sem despesas apuradas nesta leitura.');
      expect(h).toContain('Sem dados');
      expect(h).not.toContain('<table');
      expect(texto(h)).not.toMatch(/R\$/);
      expect(h).not.toMatch(/Conferir este valor|dre\/despesas\?linha/);
    }
  });

  it.each(['erro', 'indisponivel'] as const)('%s: mensagem própria, sem valor, sem tabela', (estado) => {
    const w = despesasDaHome({ estado }, contexto())!;
    const h = html(w);
    expect(h).toContain(estado === 'erro' ? 'Não foi possível carregar as despesas desta loja.' : 'As despesas estão indisponíveis nesta leitura.');
    expect(h).not.toContain('<table');
    expect(texto(h)).not.toMatch(/R\$/);
    expect(h).toContain('href="/erp/dre?loja=lojab"');
    expect(h).not.toMatch(/Conferir este valor|dre\/despesas\?linha/);
  });

  it('quem só lança despesas (sem dre.ver) vê o marcador: sem painel, sem grupos e sem valores', () => {
    const operador: Alcance = { nivel: 'LOJA', lojas: ['lojab'], permissoes: new Set(['despesas.lancar']) };
    const w = widget(dre(), operador);
    const h = html(w);
    expect(h).toContain('aria-label="Indicador de Despesas"');
    expect(h).not.toContain('aria-label="Despesas da loja"');
    expect(h).toContain('O total de despesas por competência ainda não está disponível neste resumo.');
    expect(h).toContain('href="/erp/dre/despesas?loja=lojab"');
    expect(h).not.toMatch(/R\$|<table|No período do DRE · sem CMV|Ocupação|Pessoal|Conferir este valor|dre\/despesas\?linha/);
  });

  it('DTO incompatível (total diferente da soma ou grupos faltando) vira indisponível, sem números', () => {
    const w = widget();
    for (const ruim of [
      { ...w, valor: { unidade: 'centavos' as const, valor: TOTAL + 1 } },
      { ...w, composicaoPorGrupo: { ...w.composicaoPorGrupo!, grupos: w.composicaoPorGrupo!.grupos.slice(1) } },
      { ...w, composicaoPorGrupo: { ...w.composicaoPorGrupo!, grupos: w.composicaoPorGrupo!.grupos.map((g) => g.grupo === 'MARKETING' ? { ...g, centavos: 0, comLancamento: true } : g).reverse() } },
    ]) {
      const h = doPainel(ruim);
      expect(h).toContain('As despesas estão indisponíveis nesta leitura.');
      expect(h).toContain('Indisponível');
      expect(h).not.toContain('<table');
      expect(texto(h)).not.toMatch(/R\$/);
    }
  });

  it('o card da faixa usa a mesma guarda: DTO incompatível mostra indisponível, sem número nem Parcial', () => {
    const w = widget();
    expect(w.estado).toBe('parcial');
    const card = (h: string) => h.slice(h.indexOf('aria-label="Indicador de Despesas"'), h.indexOf('</a>', h.indexOf('aria-label="Indicador de Despesas"')));
    const valido = card(html(w));
    expect(valido).toContain('data-valor-monetario="' + formatarDinheiro(TOTAL) + '"');
    expect(valido).toContain('>Parcial<');
    for (const ruim of [
      { ...w, valor: { unidade: 'centavos' as const, valor: TOTAL + 1 } },
      { ...w, composicaoPorGrupo: { ...w.composicaoPorGrupo!, grupos: w.composicaoPorGrupo!.grupos.slice(1) } },
    ]) {
      const h = html(ruim);
      const c = card(h);
      expect(c).toContain('>Indisponível<');
      expect(c).toContain('Valor não disponível');
      expect(c).not.toMatch(/data-valor-monetario|R\$|>Parcial</);
      expect(h).not.toContain(formatarDinheiro(TOTAL + 1));
      expect(texto(h)).not.toMatch(/R\$/);
    }
  });

  it('fechado: fotografia do fechamento com versão e data; valores negativos mantêm o sinal', () => {
    const d = dre({ emCurso: false, encerrado: true, ate: '2026-10-31', diasApurados: 31, diaDeHoje: null, status: 'FECHADO', fechamento: {
      versao: 2, fotografiaId: 'foto-b', versaoDaConta: 5, fechadoEm: new Date('2026-11-02T12:00:00.000Z'), fechadoPorNome: 'Autor privado',
      ressalvas: [], totalDeRessalvas: 0, justificativa: 'Justificativa privada',
    } }, [{ linhaId: 'ldiversas', lojaId: 'lojab', centavos: -5_000 }, { linhaId: 'laluguel', lojaId: 'lojab', centavos: 2_000 }]);
    const w = widget(d);
    expect(w.estado).toBe('ok');
    const h = doPainel(w);
    expect(h).toContain('Fonte: DRE da loja · fotografia do fechamento');
    expect(h).toContain('Fotografia versão 2 · fechada em');
    expect(h).toContain('Disponível');
    expect(h).toContain(formatarDinheiro(-5_000));
    expect(h).toContain(formatarDinheiro(-3_000));
    expect(h).toContain('Há valores negativos nesta composição');
    expect(h).not.toMatch(/Autor privado|Justificativa privada/);
    // Decisão 517: a fotografia mostra as linhas, sem "Conferir este valor" (a composição lê ao vivo), e diz por quê.
    expect(h).toContain('<span class="sr-only">Outras despesas: </span>Despesas diversas');
    expect(h).not.toMatch(/Conferir este valor<\/a>|dre\/despesas\?linha/);
    expect(h).toContain('Período fechado: os valores vêm da fotografia do fechamento.');
  });

  it('a ajuda das Despesas acompanha dre.ver; quem só lança não recebe o bloco', () => {
    const inicio = (permissoes: Set<'dre.ver' | 'despesas.lancar'>) => ajudaParaATela({ nivel: 'LOJA', lojas: ['lojab'], permissoes }).find((e) => e.chave === 'inicio')!;
    expect(inicio(new Set(['dre.ver'])).secoes?.find((s) => s.id === 'despesas-da-loja')?.blocos).toHaveLength(4);
    expect(inicio(new Set(['despesas.lancar'])).secoes?.some((s) => s.id === 'despesas-da-loja')).toBe(false);
    expect(inicio(new Set()).secoes?.some((s) => s.id === 'despesas-da-loja')).toBe(false);
  });
});
