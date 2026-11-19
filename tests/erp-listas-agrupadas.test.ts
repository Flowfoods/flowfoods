/**
 * Visual da Apple no ERP, fatia A4 (decisão 533): listas agrupadas no celular e o interruptor dos Ajustes. Sem banco e sem
 * navegador:
 *
 * - as listas que viram linhas no celular (insumos, fichas, notas de compra) com o separador recuado, a seta de abrir e o
 *   nome em 17 px; no celular, o painel em volta perde a borda e fica com o raio de 12 px do grupo;
 * - "onde fica" (ficha) e "prazo depois de aberto" (insumo) ligam e desligam com um interruptor (`role="switch"`), sem mudar
 *   o nome nem o valor que o formulário manda;
 * - contraste do interruptor ligado e desligado, nos dois temas;
 * - "Principal" cabe a 320 px.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Painel } from '@/components/erp/ui/superficies';
import { INTERRUPTOR, MARCAR } from '@/components/erp/ui/campos';
import { CamposDeValidade } from '@/components/erp/telas/cadastro/campos-validade';
import { CamposDeConservacao } from '@/components/erp/telas/insumos/campos-conservacao';

const css = readFileSync('src/components/erp/tokens.css', 'utf8');
function regra(seletor: string): string {
  const i = css.indexOf(`${seletor} {`);
  if (i < 0) throw new Error(`regra não encontrada: ${seletor}`);
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
}

describe('listas agrupadas no celular', () => {
  const LISTAS = ['src/components/erp/telas/insumos/lista.tsx', 'src/components/erp/telas/fichas/lista.tsx', 'src/components/erp/telas/compras/lista-notas.tsx'];

  it('insumos, fichas e notas: a lista do celular é agrupada, com o nome em 17 px e a seta de abrir', () => {
    for (const a of LISTAS) {
      const s = readFileSync(a, 'utf8');
      expect(s, a).toContain('<ul className="ff-lista-agrupada sm:hidden">');
      expect(s, a).not.toContain('<ul className="divide-y divide-linha sm:hidden">');
      expect(s, a).toMatch(/text-\[17px\] font-medium leading-snug/);
      expect(s, a).toContain('<ChevronRight size={16} aria-hidden className="ff-seta-da-linha" />');
      // A seta fica dentro do link da linha (o alvo inteiro abre o detalhe), depois do valor.
      const link = s.slice(s.indexOf('<ul className="ff-lista-agrupada'), s.indexOf('</ul>', s.indexOf('<ul className="ff-lista-agrupada')));
      expect(link.indexOf('ff-seta-da-linha'), a).toBeLessThan(link.indexOf('</Link>'));
    }
  });

  it('separador recuado como nos Ajustes (16 px), entre as linhas, sem pegar o toque', () => {
    expect(regra('.ff-app .ff-lista-agrupada > li')).toContain('position: relative');
    const sep = regra('.ff-app .ff-lista-agrupada > li + li::before');
    for (const d of ["content: ''", 'position: absolute', 'top: 0', 'right: 0', 'left: 16px', 'border-top: 1px solid var(--ff-linha)', 'pointer-events: none']) expect(sep).toContain(d);
    expect(regra('.ff-app .ff-seta-da-linha')).toContain('color: rgb(var(--ff-suave))');
  });

  it('no celular, o painel da lista perde a borda e fica com o raio de 12 px; no alto contraste, a borda volta', () => {
    const celular = css.slice(css.indexOf('@media (max-width: 639px) {\n  .ff-app .ff-painel:has(.ff-lista-agrupada)'));
    expect(celular).toMatch(/^@media \(max-width: 639px\) \{\s*\.ff-app \.ff-painel:has\(\.ff-lista-agrupada\) \{\s*border-color: transparent;\s*border-radius: 12px;/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.ff-app \.ff-painel:has\(\.ff-lista-agrupada\) \{\s*border-color: CanvasText;/);
    expect(renderToStaticMarkup(createElement(Painel, { children: 'x' }))).toMatch(/^<section class="ff-painel min-w-0 rounded-cartao border border-linha bg-painel /);
  });
});

describe('interruptor dos Ajustes', () => {
  it('51 × 31 px; desligado com contorno no suave; ligado no verde do ok com o polegar à direita; foco visível', () => {
    expect(INTERRUPTOR).toBe('ff-interruptor');
    const base = regra('.ff-app .ff-interruptor');
    for (const d of ['width: 51px', 'height: 31px', 'appearance: none', 'border-radius: 16px', 'background-color: var(--ff-preenchimento-forte)', 'box-shadow: inset 0 0 0 1px rgb(var(--ff-suave))']) expect(base).toContain(d);
    const polegar = regra('.ff-app .ff-interruptor::after');
    for (const d of ['width: 27px', 'height: 27px', 'border-radius: 50%']) expect(polegar).toContain(d);
    expect(regra('.ff-app .ff-interruptor:checked')).toContain('background-color: rgb(var(--ff-ok))');
    expect(regra('.ff-app .ff-interruptor:checked::after')).toContain('transform: translateX(20px)');
    expect(regra('.ff-app .ff-interruptor:focus-visible')).toContain('outline: 3px solid rgb(var(--ff-acento))');
  });

  it('com cores forçadas, volta a ser a caixa do sistema; sem animação com movimento reduzido', () => {
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.ff-app \.ff-interruptor \{[^}]*appearance: auto;[^}]*\}\s*\.ff-app \.ff-interruptor::after \{\s*display: none;/);
    // Movimento reduzido: a regra geral já pega o trilho e o polegar (`*` e `*::after`).
    const i = css.indexOf('@media (prefers-reduced-motion: reduce) {');
    const geral = css.slice(i, css.indexOf('\n}\n', i));
    expect(geral).toMatch(/\.ff-app \*,\s*\.ff-app \*::before,\s*\.ff-app \*::after,/);
    expect(geral).toContain('transition: none !important;');
  });

  type RGB = [number, number, number];
  const variaveis = (seletor: string): Record<string, string> => {
    const i = css.indexOf(seletor);
    const corpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
    return Object.fromEntries([...corpo.matchAll(/--ff-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]));
  };
  const canais = (v: string): RGB => v.split(' ').map(Number) as RGB;
  const lum = (c: RGB) => c.map((n) => n / 255).map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)).reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
  const contraste = (a: RGB, b: RGB) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const [tema, seletor] of [['claro', ".ff-app[data-tema='claro'] {"], ['escuro', ".ff-app[data-tema='escuro'] {"]] as const) {
    it(`${tema}: ligado (ok) e contorno do desligado (suave) com ≥ 3:1 sobre o painel e o fundo`, () => {
      const t = variaveis(seletor);
      for (const sobre of [canais(t.painel), canais(t.fundo)]) {
        expect(contraste(canais(t.ok), sobre), `${tema}/ok`).toBeGreaterThanOrEqual(3);
        expect(contraste(canais(t.suave), sobre), `${tema}/suave`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('"onde fica" da ficha: interruptor com o mesmo nome e valor de antes; o "Principal" segue rádio; cabe a 320 px', () => {
    const h = renderToStaticMarkup(createElement(CamposDeValidade, { para: 'ficha', inicial: null, erros: {}, idBase: 'f' }));
    const chaves = [...h.matchAll(/<input type="checkbox" role="switch" class="ff-interruptor" name="(aceita_[A-Z_]+)"/g)].map((m) => m[1]);
    expect(chaves).toEqual(['aceita_SECO', 'aceita_PISTA_FRIA', 'aceita_REFRIGERADO', 'aceita_CONGELADO']);
    // O "Principal" segue rádio, no estilo de marcar de antes.
    expect(h.match(/<input type="radio"[^>]*class="h-5 w-5 shrink-0 accent-\[rgb\(var\(--ff-acao\)\)\][^"]*" name="conservacao"/g)).toHaveLength(4);
    expect(MARCAR).toBe('h-5 w-5 shrink-0 accent-[rgb(var(--ff-acao))]');
    expect(h).toContain('grid grid-cols-[5rem_6rem_minmax(0,1fr)]');
    expect(h).not.toContain('grid-cols-[5.5rem_6.5rem_minmax(0,1fr)]');
    // O interruptor vem depois do nome, na ponta da linha, e o rótulo envolve tudo (o toque na linha inteira liga e desliga).
    expect(h).toMatch(/<label class="col-span-3 flex min-h-11 cursor-pointer[^"]*"><svg[\s\S]*?<span class="min-w-0 flex-1 text-texto">[^<]+<\/span><input type="checkbox" role="switch"/);
  });

  it('"prazo depois de aberto" do insumo: interruptor com o mesmo nome; "conservação principal" segue ao lado do nome', () => {
    const fonte = readFileSync('src/components/erp/telas/insumos/campos-conservacao.tsx', 'utf8');
    expect(fonte).toMatch(/type="checkbox"\s*role="switch"\s*name=\{`aceita_\$\{c\}`\}/);
    expect(fonte).toContain('className={INTERRUPTOR}');
    expect(fonte).toContain('<span className="ml-2 text-[12px] text-suave">conservação principal</span>');
    expect(typeof CamposDeConservacao).toBe('function');
  });
});
