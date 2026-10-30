import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WidgetCmvHome } from '@/lib/erp/home-cmv';
import type { IndicadorDoDia, PendenciaDoDia } from '@/lib/erp/painel-do-dia';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { CmvDaHomeNaTela } from '../src/components/erp/telas/cmv-da-home';
import { PainelDoDiaNaTela } from '../src/components/erp/telas/painel-do-dia';

vi.mock('@/lib/erp/dre', () => { throw new Error('A UI não importa o serviço DRE.'); });
vi.mock('@/lib/db', () => { throw new Error('A UI não acessa banco.'); });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const consulta = '2026-10-29T18:00:00.000Z';
const widget = (mudar: Partial<WidgetCmvHome> = {}): WidgetCmvHome => ({
  familia: 'cmv', titulo: 'CMV', estado: 'parcial',
  escopo: { tipo: 'loja', lojaId: 'lojab', nome: 'Loja B sintética' },
  valor: { unidade: 'centavos', valor: 175_000 },
  percentual: { pontosBase: 2500, denominador: { unidade: 'centavos', valor: 700_000, rotulo: 'Receita bruta do mesmo recorte do DRE' } },
  referencia: { base: 'periodo_apuracao', rotulo: 'Outubro de 2026', inicio: '2026-10-01', fim: '2026-10-31', apuradoAte: '2026-10-28' },
  origem: { fonte: 'dre', modo: 'vivo', fotografia: null },
  cobertura: { lojasIncluidas: ['lojab'], lojasElegiveis: 1, diasApurados: 28, diasDoPeriodo: 31, faltasDeFaturamento: 0, custosDoEstoque: null },
  consultadoEm: consulta, fonteDoCmv: 'compras', notaDaConta: 'pelas compras: fecha na contagem', semContar: [],
  avisos: [{ codigo: 'periodo-em-curso', texto: 'Período em curso: valores até a data apurada.' }],
  detalhe: { href: '/erp/dre?loja=lojab&periodo=2026-10-01', rotulo: 'Ver o CMV no DRE da loja' },
  ...mudar,
});
const htmlDoCmv = (cmv = widget()) => renderToStaticMarkup(createElement(CmvDaHomeNaTela, { cmv }));
const painel = (cmv?: WidgetCmvHome) => ({ indicadores: [] as IndicadorDoDia[], pendencias: [] as PendenciaDoDia[], ...(cmv ? { cmv } : {}) });
const htmlDoPainel = (p = painel(widget())) => renderToStaticMarkup(createElement(PainelDoDiaNaTela, { painel: p }));
const indisponivel = (estado: 'erro' | 'indisponivel'): WidgetCmvHome => widget({
  estado, valor: { unidade: 'centavos', valor: null }, percentual: null, referencia: null, origem: null, cobertura: null,
  fonteDoCmv: null, notaDaConta: null, semContar: [],
  avisos: [{ codigo: estado, texto: estado === 'erro' ? 'Não foi possível carregar o CMV.' : 'O CMV não está disponível neste resumo.' }],
  detalhe: { href: '/erp/dre?loja=lojab', rotulo: 'Ver o DRE atual da loja' },
});

describe('CMV na Home · apresentação de uma loja, sem conta ou consulta nova', () => {
  it('mostra centavos/bp/denominador, calendário e origem de compra do DTO', () => {
    const html = htmlDoCmv();
    expect(html).toContain('<section aria-label="CMV da loja"');
    expect(html).toContain('Loja B sintética');
    expect(html).toContain(formatarDinheiro(175_000));
    expect(html).toContain('25,00%');
    expect(html).toContain(formatarDinheiro(700_000));
    expect(html).toContain('Receita bruta do mesmo recorte do DRE');
    expect(html).toContain('De 01/10/2026 a 31/10/2026');
    expect(html).toContain('Apurado até 28/10/2026');
    expect(html).toContain('Pelas compras');
    expect(html).toContain('pelas compras: fecha na contagem');
    expect(html).toContain('leitura ao vivo');
    expect(html).toContain('28 de 31 dias apurados nesta loja');
    expect(html).toContain('href="/erp/dre?loja=lojab&amp;periodo=2026-10-01"');
  });

  it('percentual é o bp recebido, sem reconstruí-lo pelo dinheiro', () => {
    const html = htmlDoCmv(widget({ percentual: { pontosBase: 4123, denominador: { unidade: 'centavos', valor: 700_000, rotulo: 'Receita do recorte' } } }));
    expect(html).toContain('41,23%');
    expect(html).not.toContain('25,00%');
  });

  it('preserva valor e percentual negativos, sem clamp, módulo ou sinal de sucesso', () => {
    const html = htmlDoCmv(widget({
      valor: { unidade: 'centavos', valor: -1234 }, percentual: { pontosBase: -176, denominador: { unidade: 'centavos', valor: 700_000, rotulo: 'Receita do recorte' } },
      fonteDoCmv: 'real', notaDaConta: 'real (contagem)', estado: 'ok', avisos: [],
    }));
    expect(html).toContain(formatarDinheiro(-1234));
    expect(html).toContain('−1,76%');
    expect(html).toContain('Real (consumo apurado)');
    expect(html).not.toMatch(/Meta|progressbar|text-ok|bg-ok|farol/);
  });

  it('zero informado continua R$0 e 0%, com receita correspondente positiva', () => {
    const html = htmlDoCmv(widget({ valor: { unidade: 'centavos', valor: 0 }, percentual: { pontosBase: 0, denominador: { unidade: 'centavos', valor: 700_000, rotulo: 'Receita do recorte' } }, estado: 'ok', avisos: [] }));
    expect(html).toContain(formatarDinheiro(0));
    expect(html).toContain('0,00%');
    expect(html).not.toContain('Valor do CMV não disponível');
  });

  it('sem receita conserva o CMV conhecido e a base zero, mas percentual permanece não disponível', () => {
    const html = htmlDoCmv(widget({ estado: 'sem_base', percentual: { pontosBase: null, denominador: { unidade: 'centavos', valor: 0, rotulo: 'Receita do recorte' } }, avisos: [{ codigo: 'sem-receita', texto: 'Sem receita bruta para calcular o percentual.' }] }));
    expect(html).toContain(formatarDinheiro(175_000));
    expect(html).toContain(formatarDinheiro(0));
    expect(html).toContain('Percentual não disponível');
    expect(html).toContain('Sem base');
    expect(html).not.toContain('0,00%');
  });

  it('nenhum dia apurado mantém ausência distinta de zero sem inventar corte', () => {
    const html = htmlDoCmv(widget({
      estado: 'sem_dados', valor: { unidade: 'centavos', valor: null },
      percentual: { pontosBase: null, denominador: { unidade: 'centavos', valor: null, rotulo: 'Receita do recorte' } },
      referencia: { ...widget().referencia!, apuradoAte: null }, cobertura: { ...widget().cobertura!, diasApurados: 0 },
      fonteDoCmv: null, notaDaConta: null, avisos: [{ codigo: 'nenhum-dia-apurado', texto: 'Nenhum dia deste período foi apurado ainda.' }],
    }));
    expect(html).toContain('Sem dados apurados');
    expect(html).toContain('Nenhum dia apurado neste período.');
    expect(html).toContain('Valor do CMV não disponível');
    expect(html).toContain('Percentual não disponível');
    expect(html).toContain('Base de receita não disponível');
    expect(html).not.toMatch(/R\$|0,00%|Apurado até/);
  });

  it.each([['ok', 'Disponível'], ['parcial', 'Parcial'], ['sem_dados', 'Sem dados apurados'], ['sem_base', 'Sem base'], ['indisponivel', 'Indisponível'], ['erro', 'Não foi possível carregar']] as const)('nomeia estado %s sem depender de cor', (estado, texto) => {
    expect(htmlDoCmv(widget({ estado }))).toContain(`>${texto}</span>`);
  });

  it.each(['erro', 'indisponivel'] as const)('%s sem DTO oferece DRE atual e não promete período anterior', (estado) => {
    const html = htmlDoCmv(indisponivel(estado));
    expect(html).toContain('Período do CMV não disponível nesta consulta.');
    expect(html).toContain('href="/erp/dre?loja=lojab"');
    expect(html).toContain('Ver o DRE atual da loja');
    expect(html).not.toMatch(/R\$|25,00%|31\/10\/2026|fotografia|leitura ao vivo/);
  });

  it('fechado exibe fotografia/versão/data e mantém valores recebidos, sem detalhes internos', () => {
    const html = htmlDoCmv(widget({
      estado: 'ok', avisos: [], origem: { fonte: 'dre', modo: 'fotografia', fotografia: { id: 'id-interno-fotografia', versao: 2, versaoDaConta: 5, fechadaEm: '2026-11-02T12:00:00.000Z' } },
    }));
    expect(html).toContain('fotografia do fechamento');
    expect(html).toContain('Fotografia versão 2');
    expect(html).toContain('02/11/2026');
    expect(html).toContain('09:00');
    expect(html).toContain(formatarDinheiro(175_000));
    expect(html).not.toContain('id-interno-fotografia');
    expect(html).not.toContain('conta versão');
    expect(html).not.toContain('leitura ao vivo');
  });

  it('quinzena e corte são os do DTO, sem converter em mês civil ou data do navegador', () => {
    const html = htmlDoCmv(widget({ referencia: { base: 'periodo_apuracao', rotulo: 'Segunda quinzena', inicio: '2026-10-16', fim: '2026-10-31', apuradoAte: '2026-10-28' }, detalhe: { href: '/rodolfo/erp/parceiro-qa/dre?loja=lojab&periodo=2026-10-16', rotulo: 'Ver o CMV no DRE da loja' } }));
    expect(html).toContain('Segunda quinzena');
    expect(html).toContain('De 16/10/2026 a 31/10/2026');
    expect(html).toContain('Apurado até 28/10/2026');
    expect(html).toContain('href="/rodolfo/erp/parceiro-qa/dre?loja=lojab&amp;periodo=2026-10-16"');
    expect(html).not.toContain('De 01/10/2026');
  });

  it('parcialidade, cobertura antiga e parcelas excluídas permanecem legíveis fora de tooltip', () => {
    const html = htmlDoCmv(widget({
      cobertura: { ...widget().cobertura!, faltasDeFaturamento: 3, custosDoEstoque: { semPrecoInicial: null, semPrecoFinal: 2 } },
      avisos: [{ codigo: 'cobertura', texto: 'O fechamento não registrou a cobertura inicial.' }, { codigo: 'troca', texto: 'A base de custo mudou durante este período.' }],
      semContar: ['parcela sintética sem base'],
    }));
    expect(html).toContain('3 lançamentos de canal em falta neste recorte.');
    expect(html).toContain('inicial: cobertura não registrada · final: 2');
    expect(html).toContain('aria-label="Ressalvas do CMV"');
    expect(html).toContain('O fechamento não registrou a cobertura inicial.');
    expect(html).toContain('A base de custo mudou durante este período.');
    expect(html).toContain('Não considerado: parcela sintética sem base.');
    expect(html).not.toMatch(/<details|title="|data-tooltip/);
  });

  it('projeta só campos visuais e escapa texto de produto, sem HTML vindo do DTO', () => {
    const comExtras = { ...widget(), reason: 'SQL_PRIVADO', token: 'TOKEN_PRIVADO', extra: 'OUTRA_LOJA_PRIVADA', notaDaConta: '<script>alert(1)</script>' };
    const html = htmlDoCmv(comExtras);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/<script|SQL_PRIVADO|TOKEN_PRIVADO|OUTRA_LOJA_PRIVADA/);
  });
});

describe('CMV integrado ao resumo existente', () => {
  it('cmv-only aparece com atualização única e o horário da mesma consulta', () => {
    const html = htmlDoPainel();
    expect(html).toContain('aria-label="Resumo da operação"');
    expect(html).toContain('aria-label="CMV da loja"');
    expect(html.match(/>Atualizar resumo</g)).toHaveLength(1);
    expect(html).toContain('Resumo consultado em');
    expect(html).toContain('29/10/2026');
    expect(html).toContain('15:00');
  });

  it('ausência de cmv omite o bloco, preserva vazio e resumo institucional', () => {
    expect(htmlDoPainel(painel())).toBe('');
    const p = painel();
    p.indicadores.push({ chave: 'respostas', rotulo: 'Respostas de hoje', valor: { tipo: 'numero', numero: 4 }, contexto: 'Hoje', href: '/rodolfo/prospeccao' });
    const html = htmlDoPainel(p);
    expect(html).toContain('Resumo de hoje');
    expect(html).not.toContain('CMV da loja');
    expect(html).not.toContain('Atualizar resumo');
  });

  it('fontes existentes e falha CMV continuam no mesmo resumo, com retry único fora de links', () => {
    const p = {
      ...painel(indisponivel('erro')), consultadoEm: consulta,
      indicadores: [{ chave: 'faturamento', rotulo: 'Faturamento de outubro', valor: { tipo: 'dinheiro', centavos: 700_000 }, contexto: '3 dias lançados', href: '/erp/faturamento?mes=2026-10&loja=lojab' } as IndicadorDoDia],
      estados: [{ chave: 'faturamento', estado: 'ok', rotulo: 'Faturamento de outubro', escopo: 'Loja B', referencia: 'Mês civil de outubro', href: '/erp/faturamento', acao: 'Ver faturamento' } as const],
    };
    const html = htmlDoPainel(p);
    expect(html).toContain(formatarDinheiro(700_000));
    expect(html).toContain('Não foi possível carregar o CMV.');
    expect(html.match(/>Atualizar resumo</g)).toHaveLength(1);
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button/);
    expect(html).not.toMatch(/<section[^>]+aria-live/);
    expect(html).toContain('min-h-11');
    expect(html).not.toMatch(/<form|progressbar|Meta|<svg[^>]+role="img"/);
  });
});
