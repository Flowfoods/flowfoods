import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { filtrosDaFichaPermitidos, lerFiltrosDeFicha, queryDosFiltrosDeFicha } from '@/lib/erp/ficha-campos';
import { assinaturaDaSelecao, resumirFiltrosAplicados } from '@/components/erp/telas/fichas/filtros-resumo';
import { FiltrosDasFichas, type ClassificacaoDosFiltros } from '@/components/erp/telas/fichas/filtros';

vi.mock('next/navigation', () => ({ usePathname: () => '/erp/fichas', useSearchParams: () => new URLSearchParams() }));
const classificacao: ClassificacaoDosFiltros = {
  secoesIniciais: { itens: [], selecionados: [{ nivel: 'secao', registro: { id: 'secao-a', nome: 'Pratos da estação', ativa: false, versao: 'v1' } }], proximoCursor: null },
  subsecoesIniciais: { itens: [], selecionados: [{ nivel: 'subsecao', registro: { id: 'sub-a', secaoId: 'secao-a', nome: 'Assados', ativa: true, secaoAtiva: false, versao: 'v1' } }], proximoCursor: null },
  buscar: async () => ({ ok: true, pagina: { itens: [], selecionados: [], proximoCursor: null } }),
  gerir: async () => null,
};
const todos = lerFiltrosDeFicha({ q: 'Prato', tipo: 'PRATO', situacao: 'todas', secao: 'secao-a', subsecao: 'sub-a', custo: 'incompleto', cmv: ['LOJA-acima', 'IFOOD-semDados'], faixaCmv: ['DELIVERY_PROPRIO-critico', 'IFOOD-naoOfertado'], pagina: '3' });

describe('FT-FILTROS-UX: resumo da URL aplicada e remoção', () => {
  it('representa todos os critérios e nomes arquivados; paginação não entra na contagem', () => {
    const resumo = resumirFiltrosAplicados('/erp/fichas', todos, classificacao);
    expect(resumo).toHaveLength(10);
    expect(resumo.map(x => x.chave)).toEqual(['q', 'secao', 'subsecao', 'tipo', 'situacao', 'custo', 'cmv-LOJA-acima', 'cmv-IFOOD-semDados', 'faixa-DELIVERY_PROPRIO-critico', 'faixa-IFOOD-naoOfertado']);
    expect(resumo.find(x => x.chave === 'secao')?.rotulo).toBe('Seção: Pratos da estação (arquivada)');
    expect(resumo.find(x => x.chave === 'subsecao')?.rotulo).toBe('Subseção: Assados (arquivada)');
    expect(resumo.find(x => x.chave === 'cmv-LOJA-acima')?.rotulo).toContain('Meta: Loja');
    expect(resumo.find(x => x.chave === 'faixa-DELIVERY_PROPRIO-critico')?.rotulo).toContain('Faixa: Delivery');
  });
  it.each(['/erp/fichas', '/rodolfo/erp/casa-ficticia/fichas'])('remoção em %s preserva os demais critérios e reinicia a página', base => {
    const inicial = queryDosFiltrosDeFicha(todos);
    const resumo = resumirFiltrosAplicados(base, todos, classificacao);
    for (const item of resumo) {
      const url = new URL(item.removerHref, 'http://local');
      expect(url.pathname).toBe(base);
      expect(url.searchParams.has('pagina')).toBe(false);
      const depois = lerFiltrosDeFicha(url.searchParams);
      expect(resumirFiltrosAplicados(base, depois, classificacao).map(x => x.chave)).toEqual(resumo.filter(x => x.chave !== item.chave && !(item.chave === 'secao' && x.chave === 'subsecao')).map(x => x.chave));
    }
    expect(queryDosFiltrosDeFicha(todos)).toBe(inicial);
  });
  it('sem seção/filho, nomes indisponíveis e seleção vazia continuam explícitos', () => {
    expect(resumirFiltrosAplicados('/erp/fichas', lerFiltrosDeFicha({}))).toEqual([]);
    expect(resumirFiltrosAplicados('/erp/fichas', lerFiltrosDeFicha({ secao: 'sem' }))[0].rotulo).toBe('Sem seção');
    const sem = resumirFiltrosAplicados('/erp/fichas', lerFiltrosDeFicha({ secao: 'ausente', subsecao: 'sem' }));
    expect(sem.map(x => x.rotulo)).toEqual(['Seção: Indisponível', 'Sem subseção']);
  });
  it('comparação de seleção usa o parser canônico, ignora página e distingue remoções', () => {
    expect(assinaturaDaSelecao({ ...todos, pagina: 1, q: ' Prato ', cmv: [...todos.cmv].reverse() })).toBe(assinaturaDaSelecao(todos));
    for (const alteracao of [{ q: 'Outra' }, { secao: null, subsecao: null }, { subsecao: null }, { tipo: null }, { situacao: 'ativas' as const }, { incompleto: false }, { cmv: [] }, { faixasCmv: [] }]) {
      expect(assinaturaDaSelecao({ ...todos, ...alteracao })).not.toBe(assinaturaDaSelecao(todos));
    }
  });
});

describe('FT-FILTROS-UX: composição e permissões', () => {
  const render = (filtros = todos, verCustos = true) => renderToStaticMarkup(createElement(FiltrosDasFichas, { base: '/erp/fichas', filtros, verCustos, classificacao }));
  it('busca/classificação precedem os avançados e ações vêm depois do resumo aplicado', () => {
    const h = render();
    const avancados = h.indexOf('<details');
    for (const id of ['fichas-q', 'filtros-secao', 'filtros-subsecao', 'fichas-tipo', 'fichas-situacao']) expect(h.indexOf(`id="${id}"`)).toBeLessThan(avancados);
    expect(h).toContain('Filtros aplicados (10)');
    expect(h.indexOf('type="submit"')).toBeGreaterThan(h.indexOf('fichas-aplicados-titulo'));
    expect(h).not.toContain('Há alterações não aplicadas');
    expect(h).toContain('Aplicar filtros');
    expect(h).toContain('Nova seção');
    expect(h.match(/<form\b/g)).toHaveLength(1);
  });
  it('avançados fechados mantêm todos os nomes e pares exatos no HTML do GET', () => {
    const h = render();
    expect(h.match(/<details\b[^>]*\bopen(?:=|\s|>)/g)).toBeNull();
    const marcados = (nome: string) => [...h.matchAll(new RegExp(`<input\\b[^>]*name="${nome}"[^>]*>`, 'g'))].filter(([s]) => s.includes('checked=""')).map(([s]) => s.match(/value="([^"]+)"/)?.[1]);
    expect(marcados('cmv')).toEqual(['LOJA-acima', 'IFOOD-semDados']);
    expect(marcados('faixaCmv')).toEqual(['DELIVERY_PROPRIO-critico', 'IFOOD-naoOfertado']);
    expect(marcados('custo')).toEqual(['incompleto']);
  });
  it('acesso operacional não expõe controles, resumo nem links financeiros de uma URL forjada', () => {
    const h = render(todos, false);
    expect(h).not.toMatch(/name="cmv"|name="faixaCmv"|name="custo"|Meta:|Faixa:|Custo e CMV|custo=incompleto|cmv=/);
    expect(h).toContain('Filtros aplicados (5)');
    expect(resumirFiltrosAplicados('/erp/fichas', filtrosDaFichaPermitidos(todos, false), classificacao)).toHaveLength(5);
  });
  it('estado inicial sem filtro explica a situação padrão e conserva Aplicar/Limpar', () => {
    const h = render(lerFiltrosDeFicha({}));
    expect(h).toContain('Filtros aplicados (0)');
    expect(h).toContain('Exibindo fichas ativas, sem outros filtros.');
    expect(h).toContain('aria-label="Limpar filtros"');
  });
});
