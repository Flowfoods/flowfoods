/**
 * Identidade cromática de 29/10: card, menu e seletor usam a cor já definida
 * pela área, sem ampliar destinos/permissões. Contraste cobre a paleta inteira
 * sobre as superfícies normais/realçadas, nos dois temas.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COR, itemAtivo, navegacaoDoParceiro, type ModuloNav } from '@/lib/erp/modulos';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { AreasDoSeletor, NavLateral } from '@/components/erp/shell/NavLateral';
import { CartaoModulo } from '@/components/erp/ui/hub';

const navDoPerfil = (perfilBase: 'DONO' | 'OPERADOR') => navegacaoDoParceiro(resolverAlcance({
  perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [],
}), NENHUM_MODULO_LIBERADO);
const nav = navDoPerfil('DONO');
// Áreas em uso (com tela) e o catálogo "Em breve" (10/11/2026) saem da mesma navegação, mas não se misturam.
const emUso = nav.modulos.filter((m) => m.href);
const emBreve = nav.modulos.filter((m) => !m.href);
const cartao = (m: ModuloNav) => renderToStaticMarkup(createElement(CartaoModulo, {
  c: { ...m, abas: m.grupos.flatMap((g) => g.itens.map(({ rotulo, href }) => ({ rotulo, href }))) },
}));
const menu = (modulo: ModuloNav | null, recolhido = false) => renderToStaticMarkup(createElement(NavLateral, {
  nav, estado: { modulo, hrefAtivo: modulo?.href ?? nav.inicio.href }, contexto: 'Casa de teste', versao: 'Teste', recolhido,
}));
const links = (h: string) => [...h.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
const atributo = (attrs: string, nome: string) => new RegExp(`${nome}="([^"]*)"`).exec(attrs)?.[1];

describe('Identidade central das áreas no hub e no menu', () => {
  it('cada card e sua entrada no menu recebem a mesma cor central, com destinos preservados', () => {
    const entradas = links(menu(null));
    expect(emUso).toHaveLength(7);
    for (const m of emUso) {
      const h = cartao(m);
      expect(h).toContain(`style="--cor-modulo:${m.cor}"`);
      expect(h).toContain(`href="${m.href}"`);
      const entrada = entradas.find((a) => atributo(a[1], 'href') === m.href);
      expect(entrada?.[1]).toContain(`--cor-modulo:${m.cor}`);
      // Card com atalhos: irmãos clicáveis, nunca links aninhados.
      expect(h).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/);
    }
  });

  it('ativo continua anunciado em cada área, no menu aberto e recolhido, com o mesmo mapeamento', () => {
    for (const m of emUso) {
      expect(itemAtivo(nav, m.href!)?.modulo.chave).toBe(m.chave);
      for (const recolhido of [false, true]) {
        const h = menu(m, recolhido);
        const ativo = links(h).find((a) => atributo(a[1], 'aria-current') === 'page');
        expect(atributo(ativo![1], 'href')).toBe(m.href);
        expect(ativo![1]).toContain(`--cor-modulo:${m.cor}`);
        expect(ativo![2]).toContain(m.grupos[0].itens[0].rotulo);
        if (recolhido) expect(ativo![2]).toContain('sr-only');
      }
    }
  });

  it('futuro mantém identidade e selo, mas não ganha link nem atalhos', () => {
    const h = renderToStaticMarkup(createElement(CartaoModulo, {
      c: { chave: 'futuro', nome: 'Módulo futuro', subtitulo: 'Ainda em preparação', icone: 'compras', cor: COR.compras, href: null },
    }));
    expect(h).toContain('aria-disabled="true"');
    expect(h).toContain('Em breve');
    expect(h).toContain(`--cor-modulo:${COR.compras}`);
    expect(h).not.toContain('href=');
  });

  it('catálogo "Em breve": card neutro, com selo e sem controle; o menu lateral não ganha entrada para ele', () => {
    expect(emBreve).toHaveLength(18);
    const noMenu = menu(null);
    for (const m of emBreve) {
      const h = cartao(m);
      // Neutro de propósito: a cor de área fica para o que já tem tela.
      expect(m.cor).toBe(COR.futuro);
      expect(h).toContain(`style="--cor-modulo:${COR.futuro}"`);
      expect(h).toContain('aria-disabled="true"');
      expect(h).toContain('Em breve');
      expect(h).not.toMatch(/href=|<a[ >]|<button|tabindex/);
      // A grade do menu é de destinos: módulo sem tela não entra nela (aberta nem recolhida).
      expect(noMenu).not.toContain(m.nome);
      expect(menu(null, true)).not.toContain(m.nome);
    }
    // Os únicos links do menu: a marca e o Início (os dois para o hub) e uma célula por área em uso.
    expect(links(noMenu).map((a) => atributo(a[1], 'href'))).toEqual([nav.inicio.href, nav.inicio.href, ...emUso.map((m) => m.href)]);
  });

  it('seletor de áreas: em uso com link e a atual marcada; "Em breve" num grupo separado, com nome, finalidade e selo, sem link', () => {
    const h = renderToStaticMarkup(createElement(AreasDoSeletor, { nav, atual: emUso[2], aoEscolher: () => {} }));
    const [areas, futuros] = h.split(/<p id="[^"]*"[^>]*>Em breve<\/p>/);
    expect(futuros, 'o grupo "Em breve" existe e vem depois das áreas').toBeTruthy();
    // Em uso: um link por área (mais o Início), a atual com aria-current, cada uma com a cor dela.
    expect(links(areas).map((a) => atributo(a[1], 'href'))).toEqual([nav.inicio.href, ...emUso.map((m) => m.href)]);
    expect(links(areas).filter((a) => atributo(a[1], 'aria-current') === 'true').map((a) => atributo(a[1], 'href'))).toEqual([emUso[2].href]);
    for (const m of emBreve) expect(areas).not.toContain(m.nome);
    // Em breve: lista ligada ao rótulo do grupo; cada item é texto (nome, finalidade, selo), nunca controle.
    expect(futuros).toMatch(/^<ul aria-labelledby="[^"]+">/);
    expect(futuros).not.toMatch(/href=|<a[ >]|<button|tabindex/);
    const itens = futuros.split('<li>').slice(1);
    expect(itens).toHaveLength(18);
    itens.forEach((item, n) => {
      expect(item).toContain(emBreve[n].nome);
      expect(item).toContain(emBreve[n].subtitulo);
      expect(item).toContain('Em breve');
      expect(item).toContain('aria-disabled="true"');
      expect(item.includes('Bloqueado.')).toBe(emBreve[n].nome === 'CRM Time' || emBreve[n].nome === 'CRM Clube');
    });
    // Nomes inteiros: nada de corte por reticências no seletor nem na grade do menu.
    expect(h).not.toMatch(/truncate|line-clamp/);
    expect(menu(emUso[2])).not.toMatch(/ff-nav-rotulo[^"]*(truncate|line-clamp)/);
  });

  it('o operador continua sem Compras, DRE, Precificação e Integrações não liberadas', () => {
    const n = navDoPerfil('OPERADOR');
    const h = renderToStaticMarkup(createElement(NavLateral, {
      nav: n, estado: { modulo: null, hrefAtivo: n.inicio.href }, contexto: 'Casa', versao: 'Teste',
    }));
    expect(h).not.toMatch(/href="\/erp\/(compras|dre|faturamento|integracoes)/);
    expect(n.modulos.flatMap((m) => m.grupos.flatMap((g) => g.itens)).map((i) => i.href)).not.toContain('/erp/fichas/canais');
  });
});

type RGB = [number, number, number];
const rgb = (hex: string): RGB => hex.slice(1).match(/../g)!.map((x) => parseInt(x, 16)) as RGB;
const mistura = (a: RGB, b: RGB, peso: number): RGB => a.map((n, i) => n * peso + b[i] * (1 - peso)) as RGB;
const luminancia = (cor: RGB) => cor.map((n) => n / 255).map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
  .reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
const contraste = (a: RGB, b: RGB) => (Math.max(luminancia(a), luminancia(b)) + 0.05) / (Math.min(luminancia(a), luminancia(b)) + 0.05);

describe('Contraste da identidade cromática em claro/escuro', () => {
  const css = readFileSync('src/components/erp/tokens.css', 'utf8');
  const bloco = (seletor: string) => css.slice(css.indexOf(seletor)).split('{')[1].split('}')[0];
  const propriedade = (b: string, nome: string) => new RegExp(`--${nome}:\\s*([^;]+);`).exec(b)![1].trim();
  const canal = (b: string, nome: string): RGB => propriedade(b, `ff-${nome}`).split(/\s+/).map(Number) as RGB;
  const identidade = bloco('.ff-app .ff-identidade-modulo');
  // Lê as proporções efetivamente configuradas, para futuras mudanças passarem pela mesma régua.
  const pesoDoFundo = (nome: string) => Number(/\)\s*(\d+)%/.exec(propriedade(identidade, nome))![1]) / 100;

  for (const [tema, seletor] of [['claro', ".ff-app[data-tema='claro']"], ['escuro', ".ff-app[data-tema='escuro']"]] as const) {
    it(`${tema}: texto >= 4,5:1 e ícones >= 3:1 em toda cor e estado`, () => {
      const b = bloco(seletor);
      const texto = canal(b, 'texto');
      const suave = canal(b, 'suave');
      const painel = canal(b, 'painel');
      const tinta = parseFloat(propriedade(b, 'ff-icone-tinta')) / 100;
      for (const [nome, cor] of Object.entries(COR)) {
        for (const estado of ['ff-modulo-fundo', 'ff-modulo-realce']) {
          const fundo = mistura(rgb(cor), painel, pesoDoFundo(estado));
          const icone = mistura(rgb(cor), texto, tinta);
          expect(contraste(texto, fundo), `${nome}/${estado}/texto`).toBeGreaterThanOrEqual(4.5);
          expect(contraste(suave, fundo), `${nome}/${estado}/apoio`).toBeGreaterThanOrEqual(4.5);
          expect(contraste(icone, fundo), `${nome}/${estado}/ícone`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
});

