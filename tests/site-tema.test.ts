/**
 * E5.1 · decisão 471 — o site e o Portal em claro e escuro, com contraste mínimo nos dois temas.
 * Lê as variáveis `--site-*` de `src/app/globals.css` (claro em `:root`, escuro no `prefers-color-scheme: dark`) e
 * confere cada par de texto e fundo que as telas usam: texto pequeno ≥ 4,5:1.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/globals.css', 'utf8');
const bloco = (inicio: number) => css.slice(inicio, css.indexOf('}', inicio));
const ler = (trecho: string) =>
  Object.fromEntries([...trecho.matchAll(/--site-([\w-]+):\s*(\d+) (\d+) (\d+);/g)].map((m) => [m[1], [Number(m[2]), Number(m[3]), Number(m[4])] as const]));
const claro = ler(bloco(css.indexOf('--site-surface')));
const escuro = { ...claro, ...ler(bloco(css.indexOf('body:has(.ff-site) {'))) };

type Cor = readonly [number, number, number];
const lum = ([r, g, b]: Cor) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contraste = (a: Cor, b: Cor) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const mistura = (fg: Cor, bg: Cor, alfa: number): Cor => [0, 1, 2].map((i) => fg[i] * alfa + bg[i] * (1 - alfa)) as unknown as Cor;
const BRANCO: Cor = [255, 255, 255];

describe('E5.1 · tema do site e do Portal (decisão 471)', () => {
  it('as duas paletas têm os mesmos nomes, e o escuro é escuro de verdade', () => {
    expect(Object.keys(escuro).sort()).toEqual(Object.keys(claro).sort());
    expect(lum(escuro.surface)).toBeLessThan(0.02);
    expect(lum(claro.surface)).toBeGreaterThan(0.8);
  });

  for (const [nome, t] of [['claro', claro], ['escuro', escuro]] as const) {
    it(`${nome}: texto pequeno com pelo menos 4,5:1`, () => {
      const pares: [string, Cor, Cor][] = [
        ['ink sobre o fundo', t.ink, t.surface],
        ['ink-3 sobre o fundo', t['ink-3'], t.surface],
        ['ink-4 sobre o fundo', t['ink-4'], t.surface],
        ['ink-5 sobre o fundo', t['ink-5'], t.surface],
        ['ink-5 sobre o cartão', t['ink-5'], t.papel],
        ['realce sobre o fundo', t.realce, t.surface],
        ['realce sobre o cartão', t.realce, t.papel],
        ['texto da faixa', t['bloco-texto'], t.bloco],
        ['realce da faixa', t['bloco-realce'], t.bloco],
        ['branco no botão vermelho', BRANCO, t.primary],
        ['branco no hover do botão', BRANCO, t['primary-dark']],
        ['texto do Portal a 70%', mistura(t.ink, t.surface, 0.7), t.surface],
        ['texto do Portal a 70% no cartão', mistura(t.ink, t.papel, 0.7), t.papel],
        ['botão escuro (ink com texto do fundo)', t.surface, t.ink],
      ];
      for (const [o, fg, bg] of pares) expect(contraste(fg, bg), `${nome}: ${o}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('o vermelho da identidade (#EA1D2C) fica só na marca; o de texto e o de botão são os acessíveis', () => {
    expect(claro.marca).toEqual([234, 29, 44]);
    expect(claro.primary).toEqual([196, 21, 34]);
    expect(escuro.realce).toEqual([245, 82, 90]);
  });
});
