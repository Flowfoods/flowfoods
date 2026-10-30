import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ComposicaoComprasHome } from '@/lib/erp/home-compras-categorias';
import type { WidgetComprasHome, WidgetProducaoHome } from '@/lib/erp/home-analitico';
import type { WidgetCmvHome } from '@/lib/erp/home-cmv';
import type { PainelDoDia } from '@/lib/erp/painel-do-dia';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { ComprasCategoriasHome } from '../src/components/erp/telas/compras-categorias-home';
import { HubDoParceiro } from '../src/components/erp/telas/hub-do-parceiro';

vi.mock('@/lib/db', () => { throw new Error('UI não consulta banco.'); });
vi.mock('@/lib/erp/compras-relatorio', () => { throw new Error('UI não importa serviço de compras.'); });
vi.mock('@/lib/erp/dre', () => { throw new Error('UI não consulta DRE.'); });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const href = '/erp/compras/relatorios/periodo?loja=lojab&de=2026-10-01&ate=2026-10-30&base=entrada&situacao=lancadas&agrupar=insumo';
const composicao = (): ComposicaoComprasHome => ({
  estado: 'ok', classificacao: 'categoria_atual_do_insumo', totalCentavos: 175_000, quantos: 8,
  fatias: [
    { chave: 'cat1', rotulo: 'Carnes', centavos: 100_000 }, { chave: 'cat2', rotulo: 'Hortifruti', centavos: 25_000 },
    { chave: 'cat3', rotulo: 'Bebidas', centavos: 15_000 }, { chave: 'cat4', rotulo: 'Secos', centavos: 10_000 },
    { chave: 'cat5', rotulo: 'Embalagens', centavos: 10_000 }, { chave: '-', rotulo: 'Sem categoria', centavos: 5_000 },
  ], outros: { quantos: 2, centavos: 10_000 },
  aviso: 'Categorias atuais dos insumos. Esta composição não é uma fotografia histórica.',
  detalhe: { href, rotulo: 'Ver a composição no relatório de compras' },
});
const widget = (): WidgetComprasHome => ({
  familia: 'compras', titulo: 'Compras', estado: 'ok', escopo: { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B sintética' },
  valor: { unidade: 'centavos', valor: 175_000 }, percentual: null,
  referencia: { base: 'mes_civil', rotulo: 'Entrada da nota', inicio: '2026-10-01', fim: '2026-10-30', apuradoAte: '2026-10-30' },
  origem: { fonte: 'compras', modo: 'vivo', fotografia: null }, cobertura: null, consultadoEm: '2026-10-30T12:00:00Z',
  avisos: [], detalhe: { href, rotulo: 'Ver as compras do mesmo recorte' },
  baseDeData: 'entrada', notas: 2, itensCentavos: 170_000, freteCentavos: 5_000, semBase: {}, notasComDesconto: 0,
  composicaoPorCategoria: composicao(),
});
const html = (w = widget()) => renderToStaticMarkup(createElement(ComprasCategoriasHome, { widget: w }));
const painel = (w = widget()): PainelDoDia => ({
  indicadores: [], estados: [], pendencias: [], consultadoEm: w.consultadoEm ?? undefined,
  analitico: { tipo: 'loja', loja: { id: 'lojab', nome: 'Loja B sintética' }, widgets: [w] },
});
const home = (p = painel()) => renderToStaticMarkup(createElement(HubDoParceiro, { titulo: 'Áreas da Rede', subtitulo: 'Parceiro sintético', modulos: [], semAcesso: false, painel: p }));
const bloco = (h: string) => /<section aria-label="Compras por categoria atual"[\s\S]*?<\/section>/.exec(h)?.[0] ?? '';

describe('Home · Compras por categoria atual', () => {
  it('mostra loja, entrada, período, categoria atual e total canônico com frete', () => {
    const h = html();
    for (const texto of ['Loja B sintética', '01/10 a 30/10/2026', 'entrada da nota', 'somente lançadas', 'Categoria atual do insumo.', 'não é uma fotografia histórica', 'itens e frete', 'nem o CMV', formatarDinheiro(175_000)]) expect(h).toContain(texto);
    expect(h).toContain('aria-label="Compras por categoria atual"');
    expect(h).toContain('aria-label="Compras por categoria atual, em reais"');
    expect(h).not.toMatch(/do total|role="progressbar"|<svg.*donut/);
  });

  it('a tabela preserva Sem categoria, Outros, contagem agrupada e total da fonte', () => {
    const h = html();
    expect(h).toContain('<caption'); expect(h).toContain('Valores por categoria atual');
    expect(h).toContain('Sem categoria'); expect(h).toContain('Outros'); expect(h).toContain('2 categorias reunidas');
    expect(h).toContain('8 categorias neste recorte');
    expect(h).toContain('scope="row"'); expect(h).toContain('<tfoot>');
    for (const centavos of [100_000, 25_000, 15_000, 10_000, 5_000]) expect(h).toContain(formatarDinheiro(centavos));
    expect(h).toContain('bg-texto/25');
  });

  it('sete fatias continuam sete: não inventa Outros ou Sem categoria fora do DTO', () => {
    const w = widget(); w.composicaoPorCategoria = { ...composicao(), fatias: Array.from({ length: 7 }, (_,i) => ({ chave: `c${i}`, rotulo: `Categoria ${i}`, centavos: 10 })), outros: null, quantos: 7, totalCentavos: 70 };
    const h = html(w); expect(h).toContain('Categoria 6'); expect(h).toContain('7 categorias neste recorte');
    expect(h).not.toContain('Outros'); expect(h).not.toContain('Sem categoria');
  });

  it('zero confirmado mantém valor zero, diferente de ausência', () => {
    const w = widget(); w.valor.valor = 0; w.composicaoPorCategoria = { ...composicao(), fatias: [{ chave: 'c', rotulo: 'Categoria zero', centavos: 0 }], outros: null, quantos: 1, totalCentavos: 0 };
    const h = html(w); expect(h).toContain(formatarDinheiro(0)); expect(h).toContain('1 categoria neste recorte');
    expect(h).toContain('<table'); expect(h).not.toContain('Nenhuma compra lançada'); expect(h).not.toContain('width:100%');
  });

  it.each(['misto', 'todos negativos'] as const)('valores %s conservam sinal na tabela, sem barras que os reduzam a zero', (tipo) => {
    const w = widget();
    w.composicaoPorCategoria = { ...composicao(), fatias: [{ chave: 'c1', rotulo: 'Ajuste assinado', centavos: -2500 }, { chave: '-', rotulo: 'Sem categoria', centavos: tipo === 'misto' ? 1000 : -1000 }], outros: null, quantos: 2, totalCentavos: tipo === 'misto' ? -1500 : -3500 };
    const h = html(w); expect(h).toContain(formatarDinheiro(-2500)); expect(h).toContain('valores negativos');
    expect(h).toContain('<table'); expect(h).not.toContain('aria-label="Compras por categoria atual, em reais"');
    expect(h).not.toMatch(/<figure|role="progressbar"/);
  });

  it.each(['erro', 'indisponivel'] as const)('%s da composição não expõe números antigos nem afirma ausência de compras', (estado) => {
    const w = widget(); w.composicaoPorCategoria = { ...composicao(), estado, fatias: [{ chave: 'stale', rotulo: 'SENTINELA_ANTIGA', centavos: 1_234_567 }], totalCentavos: 1_234_567, aviso: 'Aviso controlado do DTO.' };
    const h = html(w); expect(h).toContain('Aviso controlado do DTO.'); expect(h).not.toContain('SENTINELA_ANTIGA');
    expect(h).not.toContain(formatarDinheiro(1_234_567)); expect(h).not.toContain('<table');
    expect(h).not.toContain('Nenhuma compra lançada'); expect(h).toContain(estado === 'erro' ? 'Não foi possível carregar' : 'está indisponível');
  });

  it('sem dados não é zero e não monta gráfico ou tabela financeira', () => {
    const w = widget(); w.estado = 'sem_dados'; w.valor.valor = null;
    w.composicaoPorCategoria = { ...composicao(), estado: 'sem_dados', fatias: [], outros: null, quantos: null, totalCentavos: null };
    const h = html(w); expect(h).toContain('Nenhuma compra lançada neste recorte.');
    expect(h).not.toContain(formatarDinheiro(0)); expect(h).not.toContain('<table');
  });

  it('indicador parcial conserva seu estado e os valores explicitamente disponíveis', () => {
    const w = widget(); w.estado = 'parcial'; const h = html(w);
    expect(h).toContain('Indicador de Compras parcial'); expect(h).toContain(formatarDinheiro(175_000));
  });

  it.each(['erro', 'indisponivel', 'sem_base', 'sem_dados'] as const)('indicador %s não deixa composição stale parecer válida', (estado) => {
    const w = widget(); w.estado = estado;
    expect(html(w)).not.toContain(formatarDinheiro(175_000)); expect(html(w)).not.toContain('<table');
  });

  it('DTO antigo sem composição continua sem bloco extra', () => {
    const w = widget(); delete w.composicaoPorCategoria; expect(html(w)).toBe('');
    expect(home(painel(w))).toContain('aria-label="Indicador de Compras"');
    expect(home(painel(w))).not.toContain('aria-label="Compras por categoria atual"');
  });

  it('o destino recebido preserva loja/datas/base e não inventa agrupamento categoria ou links por fatia', () => {
    const w = widget(); w.composicaoPorCategoria!.detalhe.href = href.replace('/erp/', '/rodolfo/erp/parceiro-qa/');
    const h = html(w), links = [...h.matchAll(/<a[^>]*href="([^"]*)"/g)].map(r => r[1].replace(/&amp;/g,'&'));
    expect(links).toEqual([w.composicaoPorCategoria!.detalhe.href]);
    expect(h).toContain('Ver a composição no relatório de compras'); expect(h).not.toContain('agrupar=categoria');
    expect(h).not.toMatch(/<button|<input/);
  });

  it('nome muito longo e HTML são texto escapado com alternativa tabular completa', () => {
    const w = widget(), nome = '<script>Categoria & "segura"</script> '+ 'Categoria comprida sem perder informação '.repeat(8);
    w.composicaoPorCategoria!.fatias[0].rotulo = nome;
    const h = html(w); expect(h).toContain('&lt;script&gt;Categoria &amp; &quot;segura&quot;&lt;/script&gt;'); expect(h).not.toContain('<script>');
    expect(h).toContain('[overflow-wrap:anywhere]'); expect(h).toContain('table-fixed');
  });

  it('metadado incompatível ou valor não finito não derruba a Home nem vira barra', () => {
    const w = widget(); w.composicaoPorCategoria!.fatias[0].centavos = Number.NaN;
    expect(html(w)).toContain('Indisponível'); expect(html(w)).not.toContain('<table');
    expect(home(painel(w))).toContain('aria-label="Indicador de Compras"');
  });
});

describe('Home · integração isolada da composição', () => {
  it('vem após a grade existente e antes das pendências, com um único retry', () => {
    const p = painel(); p.pendencias = [{ chave: 'estoque-nao-aberto', titulo: 'Pendência sintética', texto: 'Conferir.', escopo: 'Loja B', href: '/erp/estoque', acao: 'Ver estoque' }];
    const h = home(p);
    expect(h.indexOf('aria-label="Indicadores da loja"')).toBeLessThan(h.indexOf('aria-label="Compras por categoria atual"'));
    expect(h.indexOf('aria-label="Compras por categoria atual"')).toBeLessThan(h.indexOf('aria-label="Pontos de atenção"'));
    expect(h.match(/Atualizar resumo/g)).toHaveLength(1); expect(h).toContain('xl:grid-cols-6');
  });

  it('erro só da composição preserva o KPI e o CMV/meta existentes', () => {
    const w = widget(); w.composicaoPorCategoria = { ...composicao(), estado: 'erro', totalCentavos: null, fatias: [], outros: null };
    const c: WidgetCmvHome = { ...w, familia: 'cmv', titulo: 'CMV', valor: { unidade: 'centavos', valor: 175_000 }, fonteDoCmv: 'compras', notaDaConta: 'Pelas compras.', semContar: [],
      percentual: { pontosBase: 2500, denominador: { unidade: 'centavos', valor: 700_000, rotulo: 'Receita do DRE' } },
      comparacaoComMeta: { estado: 'com_meta', tipo: 'percentual', metaBp: 3000, metaCentavos: 210_000, desvioBp: -500, desvioTexto: '−5,0 pp', semComparacao: null, origemDaMeta: 'loja', farol: { tipo: 'sem', motivo: 'conferir leitura', desvioTexto: '−5,0 pp' }, versaoDasFaixas: 1, farolAntigo: false } };
    const p = painel(w); p.cmv = c; if(p.analitico?.tipo === 'loja')p.analitico.widgets.push(c);
    const h = home(p); expect(h).toContain('aria-label="Indicador de Compras"'); expect(h).toContain(formatarDinheiro(175_000));
    expect(h).toContain('aria-label="CMV versus meta"'); expect(h).toContain('30,00%'); expect(h).toContain('25,00%');
    expect(bloco(h)).not.toContain('<table'); expect(bloco(h)).not.toContain(formatarDinheiro(175_000));
  });

  it('operador sem widget Compras não recebe a composição ou seus custos', () => {
    const p = painel();
    const operacional: WidgetProducaoHome = { ...widget(), familia: 'producao', titulo: 'Produção', valor: { unidade: 'contagem', valor: 1 }, naLista: 1, semLote: 0, detalhe: { href: '/erp/producao', rotulo: 'Ver produção' } };
    if(p.analitico?.tipo === 'loja')p.analitico.widgets = [operacional];
    const h = home(p); expect(h).not.toContain('Compras por categoria atual'); expect(h).not.toContain('R$'); expect(h).not.toContain('Carnes');
  });

  it('visão Rede conserva resumo, mesmo se um DTO extra de widgets estiver presente', () => {
    const p = painel(); const rede = { tipo: 'rede' as const, widgets: [widget()] }; p.analitico = rede;
    const h = home(p); expect(h).not.toContain('Compras por categoria atual'); expect(h).toContain('Selecione uma loja no topo');
  });
});
