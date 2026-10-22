/**
 * ERP L.1 · lista de insumos, a parte PURA (sem banco): leitura dos filtros da URL (tamanho da página, marca, cadastro incompleto),
 * a URL de volta, o retorno "de onde vim" sem open redirect, os motivos do cadastro incompleto, a paginação numerada e as frases dos
 * vínculos. Os valores esperados são escritos à mão, nunca calculados pela mesma função.
 */
import { describe, expect, it } from 'vitest';
import {
  comDe,
  deSeguro,
  FILTRO_SEM_MARCA,
  FILTROS_PADRAO,
  lerFiltros,
  lerPorPagina,
  MOTIVOS_DE_CADASTRO_INCOMPLETO,
  motivosDoCadastro,
  OPCOES_POR_PAGINA,
  POR_PAGINA_PADRAO,
  queryDosFiltros,
  temFiltro,
} from '@/lib/erp/insumo-campos';
import { faixaDaPagina, paginasVisiveis } from '@/lib/erp/paginacao';
import { resumoDosVinculos } from '@/lib/erp/insumo-remocao';

describe('L.1 · itens por página', () => {
  it('só 10, 25, 50 e 100; o padrão é 50', () => {
    expect([...OPCOES_POR_PAGINA]).toEqual([10, 25, 50, 100]);
    expect(POR_PAGINA_PADRAO).toBe(50);
    for (const n of ['10', '25', '50', '100']) expect(lerPorPagina(n)).toBe(Number(n));
  });

  it.each(['0', '-5', '1000', '51', '25.5', 'abc', '', ' 25', '25 ', '1e2', '0x19', '٢٥', 'NaN', 'Infinity'])('valor torto %j cai em 50', (v) => {
    expect(lerPorPagina(v)).toBe(50);
  });

  it('ausente, nulo, objeto e lista caem em 50', () => {
    for (const v of [undefined, null, {}, [], ['25'], true]) expect(lerPorPagina(v)).toBe(50);
  });

  it('a URL leva o tamanho só quando não é o padrão', () => {
    expect(queryDosFiltros({ ...FILTROS_PADRAO, porPagina: 50 })).toBe('');
    expect(queryDosFiltros({ ...FILTROS_PADRAO, porPagina: 25 })).toBe('por=25');
    expect(lerFiltros({ por: '100' }).porPagina).toBe(100);
    expect(lerFiltros({ por: '7' }).porPagina).toBe(50);
    expect(lerFiltros({ por: ['10', '25'] }).porPagina).toBe(10);
  });

  it('o tamanho NÃO conta como filtro (limpar filtros mantém o tamanho)', () => {
    expect(temFiltro({ ...FILTROS_PADRAO, porPagina: 10 })).toBe(false);
  });
});

describe('L.1 · página pedida', () => {
  it.each([
    ['abc', 1],
    ['-3', 1],
    ['0', 1],
    ['2.9', 2],
    ['999999999999999999999', 1],
    ['7', 7],
    ['', 1],
  ])('pagina=%j vira %i', (v, esperado) => {
    expect(lerFiltros({ pagina: v }).pagina).toBe(esperado);
  });
});

describe('L.1 · marca e cadastro incompleto na URL', () => {
  it('marca: texto limpo, sem invisíveis, até 80 letras; "sem-marca" é o filtro dos sem marca', () => {
    expect(lerFiltros({ marca: '  Camil  ' }).marca).toBe('Camil');
    expect(lerFiltros({ marca: 'Ca​mil' }).marca).toBe('Camil');
    expect(lerFiltros({ marca: 'x'.repeat(200) }).marca).toBe('x'.repeat(80));
    expect(lerFiltros({ marca: '   ' }).marca).toBeNull();
    expect(lerFiltros({ marca: FILTRO_SEM_MARCA }).marca).toBe('sem-marca');
    expect(lerFiltros({}).marca).toBeNull();
  });

  it('incompleto só com 1; qualquer outra coisa é sem filtro', () => {
    expect(lerFiltros({ incompleto: '1' }).incompleto).toBe(true);
    for (const v of ['0', 'sim', 'true', '', undefined]) expect(lerFiltros({ incompleto: v }).incompleto).toBe(false);
  });

  it('ida e volta: tudo o que a URL guarda volta igual', () => {
    const f = lerFiltros({ q: 'farinha', categoria: 'abc123', tipo: 'EMBALAGEM', conservacao: 'REFRIGERADO', situacao: 'todos', preco: 'sem', marca: 'Camil', incompleto: '1', ordem: 'custo', dir: 'desc', por: '25', pagina: '3' });
    expect(queryDosFiltros(f)).toBe('q=farinha&tipo=EMBALAGEM&categoria=abc123&conservacao=REFRIGERADO&situacao=todos&preco=sem&marca=Camil&incompleto=1&ordem=custo&dir=desc&por=25&pagina=3');
    expect(lerFiltros(Object.fromEntries(new URLSearchParams(queryDosFiltros(f))))).toEqual(f);
    expect(temFiltro(f)).toBe(true);
  });

  it('marca e cadastro incompleto contam como filtro (aparecem em "Filtros ativos" e em "Limpar")', () => {
    expect(temFiltro({ ...FILTROS_PADRAO, marca: 'Camil' })).toBe(true);
    expect(temFiltro({ ...FILTROS_PADRAO, incompleto: true })).toBe(true);
  });
});

describe('L.1 · o "de onde vim" é dado de fora', () => {
  it('só os filtros que a lista conhece voltam; o resto some', () => {
    expect(deSeguro('q=farinha&pagina=2&por=25&hack=1&__proto__=x')).toBe('q=farinha&por=25&pagina=2');
    expect(deSeguro('//evil.com')).toBe('');
    expect(deSeguro('https://evil.com/?q=a')).toBe('');
    expect(deSeguro('javascript:alert(1)')).toBe('');
    expect(deSeguro('feito=excluido&ref=abc')).toBe('');
  });

  it('nunca vira endereço: nem barra, nem esquema, nem controle sobrevivem', () => {
    for (const ruim of ['/\\evil.com', '\\\\evil', 'q=\u0000x', 'q=%0d%0aLocation: x']) {
      const d = deSeguro(ruim);
      expect(d.startsWith('/') || d.includes('://') || /[\u0000-\u001f]/.test(d), ruim).toBe(false);
    }
  });

  it('não-texto, vazio e enorme dão vazio', () => {
    for (const v of [undefined, null, 5, {}, [], '', 'a'.repeat(601)]) expect(deSeguro(v), String(v)).toBe('');
  });
});

describe('L.1 · motivos do cadastro incompleto', () => {
  const base = { tipo: 'INGREDIENTE', categoriaChave: 'MERCEARIA' as string | null, temCategoria: true, conservacao: 'SECO', conservacaoConfirmadaEm: new Date() as Date | null, preparoSemValidade: false };

  it('insumo completo não tem motivo', () => {
    expect(motivosDoCadastro(base)).toEqual([]);
  });

  it('sem categoria', () => {
    expect(motivosDoCadastro({ ...base, categoriaChave: null, temCategoria: false })).toEqual(['sem-categoria']);
  });

  it('categoria a classificar (Outros)', () => {
    expect(motivosDoCadastro({ ...base, categoriaChave: 'OUTROS' })).toEqual(['a-classificar']);
  });

  it('conservação a confirmar: Seco sem confirmação em categoria que costuma ser fria', () => {
    expect(motivosDoCadastro({ ...base, categoriaChave: 'PROTEINA', conservacaoConfirmadaEm: null })).toEqual(['conservacao']);
    expect(motivosDoCadastro({ ...base, categoriaChave: 'MERCEARIA', conservacaoConfirmadaEm: null })).toEqual([]);
    expect(motivosDoCadastro({ ...base, categoriaChave: 'PROTEINA', conservacao: 'CONGELADO', conservacaoConfirmadaEm: null })).toEqual([]);
  });

  it('pré-preparo cuja ficha não diz a validade', () => {
    expect(motivosDoCadastro({ ...base, tipo: 'PRE_PREPARO', preparoSemValidade: true })).toEqual(['validade']);
    expect(motivosDoCadastro({ ...base, tipo: 'PRE_PREPARO', preparoSemValidade: false })).toEqual([]);
  });

  it('vários motivos juntos, na ordem da tela', () => {
    expect(motivosDoCadastro({ ...base, tipo: 'PRE_PREPARO', categoriaChave: 'OUTROS', preparoSemValidade: true })).toEqual(['a-classificar', 'validade']);
  });

  it('custo não informado NÃO é motivo (tem filtro próprio) e a unidade não aparece (é obrigatória no banco)', () => {
    expect(Object.keys(MOTIVOS_DE_CADASTRO_INCOMPLETO)).toEqual(['sem-categoria', 'a-classificar', 'conservacao', 'validade']);
    expect(Object.values(MOTIVOS_DE_CADASTRO_INCOMPLETO).join(' ')).not.toMatch(/custo|unidade/i);
  });
});

describe('L.1 · paginação numerada', () => {
  it('poucas páginas: todas aparecem', () => {
    expect(paginasVisiveis(1, 1)).toEqual([1]);
    expect(paginasVisiveis(2, 3)).toEqual([1, 2, 3]);
    expect(paginasVisiveis(1, 5)).toEqual([1, 2, 'espaco', 5]);
    expect(paginasVisiveis(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('muitas páginas: primeira, última, a atual e as vizinhas, com "…" no meio', () => {
    expect(paginasVisiveis(1, 12)).toEqual([1, 2, 'espaco', 12]);
    expect(paginasVisiveis(6, 12)).toEqual([1, 'espaco', 5, 6, 7, 'espaco', 12]);
    expect(paginasVisiveis(12, 12)).toEqual([1, 'espaco', 11, 12]);
    expect(paginasVisiveis(4, 12)).toEqual([1, 2, 3, 4, 5, 'espaco', 12]);
  });

  it('o "…" nunca esconde uma página só: ela própria aparece', () => {
    expect(paginasVisiveis(4, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(paginasVisiveis(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it('página fora da faixa é ajustada e nunca sai página inexistente', () => {
    expect(paginasVisiveis(99, 6)).toEqual(paginasVisiveis(6, 6));
    expect(paginasVisiveis(0, 6)).toEqual(paginasVisiveis(1, 6));
    expect(paginasVisiveis(-4, 0)).toEqual([1]);
    expect(paginasVisiveis(Number.NaN, Number.NaN)).toEqual([1]);
    for (const [a, t] of [[1, 1], [5, 9], [9, 9], [1, 100], [50, 100]]) {
      const v = paginasVisiveis(a, t);
      expect(v.filter((x): x is number => typeof x === 'number').every((x) => x >= 1 && x <= t)).toBe(true);
      expect(v).toContain(a);
      expect(v[0]).toBe(1);
      expect(v.at(-1)).toBe(t);
    }
  });

  it('a faixa "Mostrando 1–25 de 137"', () => {
    expect(faixaDaPagina(1, 25, 25)).toEqual({ de: 1, ate: 25 });
    expect(faixaDaPagina(6, 25, 12)).toEqual({ de: 126, ate: 137 });
    expect(faixaDaPagina(1, 50, 1)).toEqual({ de: 1, ate: 1 });
    expect(faixaDaPagina(1, 10, 0)).toEqual({ de: 0, ate: 0 });
  });
});

describe('L.1 · frases dos vínculos', () => {
  it('a frase de recusa junta os vínculos em minúscula, na ordem recebida', () => {
    expect(
      resumoDosVinculos([
        { chave: 'fichas', n: 2, frase: 'Usado em 2 fichas técnicas' },
        { chave: 'movimentos', n: 1, frase: '1 movimento de estoque (entradas, saídas, perdas, ajustes)' },
      ]),
    ).toBe('usado em 2 fichas técnicas; 1 movimento de estoque (entradas, saídas, perdas, ajustes)');
  });
});

describe('L.1 · o "de onde vim" nos links: ida e volta', () => {
  const casos = [
    { q: 'farinha', por: '25', pagina: '3' },
    { q: 'açúcar & sal = 100% +mais #1', marca: 'Marca & Filha', incompleto: '1', situacao: 'todos' },
    { q: 'a=b&c=d', categoria: 'abc_123-X', tipo: 'EMBALAGEM', conservacao: 'REFRIGERADO', preco: 'sem', ordem: 'custo', dir: 'desc', por: '100', pagina: '2' },
    { q: "'; DROP TABLE x; --", por: '10' },
    {},
  ];
  it.each(casos.map((c, i) => [i, c] as const))('caso %i: o valor de `de` volta igual e `origem` não se mistura com ele', (_i, c) => {
    const f = lerFiltros(c);
    const de = queryDosFiltros(f);
    for (const href of [comDe('/erp/insumos/abc/editar', de, { origem: 'lista' }), comDe('/erp/insumos/abc/remover', de), comDe('/rodolfo/erp/casa/insumos/abc', de), comDe('/erp/insumos/novo', de, { tipo: 'INGREDIENTE', unidade: 'KG' })]) {
      const u = new URL(href, 'http://erp.interno');
      expect(u.pathname.startsWith('/erp') || u.pathname.startsWith('/rodolfo'), href).toBe(true);
      expect(u.searchParams.get('de') ?? '', href).toBe(de);
      expect(deSeguro(u.searchParams.get('de')), href).toBe(de);
      expect(lerFiltros(Object.fromEntries(new URLSearchParams(u.searchParams.get('de') ?? ''))), href).toEqual(f);
      // O que não é `de` nunca vaza para dentro dele e `de` nunca vira parâmetro solto.
      for (const k of u.searchParams.keys()) expect(['de', 'origem', 'tipo', 'unidade'], `${href}: ${k}`).toContain(k);
      expect(href.includes('?de=') ? /^[^?]*\?de=[^&]*(&|$)/.test(href) : true, href).toBe(true);
    }
  });

  it('sem `de` o endereço fica limpo; com `origem` só, sem `de=` vazio', () => {
    expect(comDe('/erp/insumos/x', '')).toBe('/erp/insumos/x');
    expect(comDe('/erp/insumos/x/editar', '', { origem: 'lista' })).toBe('/erp/insumos/x/editar?origem=lista');
  });

  it('o `de` com & e = vira UM parâmetro codificado (nunca "?de=por=25&pagina=3")', () => {
    expect(comDe('/erp/insumos/x/editar', 'por=25&pagina=3', { origem: 'lista' })).toBe('/erp/insumos/x/editar?de=por%3D25%26pagina%3D3&origem=lista');
  });
});
