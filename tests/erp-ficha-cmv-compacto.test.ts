import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CmvCompacto, CmvPorCanalCompacto } from '@/components/erp/telas/fichas/cmv-compacto';
import { TelaListaFichas, type LinhaNaTela } from '@/components/erp/telas/fichas/lista';
import { ORDEM_DOS_CANAIS, type CanalVenda } from '@/lib/erp/canal-campos';
import { cmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import { lerFiltrosDeFicha, queryDosFiltrosDeFicha } from '@/lib/erp/ficha-campos';

const cortes = { aBp: 2500, bBp: 3000, cBp: 3500, dBp: 4000 };
const conta = (custo = 3000, p: Partial<Parameters<typeof cmvDoCanal>[1]> = {}, canal: CanalVenda = 'LOJA', faltaPreco: string[] = []) => cmvDoCanal({ canal, custoDaFicha: { porRendimento: { num: BigInt(custo), den: 1n }, faltaPreco }, embalagens: [], taxa: null }, { metaBp: 2500, precoCentavos: 10000, cortesDoFarol: cortes, ...p });
const celula = (x: ReturnType<typeof conta>) => renderToStaticMarkup(createElement(CmvCompacto, { conta: x }));
const valor = { num: 3000n, den: 1n };
const linha: LinhaNaTela = { id: 'f1', nome: 'Prato & salada', tipo: 'PRATO', descricao: null, rendimentoMilesimos: 1000, unidadeRendimento: 'UN', ativa: true, foto: null, itens: 1, preparos: 0, validades: null, consumoImediato: true, classificacao: { secao: null, subsecao: null }, custo: { total: valor, porRendimento: valor, itens: [], semPreco: [], preparosIncompletos: [], faltaPreco: [] } };
const filtros = lerFiltrosDeFicha({ secao: 'secao-a', cmv: ['LOJA-acima', 'IFOOD-semDados'], pagina: '2' });

describe('CMV compacto: estados da conta, sem reclassificar pelo número exibido', () => {
  it.each([
    [2400, 'Muito favorável', 'text-ok'], [2700, 'Favorável', 'text-ok'], [3000, 'Confortável', 'text-ok'],
    [3504, 'Atenção', 'text-atencao'], [15000, 'Crítico', 'text-erro'],
  ])('%s mantém faixa e tom canônicos, inclusive CMV acima de 100%%', (custo, rotulo, cor) => {
    const h = celula(conta(custo));
    expect(h).toContain(rotulo); expect(h).toContain(cor);
    if (custo === 3504) expect(h).toContain('35,0%');
    if (custo === 15000) expect(h).toContain('150,0%');
  });
  it('confortável e acima da meta continua verde na faixa; a exceção da meta é texto neutro', () => {
    const h = celula(conta());
    expect(h).toContain('30,0%'); expect(h).toContain('Confortável');
    expect(h).toContain('class="block text-suave">Acima da meta');
    expect(h).not.toMatch(/text-atencao|text-erro|R\$|Meta: 25/);
  });
  it('sem meta preserva faixa e número; sem faixas preserva número e comparação', () => {
    const semMeta = celula(conta(3000, { metaBp: null }));
    expect(semMeta).toContain('30,0%'); expect(semMeta).toContain('Confortável'); expect(semMeta).toContain('Sem meta'); expect(semMeta).not.toContain('Sem dados');
    const semFaixas = celula(conta(3000, { cortesDoFarol: null }));
    expect(semFaixas).toContain('30,0%'); expect(semFaixas).toContain('Sem faixas'); expect(semFaixas).toContain('Acima da meta'); expect(semFaixas).not.toContain('text-ok');
  });
  it('dentro da meta não repete a comparação nem transforma ausência da taxa iFood em falta de CMV', () => {
    const h = celula(conta(3000, { metaBp: 3500 }, 'IFOOD'));
    expect(h).toContain('30,0%'); expect(h).toContain('Confortável'); expect(h).not.toMatch(/meta|taxa|Sem dados/);
  });
  it('custo zero/incompleto e preço ausente não ganham percentual nem faixa favorável', () => {
    for (const [x, estado] of [[conta(0), 'Conferir custo'], [conta(3000, {}, 'LOJA', ['Arroz']), 'Custo incompleto'], [conta(3000, { precoCentavos: null }), 'Sem preço']] as const) {
      const h = celula(x); expect(h).toContain(estado); expect(h).not.toMatch(/\d,\d%|favorável|Confortável|text-ok/);
    }
    const ambos = celula(conta(3000, { precoCentavos: null }, 'LOJA', ['Arroz']));
    expect(ambos).toContain('Custo incompleto'); expect(ambos).toContain('Sem preço');
  });
  it('não ofertado permanece distinto de dado ausente, sem percentual ou exceção da meta', () => {
    const h = celula(conta(3000, { ofertado: false, metaBp: null }));
    expect(h).toContain('Não ofertado'); expect(h).not.toMatch(/30,0%|Sem dados|Sem meta|R\$/);
  });
});

describe('CMV compacto na lista: canais próprios e detalhe acessível', () => {
  it('mantém os três estados por canal, sem resumo comum ou dependência de hover', () => {
    const h = renderToStaticMarkup(createElement(CmvPorCanalCompacto, { contas: ORDEM_DOS_CANAIS.map(c => conta(3000, {}, c)), href: '/erp/fichas/f1', nome: linha.nome }));
    for (const nome of ['Loja', 'Delivery', 'iFood']) expect(h).toMatch(new RegExp(`<dt[^>]*>${nome}</dt>`));
    expect(h.match(/30,0%/g)).toHaveLength(3); expect(h.match(/Confortável/g)).toHaveLength(3);
    expect(h).not.toMatch(/todos os canais|title=|role="tooltip"/);
    expect(h).toContain('aria-label="Ver preço, meta e detalhes do CMV de Prato &amp; salada"');
    expect(h).toContain('href="/erp/fichas/f1#preco-por-canal"');
  });
  it.each(['/erp/fichas', '/rodolfo/erp/casa/fichas'])('mantém retorno dos detalhes em %s e grupo tablet fora da célula do nome', base => {
    const h = renderToStaticMarkup(createElement(TelaListaFichas, { base, filtros, linhas: [linha], total: 2, pagina: 2, paginas: 2, acoes: true, cmv: new Map([['f1', ORDEM_DOS_CANAIS.map(c => conta(3000, {}, c))]]) }));
    const href = `${base}/f1?de=${encodeURIComponent(queryDosFiltrosDeFicha(filtros))}`;
    expect(h).toContain(`href="${href}"`);
    expect(h).toContain(`href="${href}#preco-por-canal"`);
    const tabela = h.slice(h.indexOf('<table'));
    const corpo = tabela.slice(tabela.indexOf('<tbody'), tabela.indexOf('</tbody>'));
    expect(corpo).toMatch(/<tr class="xl:hidden"><td colSpan="3"[^>]*><div[^>]*>/);
    expect(corpo.indexOf('CMV por canal')).toBeGreaterThan(corpo.indexOf('</tr>'));
    expect(corpo).toContain('xl:table-cell'); expect(corpo).not.toContain('todos os canais');
  });
  it('pré-preparo não fabrica contas dos canais; visão operacional não recebe células ou links financeiros', () => {
    const props = { base: '/erp/fichas', filtros: lerFiltrosDeFicha({}), total: 1, pagina: 1, paginas: 1 };
    const preparo = renderToStaticMarkup(createElement(TelaListaFichas, { ...props, linhas: [{ ...linha, tipo: 'PRE_PREPARO' }], cmv: new Map() }));
    expect(preparo).toContain('não se vende'); expect(preparo).not.toMatch(/30,0%|Detalhes do CMV|CMV por canal/);
    const operacional = renderToStaticMarkup(createElement(TelaListaFichas, { ...props, linhas: [{ ...linha, custo: null }] }));
    expect(operacional).toContain('Prato &amp; salada'); expect(operacional).not.toMatch(/CMV|R\$|Confortável|Acima da meta/);
  });
});
