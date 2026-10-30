import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { faturamentoAnalitico } from '@/lib/erp/home-analitico';
import { FaturamentoCanaisHome } from '@/components/erp/telas/faturamento-canais-home';
import { EvolucaoFaturamentoHome } from '@/components/erp/telas/evolucao-faturamento-home';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { contextoCanaisHome as contexto, mesDosCanaisHome as mes } from './apoio-home-canais';

vi.mock('@/lib/db', () => { throw new Error('UI não consulta banco.'); });
vi.mock('@/lib/erp/faturamento', () => { throw new Error('UI não importa serviço.'); });

const projetar = (m = mes()) => faturamentoAnalitico({ estado: 'lido', dados: m }, contexto)!;
const html = (p = projetar()) => renderToStaticMarkup(createElement(FaturamentoCanaisHome, { widget: p.widget, leitura: p.diario }));
const painel = (p = projetar()) => renderToStaticMarkup(createElement(EvolucaoFaturamentoHome, { widgetFaturamento: p.widget, leitura: p.diario, loja: contexto.loja.nome }));

describe('Home · apresentação dos valores por canal', () => {
  it('mostra comparação por valor, tabela, zero declarado e percentuais reconciliados', () => {
    const h = html();
    for (const t of ['Faturamento por canal', 'Valores informados por canal', 'Comparação dos valores informados por canal', 'Loja', 'Delivery próprio', 'iFood', '25%', '75%', '>0%</td>', 'Total informado']) expect(h).toContain(t);
    expect(h).toContain(`data-valor-monetario="${formatarDinheiro(0)}"`);
    expect(h).toContain('<table'); expect(h).toContain('scope="row"');
    expect(h).not.toMatch(/<a |<button|<input|Conectado|sincronizado|lucro/);
  });
  it('canal nunca lançado hoje fica sem valor e sem percentual, mesmo sem falta', () => {
    const h = html(projetar(mes({ LOJA: 10000 })));
    expect(h.match(/Sem lançamento/g)).toHaveLength(2);
    expect(h.match(/Percentual não disponível/g)).toHaveLength(2);
    expect(h).not.toContain(`data-valor-monetario="${formatarDinheiro(0)}"`);
    expect(h).not.toContain('dia sem lançamento');
  });
  it('zero conhecido no total mantém dinheiro zero, dispensa barras e percentuais', () => {
    const h = html(projetar(mes({ LOJA: 0, DELIVERY_PROPRIO: 0, IFOOD: 0 })));
    expect(h.match(/data-valor-monetario=/g)).toHaveLength(4);
    expect(h.match(/Percentual não disponível/g)).toHaveLength(3);
    expect(h).not.toContain('<figure'); expect(h).not.toContain('>0%</td>');
    expect(h).toContain('O total informado é zero; não há distribuição percentual.');
  });
  it('zero residual num canal sem presença canônica não aparece como declarado', () => {
    const p = projetar(mes({ LOJA: 0 })); p.widget.composicaoPorCanal!.canais[1].centavos = 0;
    expect(html(p)).not.toContain('<table'); expect(html(p)).toContain('indisponível');
  });
  it('parcialidade é visível no contexto e nas linhas, com histórico do canal desativado', () => {
    const m = mes({ IFOOD: 30000 }, ['LOJA']); m.faltas = m.lojas[0].faltas = 2; m.lojas[0].faltasPorCanal.LOJA = 2;
    const h = html(projetar(m));
    expect(h).toContain('Parcial'); expect(h).toContain('2 dias sem lançamento'); expect(h).toContain('há canais sem lançamento');
    expect(h).toContain('iFood'); expect(h).toContain('100%'); expect(h).not.toContain('Delivery próprio');
  });
  it('ausência total é estado sem dados e não moeda zero', () => {
    const h = html(projetar(mes({})));
    expect(h).toContain('Sem lançamentos para compor os canais.'); expect(h).not.toContain('<table'); expect(h).not.toContain('R$');
  });
  it.each(['erro', 'indisponivel'] as const)('%s não publica valores residuais nem desmonta evolução/complementos', estado => {
    const p = projetar(); p.widget.composicaoPorCanal!.estado = estado;
    const h = html(p); expect(h).not.toContain('<table'); expect(h).not.toContain('R$'); expect(h).toContain('Confira os lançamentos no módulo Faturamento.');
    const todo = painel(p); expect(todo).toContain('Complementos do Faturamento'); expect(todo).toContain('Faturamento por dia'); expect(todo).toContain(formatarDinheiro(40000));
  });
  it.each(['mes', 'loja', 'hoje', 'consulta', 'total', 'estado'] as const)('recorte %s divergente oculta somente os valores da composição', campo => {
    const p = projetar();
    if (campo === 'mes') p.diario.mes = '2026-09';
    if (campo === 'loja') p.widget.escopo.lojaId = 'outra';
    if (campo === 'hoje') p.diario.hoje = '2026-10-29';
    if (campo === 'consulta') p.diario.consultadoEm = '2026-10-30T14:00:00Z';
    if (campo === 'total') p.diario.totalCentavos = 1;
    if (campo === 'estado') p.diario.estado = 'parcial';
    expect(html(p)).not.toContain('<table'); expect(html(p)).toContain('indisponível');
  });
  it.each(['duplicado', 'percentual', 'soma', 'falta', 'centavos', 'getter'] as const)('DTO incompatível %s não derruba o painel nem expõe dados internos', caso => {
    const p = projetar(), c = p.widget.composicaoPorCanal!;
    if (caso === 'duplicado') c.canais[1].canal = 'LOJA';
    if (caso === 'percentual') c.canais[0].percentualBp = 9000;
    if (caso === 'soma') c.totalCentavos = 9000;
    if (caso === 'falta') c.canais[0].faltas = 1;
    if (caso === 'centavos') c.canais[0].centavos = NaN;
    if (caso === 'getter') Object.defineProperty(c, 'canais', { get() { throw new Error('SQL_PRIVADO'); } });
    const h = html(p); expect(h).not.toContain('<table'); expect(h).not.toContain('SQL_PRIVADO');
    const todo = painel(p); expect(todo).toContain('Complementos do Faturamento'); expect(todo).toContain('Faturamento por dia');
  });
  it('DTO antigo omite o bloco, preservando conteúdo anterior', () => {
    const p = projetar(); delete p.widget.composicaoPorCanal; expect(html(p)).toBe(''); expect(painel(p)).toContain('Faturamento por dia');
    Object.assign(p.widget, { composicaoPorCanal: null }); expect(html(p)).toBe('');
  });
  it('bloco usa o painel existente e não acrescenta link ou filtro de canal', () => {
    const h = painel(); expect(h.match(/<a /g)).toHaveLength(1);
    expect(h).toContain('/erp/faturamento?mes=2026-10&amp;loja=lojab'); expect(h).not.toContain('canal=');
    expect(h.indexOf('Faturamento por dia')).toBeLessThan(h.indexOf('Faturamento por canal'));
    expect(h.indexOf('Faturamento por canal')).toBeLessThan(h.indexOf('Ver o faturamento da loja'));
    expect(h).toContain('Complementos do Faturamento');
  });
  it('grandes valores preservam moeda inteira e aviso é escapado', () => {
    const p = projetar(mes({ LOJA: Number.MAX_SAFE_INTEGER })); p.widget.composicaoPorCanal!.aviso = '<script>fonte</script>';
    const h = html(p); expect(h).toContain(`data-valor-monetario="${formatarDinheiro(Number.MAX_SAFE_INTEGER)}"`);
    expect(h).toContain('&lt;script&gt;fonte&lt;/script&gt;'); expect(h).not.toContain('<script>');
  });
});
