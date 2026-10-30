import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FamiliaDaHome, WidgetHome } from '@/lib/erp/home-contratos';
import type { AnaliticoDaHome, FaturamentoDiarioHome, WidgetAnaliticoHome, WidgetComprasHome, WidgetEstoqueHome, WidgetProducaoHome } from '@/lib/erp/home-analitico';
import type { WidgetCmvHome } from '@/lib/erp/home-cmv';
import type { PainelDoDia } from '@/lib/erp/painel-do-dia';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { HubDoParceiro } from '../src/components/erp/telas/hub-do-parceiro';
import { EvolucaoFaturamentoHome } from '../src/components/erp/telas/evolucao-faturamento-home';

vi.mock('@/lib/db', () => { throw new Error('A composição não consulta banco.'); });
vi.mock('@/lib/erp/dre', () => { throw new Error('A composição não importa o serviço DRE.'); });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const consulta = '2026-10-29T18:00:00.000Z';
const lojaDoWidget = (w: WidgetAnaliticoHome) => ({ id: w.escopo.lojaId, nome: w.escopo.nome });
const FONTES = { faturamento: 'faturamento', cmv: 'dre', compras: 'compras', despesas: 'dre', estoque: 'estoque', producao: 'producao' } as const;
const comum = <F extends FamiliaDaHome>(familia: F): WidgetHome<F> => ({
  familia, titulo: familia, estado: 'ok', escopo: { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B sintética' },
  valor: { unidade: 'centavos', valor: 700_000 }, percentual: null,
  referencia: { base: 'mes_civil', rotulo: '2026-10-01 a 2026-10-29', inicio: '2026-10-01', fim: '2026-10-29', apuradoAte: '2026-10-29' },
  origem: { fonte: FONTES[familia], modo: 'vivo', fotografia: null }, cobertura: null, consultadoEm: consulta, avisos: [],
  detalhe: { href: `/erp/${familia}?loja=lojab`, rotulo: `Ver ${familia}` },
});
const cmv = (): WidgetCmvHome => ({
  ...comum('cmv'), valor: { unidade: 'centavos', valor: 175_000 }, estado: 'parcial',
  percentual: { pontosBase: 2500, denominador: { unidade: 'centavos', valor: 700_000, rotulo: 'Receita bruta do mesmo recorte do DRE' } },
  referencia: { base: 'periodo_apuracao', rotulo: 'Outubro de 2026', inicio: '2026-10-01', fim: '2026-10-31', apuradoAte: '2026-10-28' },
  fonteDoCmv: 'compras', notaDaConta: 'pelas compras: fecha na contagem', semContar: [],
  detalhe: { href: '/erp/dre?loja=lojab&periodo=2026-10-01', rotulo: 'Ver o CMV no DRE da loja' },
});
const compras = (): WidgetComprasHome => ({
  ...comum('compras'), valor: { unidade: 'centavos', valor: 180_000 }, baseDeData: 'entrada', notas: 2,
  itensCentavos: 175_000, freteCentavos: 5_000, semBase: {}, notasComDesconto: 0,
  detalhe: { href: '/erp/compras/relatorios/periodo?loja=lojab&de=2026-10-01&ate=2026-10-29&base=entrada', rotulo: 'Ver compras no relatório' },
});
const estoque = (financeiro = true): WidgetEstoqueHome => ({
  ...comum('estoque'), valor: { unidade: financeiro ? 'centavos' : 'contagem', valor: financeiro ? 123_000 : 42 },
  referencia: { base: 'posicao_atual', rotulo: 'Posição atual', inicio: null, fim: null, apuradoAte: null },
  situacao: 'ABERTO', verValores: financeiro, rotuloDoValor: financeiro ? 'Valor conhecido do estoque' : 'Itens com saldo', itensComSaldo: 42,
  ...(financeiro ? { itensSemCusto: 0 } : {}), contagem: null,
});
const producao = (): WidgetProducaoHome => ({
  ...comum('producao'), valor: { unidade: 'contagem', valor: 2 }, naLista: 2, semLote: 1,
  referencia: { base: 'dia_operacional', rotulo: 'Hoje', inicio: '2026-10-29', fim: '2026-10-29', apuradoAte: null },
  detalhe: { href: '/erp/producao/lista/lojab?dia=2026-10-29', rotulo: 'Ver a lista' },
});
const despesas = (): WidgetHome<'despesas'> => ({
  ...comum('despesas'), estado: 'indisponivel', valor: { unidade: 'centavos', valor: null }, referencia: null, origem: null,
  avisos: [{ codigo: 'composicao-pendente', texto: 'O resumo por competência ainda não está disponível.' }],
  detalhe: { href: '/erp/dre/despesas?loja=lojab', rotulo: 'Ver as despesas' },
});
const diario = (): FaturamentoDiarioHome => ({
  mes: '2026-10', hoje: '2026-10-29', totalCentavos: 700_000, estado: 'parcial', consultadoEm: consulta,
  detalhe: { href: '/erp/faturamento?mes=2026-10&loja=lojab', rotulo: 'Ver o faturamento' },
  serie: {
    canais: ['LOJA'], maximo: 600_000, diasLancados: 3, diasComFalta: 1,
    dias: [
      { data: '2026-10-25', valores: { LOJA: 600_000, DELIVERY_PROPRIO: null, IFOOD: null }, total: 600_000, estado: 'lancado', faltam: [] },
      { data: '2026-10-26', valores: { LOJA: 0, DELIVERY_PROPRIO: null, IFOOD: null }, total: 0, estado: 'lancado', faltam: [] },
      { data: '2026-10-27', valores: { LOJA: 100_000, DELIVERY_PROPRIO: null, IFOOD: null }, total: 100_000, estado: 'falta', faltam: ['IFOOD'] },
      { data: '2026-10-28', valores: { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null }, total: null, estado: 'sem-lancamento', faltam: [] },
      { data: '2026-10-29', valores: { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null }, total: null, estado: 'em-aberto', faltam: [] },
      { data: '2026-10-30', valores: { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null }, total: null, estado: 'futuro', faltam: [] },
    ],
  },
});
type PainelDaFatia = PainelDoDia & { analitico?: AnaliticoDaHome };
const completo = (): PainelDaFatia => {
  const c = cmv();
  return {
    indicadores: [{ chave: 'cardapio', rotulo: 'Pratos prontos para o preço', valor: { tipo: 'fracao', de: 2, total: 3 }, contexto: 'Cadastro da rede', escopo: 'Da rede', href: '/erp/fichas' }],
    estados: [{ chave: 'cardapio', estado: 'ok', rotulo: 'Pratos prontos', escopo: 'Da rede', referencia: 'Situação atual', href: '/erp/fichas', acao: 'Ver as fichas' }],
    pendencias: [{ chave: 'producao-sem-lote', titulo: 'Um pré-preparo sem lote', texto: 'Confira a lista de hoje.', escopo: 'Loja B sintética', href: '/erp/producao/lista/lojab?dia=2026-10-29', acao: 'Ver a lista' }],
    consultadoEm: consulta, cmv: c,
    analitico: { tipo: 'loja', loja: lojaDoWidget(c), widgets: [comum('faturamento'), c, compras(), despesas(), estoque(), producao()], faturamentoDiario: diario() },
  };
};
const html = (painel?: PainelDaFatia, titulo = 'Áreas da Rede') => renderToStaticMarkup(createElement(HubDoParceiro, { titulo, subtitulo: 'Parceiro QA · Loja B sintética', modulos: [], semAcesso: false, painel }));
const htmlDaEvolucao = (leitura = diario()) => renderToStaticMarkup(createElement(EvolucaoFaturamentoHome, { leitura, loja: 'Loja B sintética' }));

describe('H2 · composição de uma loja', () => {
  it('organiza seis famílias, evolução, CMV, operação e atenção sem grade de módulos', () => {
    const h = html(completo());
    expect(h).toContain('Visão geral da operação');
    expect(h).toContain('aria-label="Resumo da operação"');
    expect(h.match(/role="group" aria-label="Indicador de /g)).toHaveLength(6);
    for (const nome of ['Faturamento', 'CMV', 'Compras', 'Despesas', 'Estoque', 'Produção']) expect(h).toContain(`aria-label="Indicador de ${nome}"`);
    expect(h).toContain('aria-label="Evolução do faturamento"');
    expect(h).toContain('aria-label="CMV da loja"');
    expect(h).toContain('aria-label="Operação de hoje"');
    expect(h).toContain('aria-label="Pontos de atenção"');
    expect(h).not.toContain('aria-label="Em uso"');
    expect(h).toContain('xl:grid-cols-6');
    expect(h).toContain('ff-identidade-modulo ff-cartao-modulo');
  });

  it('mantém Despesas indisponível sem transformar ausência em zero ou a pagar', () => {
    const p = completo();
    p.analitico = { tipo: 'loja', loja: { id: 'lojab', nome: 'Loja B sintética' }, widgets: [despesas()] };
    p.cmv = undefined; p.indicadores = []; p.estados = []; p.pendencias = [];
    const h = html(p);
    expect(h).toContain('Indisponível');
    expect(h).toContain('O resumo por competência ainda não está disponível.');
    expect(h).toContain('Valor não disponível');
    expect(h).not.toMatch(/R\$|a pagar|CMV da loja|Evolução do faturamento/);
  });

  it('Cardápio fica secundário Da rede e não ocupa a família CMV', () => {
    const h = html(completo());
    expect(h).toContain('aria-label="Cardápio da rede"');
    expect(h).toContain('Da rede · situação do cadastro');
    expect(h.indexOf('aria-label="CMV da loja"')).toBeLessThan(h.indexOf('aria-label="Cardápio da rede"'));
    expect(h).toContain('25,00%');
    expect(h).toContain('2 de 3');
  });

  it('operador só recebe a família Produção, sem nomes de indicadores financeiros ou custos', () => {
    const p: PainelDaFatia = { indicadores: [], pendencias: [], consultadoEm: consulta, analitico: { tipo: 'loja', loja: { id: 'lojab', nome: 'Loja B' }, widgets: [producao()] } };
    const h = html(p);
    expect(h.match(/role="group" aria-label="Indicador de /g)).toHaveLength(1);
    expect(h).toContain('Indicador de Produção');
    expect(h).not.toMatch(/R\$|Indicador de CMV|Indicador de Despesas|Indicador de Compras|Cardápio da rede|Evolução do faturamento|itens sem custo/);
  });

  it('estoque operacional mostra contagem, sem ler custo técnico zero ou campo financeiro extra', () => {
    const w = { ...estoque(false), itensSemCusto: 999 };
    const p: PainelDaFatia = { indicadores: [], pendencias: [], analitico: { tipo: 'loja', loja: lojaDoWidget(w), widgets: [w] } };
    const h = html(p);
    expect(h).toContain('Itens com saldo');
    expect(h).toContain('42 itens com saldo');
    expect(h).not.toMatch(/R\$|999|itens sem custo/);
  });

  it('estoque não aberto e produção vazia não inventam reais ou conclusão', () => {
    const w: WidgetEstoqueHome = { ...estoque(), situacao: 'NAO_ABERTO', estado: 'sem_base', valor: { unidade: 'centavos', valor: null }, itensComSaldo: null };
    const pr: WidgetProducaoHome = { ...producao(), naLista: 0, semLote: 0, valor: { unidade: 'contagem', valor: 0 }, estado: 'sem_dados' };
    const p: PainelDaFatia = { indicadores: [], pendencias: [], analitico: { tipo: 'loja', loja: lojaDoWidget(w), widgets: [w, pr] } };
    const h = html(p);
    expect(h).toContain('Estoque ainda não aberto');
    expect(h.replace(/<[^>]+>/g, '')).toContain('0 pré-preparos na lista.');
    expect(h).not.toMatch(/R\$|concluído|saudável|abaixo do mínimo|progressbar/);
  });

  it('mantém avisos de estoque/produtividade na operação e sem meta ou contagem concluída falsa', () => {
    const w = { ...estoque(), estado: 'parcial' as const, avisos: [{ codigo: 'custo', texto: 'Há itens sem custo; valor conhecido parcial.' }] };
    const p: PainelDaFatia = { indicadores: [], pendencias: [], analitico: { tipo: 'loja', loja: lojaDoWidget(w), widgets: [w] } };
    const h = html(p);
    expect(h).toContain('Há itens sem custo; valor conhecido parcial.');
    expect(h).not.toMatch(/Meta|saúde do estoque|taxa de conclusão/);
  });

  it('compras conserva total entregue, datas/base e link exatos do relatório', () => {
    const h = html(completo());
    expect(h).toContain(formatarDinheiro(180_000));
    expect(h).toContain('Total entregue · itens e frete');
    expect(h).toContain('01/10 a 29/10/2026 · entrada da nota');
    expect(h).toContain('href="/erp/compras/relatorios/periodo?loja=lojab&amp;de=2026-10-01&amp;ate=2026-10-29&amp;base=entrada"');
    expect(h).not.toContain('2026-10-01 a 2026-10-29');
  });

  it('espelho preserva nome do parceiro e todos os links autorizados fornecidos no DTO', () => {
    const p = completo();
    if (p.analitico?.tipo !== 'loja') throw new Error('fixture');
    p.analitico.widgets = p.analitico.widgets.map((w) => ({ ...w, detalhe: { ...w.detalhe, href: w.detalhe.href.replace('/erp/', '/rodolfo/erp/parceiro-qa/') } }));
    const h = html(p, 'Parceiro QA');
    expect(h).toContain('Parceiro QA · Parceiro QA · Loja B sintética');
    expect(h).toContain('href="/rodolfo/erp/parceiro-qa/compras/relatorios/periodo');
  });

  it('loja sem widgets tem estado vazio explícito, sem grade ou retry sem fontes', () => {
    const p: PainelDaFatia = { indicadores: [], pendencias: [], analitico: { tipo: 'loja', loja: { id: 'lojab', nome: 'Loja B' }, widgets: [] } };
    const h = html(p);
    expect(h).toContain('Não há indicadores disponíveis no seu acesso a esta loja.');
    expect(h).not.toMatch(/Indicador de|Atualizar resumo|aria-label="Em uso"/);
  });

  it('Rede e chamadas antigas conservam o resumo existente sem simular seis famílias', () => {
    const p: PainelDaFatia = { indicadores: [], pendencias: [], analitico: { tipo: 'rede' } };
    const h = html(p);
    expect(h).toContain('Selecione uma loja no topo');
    expect(h).toContain('Áreas da Rede');
    expect(h).not.toContain('Indicadores da loja');
    expect(html()).toContain('Áreas da Rede');
    expect(html()).not.toContain('Selecione uma loja');
  });

  it('retry único fora de links permanece presente com erro isolado, sem região toda live', () => {
    const p = completo();
    if (p.analitico?.tipo !== 'loja') throw new Error('fixture');
    p.analitico.faturamentoDiario = { ...diario(), estado: 'erro', serie: null, totalCentavos: null };
    const h = html(p);
    expect(h.match(/>Atualizar resumo</g)).toHaveLength(1);
    expect(h).toContain('Não foi possível carregar a evolução');
    expect(h).toContain(formatarDinheiro(180_000));
    expect(h).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button/);
    expect(h).not.toMatch(/<section[^>]+aria-live/);
    expect(h).toContain('Resumo consultado em');
  });
});

describe('Evolução canônica e tabela', () => {
  it('mostra a mesma série por canal, com zero declarado, lacunas e falta parcial sem curva interpolada', () => {
    const h = htmlDaEvolucao();
    const tabela = h.slice(h.indexOf('<table'), h.indexOf('</table>'));
    expect(tabela).toContain(formatarDinheiro(600_000));
    expect(tabela).toContain(formatarDinheiro(100_000));
    expect(tabela).toContain(formatarDinheiro(0));
    expect(tabela).toContain('sem lançamento');
    expect(tabela).toContain('hoje, ainda em aberto');
    expect(tabela).toContain('ainda não chegou');
    expect(tabela).toContain('Falta lançar: iFood.');
    expect(h).toContain('tabindex="0"');
    expect(h).toContain('Ver em tabela');
    expect(h).not.toMatch(/<polyline|Receita x despesas|forecast/);
  });

  it.each(['erro', 'indisponivel', 'sem_base'] as const)('%s não prova ausência de lançamentos e não desenha série residual', (estado) => {
    const h = htmlDaEvolucao({ ...diario(), estado, totalCentavos: null });
    expect(h).toContain('valor não disponível');
    expect(h).not.toMatch(/sem lançamentos|Ainda não há lançamentos|<table|<svg/);
  });

  it('sem dados é ausência, mas zero com série é valor informado', () => {
    const vazio = htmlDaEvolucao({ ...diario(), estado: 'sem_dados', totalCentavos: null, serie: null });
    expect(vazio).toContain('sem lançamentos');
    expect(vazio).toContain('Ainda não há lançamentos');
    const d = diario();
    d.totalCentavos = 0; d.estado = 'ok';
    d.serie = { ...d.serie!, dias: [d.serie!.dias[1]], maximo: 0, diasLancados: 1, diasComFalta: 0 };
    const zero = htmlDaEvolucao(d);
    expect(zero).toContain(formatarDinheiro(0));
    expect(zero).toContain('<table');
    expect(zero).not.toContain('Ainda não há lançamentos');
  });
});
