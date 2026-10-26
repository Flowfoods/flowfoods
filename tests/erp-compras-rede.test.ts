/**
 * Decisão 478 — o relatório de compras pedido para a rede (`?rede=1`), sem listar cada loja no endereço.
 *  - o DRE da rede mandava as lojas por extenso (sem loja marcada, o relatório usaria a loja escolhida no topo); com mais de
 *    ~55 lojas o endereço passava do limite da volta, e com mais de 100 o relatório cortava as lojas calado;
 *  - `rede=1` só vale sem loja marcada; marcar loja vale mais;
 *  - a regra da loja do topo é uma só para o relatório e as duas comparações;
 *  - os links e os formulários levam a rede adiante; "Ver só <loja do topo>" a tira.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { lerFiltrosDoRelatorio, queryDoRelatorio, recorteDaVisao } from '@/lib/erp/compras-relatorio-campos';
import { lerFiltrosDePeriodos, queryDosPeriodos, queryParaCompararComOAnterior } from '@/lib/erp/compras-comparacao-campos';
import { caminhoDeVolta } from '@/lib/erp/volta';
import { NotaDaVisao, SeletorDeLojas } from '@/components/erp/telas/compras/relatorio-filtros';

const HOJE = '2026-10-22';
const TOPO = { tipo: 'loja' as const, lojaId: 'vp', nome: 'Vila da Penha' };

describe('decisão 478 · ler e escrever a rede no endereço', () => {
  it('rede=1 sem loja marcada pede a rede; com loja marcada, a loja vale; outro valor não vale', () => {
    expect(lerFiltrosDoRelatorio({ rede: '1' }, HOJE)).toMatchObject({ rede: true, lojaIds: [] });
    expect(lerFiltrosDoRelatorio({ rede: '1', loja: ['a', 'b'] }, HOJE)).toMatchObject({ rede: false, lojaIds: ['a', 'b'] });
    expect(lerFiltrosDoRelatorio({ rede: 'sim' }, HOJE).rede).toBe(false);
    expect(lerFiltrosDoRelatorio({}, HOJE).rede).toBe(false);
  });

  it('o endereço leva a rede adiante (relatório, comparação de períodos e "comparar com o anterior") e a perde quando se marca loja', () => {
    const f = lerFiltrosDoRelatorio({ rede: '1', de: '2026-09-01', ate: '2026-09-30' }, HOJE);
    expect(new URLSearchParams(queryDoRelatorio(f)).get('rede')).toBe('1');
    expect(new URLSearchParams(queryDoRelatorio(f, { lojaIds: ['a'] })).get('rede')).toBeNull();
    expect(new URLSearchParams(queryDoRelatorio(f, { rede: false })).get('rede')).toBeNull();
    // Ler o que se escreveu devolve a rede (ida e volta).
    expect(lerFiltrosDoRelatorio(Object.fromEntries(new URLSearchParams(queryDoRelatorio(f))), HOJE).rede).toBe(true);
    expect(new URLSearchParams(queryParaCompararComOAnterior(f)).get('rede')).toBe('1');
    const p = lerFiltrosDePeriodos({ rede: '1' }, HOJE);
    expect(p.rel.rede).toBe(true);
    expect(new URLSearchParams(queryDosPeriodos(p)).get('rede')).toBe('1');
    expect(new URLSearchParams(queryDosPeriodos(p, { rel: { rede: false } })).get('rede')).toBeNull();
  });

  it('com 150 lojas, o relatório da rede cabe na volta; listar as lojas não cabia', () => {
    const id = (n: number) => `cmvloja${String(n).padStart(18, '0')}`;
    const listado = `/erp/compras/relatorios/periodo?de=2026-09-01&ate=2026-09-30&${Array.from({ length: 150 }, (_, n) => `loja=${id(n)}`).join('&')}`;
    const daRede = `/erp/compras/relatorios/periodo?${queryDoRelatorio(lerFiltrosDoRelatorio({ rede: '1', de: '2026-09-01', ate: '2026-09-30' }, HOJE))}`;
    expect(caminhoDeVolta(listado, '/erp/', 2000)).toBeNull();
    expect(caminhoDeVolta(daRede, '/erp/', 2000)).toBe(daRede);
    // E o relatório lia no máximo 100 lojas da lista, calado.
    expect(lerFiltrosDoRelatorio(Object.fromEntries([...new URLSearchParams(listado.split('?')[1])].reduce((m, [k, v]) => m.set(k, [...(m.get(k) ?? []), v]), new Map<string, string[]>())), HOJE).lojaIds).toHaveLength(100);
  });
});

describe('decisão 478 · a loja escolhida no topo', () => {
  const sem = lerFiltrosDoRelatorio({}, HOJE);
  const rede = lerFiltrosDoRelatorio({ rede: '1' }, HOJE);
  const marcada = lerFiltrosDoRelatorio({ loja: 'dl' }, HOJE);

  it('sem loja marcada, ela decide; com a rede pedida, valem todas e ela é só dita; loja marcada ou visão da rede, nada muda', () => {
    expect(recorteDaVisao(sem, TOPO)).toEqual({ f: { ...sem, lojaIds: ['vp'] }, soALoja: 'Vila da Penha', alemDaLoja: null });
    expect(recorteDaVisao(rede, TOPO)).toEqual({ f: rede, soALoja: null, alemDaLoja: 'Vila da Penha' });
    expect(recorteDaVisao(marcada, TOPO)).toEqual({ f: marcada, soALoja: null, alemDaLoja: null });
    expect(recorteDaVisao(rede, { tipo: 'rede' })).toEqual({ f: rede, soALoja: null, alemDaLoja: null });
    expect(recorteDaVisao(sem, { tipo: 'nenhuma' })).toEqual({ f: sem, soALoja: null, alemDaLoja: null });
  });

  it('a tela diz o que a loja do topo fez e, na rede, oferece ver só ela', () => {
    const so = renderToStaticMarkup(createElement(NotaDaVisao, { soALoja: 'Vila da Penha' }));
    expect(so).toContain('Mostrando só <strong class="font-semibold text-texto">Vila da Penha</strong>, a loja escolhida no topo.');
    const alem = renderToStaticMarkup(createElement(NotaDaVisao, { alemDaLoja: { nome: 'Vila da Penha', href: '/erp/compras/relatorios/periodo?de=2026-09-01' } }));
    expect(alem).toContain('Mostrando todas as suas lojas, não só <strong class="font-semibold text-texto">Vila da Penha</strong>, a loja escolhida no topo.');
    expect(alem).toMatch(/<a [^>]*href="\/erp\/compras\/relatorios\/periodo\?de=2026-09-01"[^>]*>Ver só Vila da Penha<\/a>/);
    expect(alem).toContain('ff-toque');
    expect(renderToStaticMarkup(createElement(NotaDaVisao, {}))).toBe('');
  });

  it('o formulário mantém a rede ao aplicar outro filtro, enquanto nenhuma loja for marcada', () => {
    const lojas = [
      { id: 'vp', nome: 'Vila da Penha', ativa: true },
      { id: 'dl', nome: 'Delivery', ativa: true },
    ];
    const oculto = '<input type="hidden" name="rede" value="1"/>';
    expect(renderToStaticMarkup(createElement(SeletorDeLojas, { lojas, marcadas: [], rede: true }))).toContain(oculto);
    expect(renderToStaticMarkup(createElement(SeletorDeLojas, { lojas, marcadas: ['dl'], rede: true }))).not.toContain(oculto);
    expect(renderToStaticMarkup(createElement(SeletorDeLojas, { lojas, marcadas: [] }))).not.toContain(oculto);
    // Com uma loja só no acesso também (o seletor vira texto).
    expect(renderToStaticMarkup(createElement(SeletorDeLojas, { lojas: lojas.slice(0, 1), marcadas: [], rede: true }))).toContain(oculto);
  });
});
