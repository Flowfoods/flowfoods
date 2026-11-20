/**
 * Visual da Apple no ERP, fatia A5 (decisão 534): as folhas. Sem banco e sem navegador:
 *
 * - diálogo que não é gaveta: a barra das folhas, com o título no centro (17 px/600) e o fechar redondo na ponta;
 * - gavetas (menu e ajuda): o título em Gelasio à esquerda, como antes, e o mesmo fechar redondo;
 * - no celular, a folha entra de baixo para cima (28 px, 220 ms, como a gaveta de lado) e tem os cantos de 14 px;
 * - o contrato do diálogo nativo não muda (showModal, Escape, clique no fundo, foco que volta).
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialogo } from '@/components/erp/ui/Dialogo';

const css = readFileSync('src/components/erp/tokens.css', 'utf8');
const marcar = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(Dialogo, { aberto: true, aoFechar: () => {}, titulo: 'Imprimir a ficha', children: createElement('p', null, 'corpo'), ...props }));

describe('folhas da Apple · barra', () => {
  it('diálogo: título no centro em 17 px/600 (letra do sistema), com uma coluna vazia do tamanho do fechar à esquerda', () => {
    const h = marcar({});
    // py-2: folga para o anel de foco do fechar (com py-1.5 ele perdia 1 px em cima, cortado pela borda do diálogo).
    expect(h).toMatch(/<header class="grid grid-cols-\[2\.75rem_minmax\(0,1fr\)_2\.75rem\] items-center gap-2 border-b border-linha px-2 py-2"><span aria-hidden="true"><\/span><h2 data-ff-titulo="true" tabindex="-1" class="min-w-0 break-words text-center text-\[17px\] font-semibold leading-snug focus:outline-none">Imprimir a ficha<\/h2>/);
    expect(h).not.toContain('font-display');
  });

  it('título sem contorno só no foco: com cores forçadas, o contorno transparente do Tailwind não vira uma caixa em volta dele', () => {
    for (const props of [{}, { gaveta: true }]) {
      const h2 = /<h2 data-ff-titulo="true"[^>]*class="([^"]*)"/.exec(marcar(props))![1].split(' ');
      expect(h2).toContain('focus:outline-none');
      expect(h2).not.toContain('outline-none');
    }
  });

  it('gaveta: o título segue em Gelasio à esquerda', () => {
    const h = marcar({ gaveta: true, titulo: 'Menu' });
    expect(h).toMatch(/<h2 data-ff-titulo="true" tabindex="-1" class="min-w-0 break-words font-display text-\[20px\] font-normal[^"]*">Menu<\/h2>/);
    expect(h).not.toContain('grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]');
  });

  it('o fechar é redondo (30 px, no preenchimento) com alvo de 44 px, nos dois tipos', () => {
    for (const props of [{}, { gaveta: true }]) {
      const h = marcar(props);
      expect(h).toMatch(/<button type="button" aria-label="Fechar" class="group inline-grid h-11 w-11 shrink-0 place-items-center rounded-full"><span class="ff-transicao grid h-\[30px\] w-\[30px\] place-items-center rounded-full bg-preenchimento text-suave group-hover:bg-preenchimento-forte group-hover:text-texto"><svg/);
    }
  });

  it('título escondido (busca ⌘K): fica só o título, para o leitor de tela; sem a barra e sem um fechar invisível no Tab', () => {
    const h = marcar({ esconderTitulo: true, sheet: true, titulo: 'Buscar' });
    expect(h).toContain('<div class="flex h-full flex-col"><h2 data-ff-titulo="true" tabindex="-1" class="sr-only">Buscar</h2><p>corpo</p></div>');
    expect(h).not.toContain('<header');
    expect(h).not.toContain('aria-label="Fechar"');
    // A busca traz o próprio fechar (e o Escape fecha, como em todo diálogo).
    expect(readFileSync('src/components/erp/shell/BuscaGlobal.tsx', 'utf8')).toMatch(/esconderTitulo[\s\S]*aria-label="Fechar a busca"/);
  });

  it('o contrato do diálogo nativo não muda', () => {
    const fonte = readFileSync('src/components/erp/ui/Dialogo.tsx', 'utf8');
    expect(fonte).toMatch(/el\.showModal\(\)/);
    expect(fonte).toMatch(/onCancel=/);
    expect(fonte).toMatch(/if \(e\.target === e\.currentTarget\) fechar\.current\(\);/);
    expect(fonte).toMatch(/\(destino\?\.current \?\? antes\)\?\.focus\(\)/);
    expect(fonte.match(/<BotaoFechar aoFechar=\{\(\) => fechar\.current\(\)\} \/>/g)).toHaveLength(2);
  });
});

describe('folhas da Apple · no celular', () => {
  // O bloco `@media (max-width: 599px)` inteiro, pelas chaves: recortar até o fim do arquivo deixaria passar uma regra da
  // folha fora dele (e a busca e a ajuda no computador entrariam de baixo).
  const inicio = css.indexOf('@media (max-width: 599px) {');
  let fim = css.indexOf('{', inicio);
  for (let n = 0; fim < css.length; fim++) {
    if (css[fim] === '{') n++;
    else if (css[fim] === '}' && --n === 0) break;
  }
  const celular = css.slice(inicio, fim + 1);
  const fora = css.slice(0, inicio) + css.slice(fim + 1);

  it('a entrada de baixo e os cantos de 14 px ficam só no celular', () => {
    expect(celular.endsWith('}\n}')).toBe(true);
    expect(celular).toContain('.ff-app dialog.ff-dialogo.ff-sheet[open] {');
    expect(fora).not.toMatch(/ff-sheet\[open\]|ff-folha var|border-radius: 14px 14px 0 0/);
  });

  it('abaixo de 600 px: presa embaixo, cantos de 14 px, e entra de baixo para cima', () => {
    const folha = celular.slice(celular.indexOf('.ff-app dialog.ff-dialogo.ff-sheet {'));
    expect(folha.slice(0, folha.indexOf('}'))).toContain('border-radius: 14px 14px 0 0');
    expect(celular).toMatch(/\.ff-app dialog\.ff-dialogo\.ff-sheet\[open\] \{\s*animation: ff-folha var\(--ff-movimento\) var\(--ff-curva-entrada\);/);
  });

  it('a entrada: opacidade e 28 px de baixo (a mesma distância da gaveta de lado); sem animação de saída', () => {
    expect(css).toMatch(/@keyframes ff-folha \{\s*from \{\s*opacity: 0;\s*transform: translateY\(28px\);\s*\}\s*to \{\s*opacity: 1;\s*transform: none;\s*\}\s*\}/);
    expect(css).toMatch(/@keyframes ff-gaveta \{\s*from \{\s*opacity: 0;\s*transform: translateX\(-28px\);/);
  });

  it('a folha da ajuda (gaveta da direita que vira folha no celular) usa a entrada da folha: a regra dela vem depois', () => {
    expect(css.indexOf('.ff-app dialog.ff-dialogo.ff-sheet[open] {')).toBeGreaterThan(css.indexOf('.ff-app dialog.ff-gaveta.ff-gaveta-direita[open] {'));
  });
});

describe('folhas da Apple · contraste do fechar', () => {
  type RGB = [number, number, number];
  const variaveis = (seletor: string): Record<string, string> => {
    const i = css.indexOf(seletor);
    const corpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
    return Object.fromEntries([...corpo.matchAll(/--ff-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]));
  };
  const canais = (v: string): RGB => v.split(' ').map(Number) as RGB;
  const comAlfa = (v: string) => {
    const m = v.match(/^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/)!;
    return { cor: [Number(m[1]), Number(m[2]), Number(m[3])] as RGB, alfa: Number(m[4]) };
  };
  const sobre = ({ cor, alfa }: { cor: RGB; alfa: number }, fundo: RGB): RGB => cor.map((n, i) => n * alfa + fundo[i] * (1 - alfa)) as RGB;
  const lum = (c: RGB) => c.map((n) => n / 255).map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)).reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
  const contraste = (a: RGB, b: RGB) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const [tema, seletor] of [['claro', ".ff-app[data-tema='claro'] {"], ['escuro', ".ff-app[data-tema='escuro'] {"]] as const) {
    it(`${tema}: o X no suave sobre o círculo (preenchimento e, sob o ponteiro, preenchimento forte) tem ≥ 3:1`, () => {
      const t = variaveis(seletor);
      for (const nome of ['preenchimento', 'preenchimento-forte']) {
        const circulo = sobre(comAlfa(t[nome]), canais(t.painel));
        expect(contraste(canais(t.suave), circulo), `${tema}/${nome}/suave`).toBeGreaterThanOrEqual(3);
        expect(contraste(canais(t.texto), circulo), `${tema}/${nome}/texto`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
