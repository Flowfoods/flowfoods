/**
 * Visual da Apple, fatia A2 (decisão 531): o menu lateral em lista, como a barra lateral do iPad — sem banco e sem navegador.
 *
 * - uma linha por tela: ícone à esquerda, nome alinhado e que quebra (nunca corta), 44 px de altura mínima;
 * - no Início, cada área com o quadrado de cor cheia (como nos Ajustes do iPhone), com o mesmo destino de antes;
 * - cabeçalho de grupo em letra normal (sem caixa alta), com a seta de abrir e fechar e `aria-expanded`;
 * - recolhido: só os ícones, com o nome para o leitor de tela e na dica;
 * - a linha ativa leva `aria-current` (a aparência dela é conferida em `erp-padrao-visual`).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { navegacaoDoParceiro, type ModuloNav } from '@/lib/erp/modulos';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { NavLateral } from '@/components/erp/shell/NavLateral';

const nav = navegacaoDoParceiro(resolverAlcance({
  perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [],
}), NENHUM_MODULO_LIBERADO);
const emUso = nav.modulos.filter((m) => m.href);
const menu = (modulo: ModuloNav | null, hrefAtivo: string | null, recolhido = false) => renderToStaticMarkup(createElement(NavLateral, {
  nav, estado: { modulo, hrefAtivo }, contexto: 'Casa de teste', versao: 'Teste', recolhido,
}));
/** As linhas do menu (links com `ff-nav-item`), com as classes e o miolo. */
const linhas = (h: string) => [...h.matchAll(/<a\b[^>]*class="([^"]*ff-nav-item[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ classe: m[1].split(' '), miolo: m[2], tag: m[0] }));

describe('menu lateral em lista (A2)', () => {
  it('cada tela é uma linha: ícone à esquerda, nome alinhado à esquerda, 44 px de altura mínima, nada empilhado', () => {
    const area = emUso.find((m) => m.grupos.some((g) => g.itens.length > 1))!;
    const h = menu(area, area.grupos[0].itens[0].href);
    const itens = linhas(h);
    expect(itens.length).toBeGreaterThan(2);
    for (const i of itens) {
      expect(i.classe).toEqual(expect.arrayContaining(['min-h-11', 'items-center', 'gap-3', 'px-3', 'text-left']));
      expect(i.classe).not.toEqual(expect.arrayContaining(['flex-col']));
      expect(i.classe).not.toContain('text-center');
      // O nome vem depois do ícone e nunca é cortado.
      expect(i.miolo).toMatch(/<svg[\s\S]*<\/svg><span class="ff-nav-rotulo [^"]*flex-1[^"]*">/);
      expect(i.miolo).not.toMatch(/truncate|line-clamp/);
    }
    expect(h).toContain('class="ff-nav-lista mt-3"');
    expect(h).not.toContain('ff-nav-grade');
  });

  it('a linha ativa leva `aria-current`; as outras, não', () => {
    const area = emUso[0];
    const ativo = area.grupos[0].itens[0].href;
    const itens = linhas(menu(area, ativo));
    const marcadas = itens.filter((i) => /aria-current="page"/.test(i.tag));
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0].tag).toContain(`href="${ativo}"`);
  });

  it('no Início, cada área com o quadrado de cor cheia e o mesmo destino; o Início também', () => {
    const h = menu(null, nav.inicio.href);
    const itens = linhas(h);
    expect(itens).toHaveLength(emUso.length + 1);
    for (const i of itens) expect(i.miolo).toMatch(/ff-icone-modulo ff-icone-cheio/);
    for (const m of emUso) {
      const linha = itens.find((i) => i.tag.includes(`href="${m.href}"`));
      expect(linha?.tag, m.nome).toContain(`style="--cor-modulo:${m.cor}"`);
    }
    expect(itens.filter((i) => /aria-current="page"/.test(i.tag))).toHaveLength(1);
  });

  it('cabeçalho de grupo em letra normal, sem caixa alta, com a seta e `aria-expanded`', () => {
    const area = emUso.find((m) => m.grupos.some((g) => g.itens.length > 1 || g.itens[0].rotulo.toLowerCase() !== g.rotulo.toLowerCase()))!;
    const h = menu(area, null);
    const cabecalhos = [...h.matchAll(/<button type="button" aria-expanded="true" class="([^"]+)">([\s\S]*?)<\/button>/g)];
    expect(cabecalhos.length).toBeGreaterThan(0);
    for (const [, classe, miolo] of cabecalhos) {
      expect(classe.split(' ')).toEqual(expect.arrayContaining(['text-[13px]', 'font-semibold', 'text-suave']));
      expect(classe).not.toMatch(/\buppercase\b|tracking-/);
      expect(miolo).toMatch(/lucide-chevron-down/);
    }
  });

  it('recolhido: só os ícones, com o nome escondido para o leitor de tela e na dica', () => {
    const area = emUso[0];
    const itens = linhas(menu(area, null, true));
    expect(itens.length).toBeGreaterThan(0);
    for (const i of itens) {
      expect(i.classe).toEqual(expect.arrayContaining(['justify-center']));
      expect(i.tag).toMatch(/title="[^"]+"/);
      expect(i.miolo).toMatch(/<span class="sr-only">/);
    }
  });
});
