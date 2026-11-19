/**
 * Visual da Apple, fatia A2 (decisão 531): o menu lateral em lista, como a barra lateral do iPad — sem banco e sem navegador.
 *
 * - uma linha por tela: ícone à esquerda, nome alinhado e que quebra (nunca corta), 44 px de altura mínima;
 * - no Início, cada área com o quadrado de cor cheia (como nos Ajustes do iPhone), com o mesmo destino de antes;
 * - cabeçalho de grupo em letra normal (sem caixa alta), com a seta de abrir e fechar e `aria-expanded`;
 * - recolhido: só os ícones, com o nome para o leitor de tela e na dica;
 * - a linha ativa leva `aria-current` (a aparência dela é conferida em `erp-padrao-visual`).
 */
import { readFileSync } from 'node:fs';
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
    // O quadrado dos Ajustes do iPhone: 28 px, raio de 7 px, cor cheia com o desenho claro.
    for (const i of itens) expect(i.miolo).toMatch(/class="ff-icone-modulo ff-icone-cheio inline-grid shrink-0 place-items-center rounded-\[7px\]" style="--cor-modulo:#[0-9A-Fa-f]{6};width:28px;height:28px"/);
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

  it('recolhido no Início: o ícone de 18 px de antes, sem o quadrado (o quadrado é só da lista aberta)', () => {
    const itens = linhas(menu(null, nav.inicio.href, true));
    expect(itens).toHaveLength(emUso.length + 1);
    for (const i of itens) {
      expect(i.miolo).not.toContain('ff-icone-cheio');
      expect(i.miolo).toMatch(/<svg[^>]*width="18"[^>]*class="[^"]*ff-nav-icone/);
    }
  });

  it('a lateral do menu tem 8 px de cada lado: o anel de foco (3 px + 4 px de folga) cabe sem ser cortado pela rolagem', () => {
    const h = menu(emUso[0], null);
    expect(h).toMatch(/<nav aria-label="Menu" class="min-h-0 flex-1 overflow-y-auto px-2 pb-4 \[scrollbar-width:thin\]">/);
    expect(menu(emUso[0], null, true)).toMatch(/<nav aria-label="Menu" class="[^"]*\bpx-2\b/);
  });
});

describe('menu lateral em lista (A2) · regras de CSS que o navegador aplica', () => {
  const css = readFileSync('src/components/erp/tokens.css', 'utf8');
  const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ seletor: m[1].trim().split('\n').pop()!.trim(), corpo: m[2] }));

  it('uma coluna só: nenhuma outra regra muda as colunas da lista (uma regra posterior não pode voltar à grade)', () => {
    const colunas = regras.filter((r) => r.seletor.includes('ff-nav-lista') && /grid-template-columns|columns:|grid-auto-flow/.test(r.corpo));
    expect(colunas.map((r) => r.seletor)).toEqual(['.ff-app .ff-nav-lista']);
    expect(colunas[0].corpo).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('cores forçadas: o ícone do ativo herda a cor do link (claro sobre o fundo claro do sistema, sumia)', () => {
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.ff-app \.ff-nav-item\[aria-current='page'\] \.ff-nav-icone \{\s*color: inherit;\s*\}\s*\}/);
  });

  it('o quadrado do Início, na linha ativa da mesma cor, ganha um contorno claro', () => {
    const r = regras.find((x) => x.seletor === ".ff-app .ff-nav-item[aria-current='page'] .ff-icone-cheio");
    expect(r?.corpo).toContain('0 0 0 1.5px rgb(var(--ff-sobre-acao) / 0.85)');
  });
});
