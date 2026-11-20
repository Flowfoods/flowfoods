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
import { ROTULO_DA_OPCAO } from '@/lib/erp/validade';

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
      expect(s, a).toMatch(/<ul className="ff-lista-agrupada sm:hidden"(>| style=)/);
      expect(s, a).not.toContain('<ul className="divide-y divide-linha sm:hidden">');
      expect(s, a).toMatch(/text-\[17px\] font-medium leading-snug/);
      expect(s, a).toContain('<ChevronRight size={16} aria-hidden className="ff-seta-da-linha" />');
      // A seta fica dentro do link da linha (o alvo inteiro abre o detalhe), por último: logo antes do fim do link.
      const lista = s.slice(s.indexOf('<ul className="ff-lista-agrupada'), s.indexOf('</ul>', s.indexOf('<ul className="ff-lista-agrupada')));
      expect(lista, a).toMatch(/<ChevronRight size=\{16\} aria-hidden className="ff-seta-da-linha" \/>\s*<\/Link>/);
      // O texto ocupa o meio da linha (o valor e a seta vão para a ponta) e o apoio vem em 13 px.
      expect(lista, a).toContain('<span className="min-w-0 flex-1">');
      expect(lista, a).not.toMatch(/text-\[12px\]/);
    }
  });

  it('fichas: Editar e Remover numa linha própria, embaixo (ao lado, apertavam o nome); o separador começa depois da miniatura', () => {
    const s = readFileSync('src/components/erp/telas/fichas/lista.tsx', 'utf8');
    const lista = s.slice(s.indexOf('<ul className="ff-lista-agrupada'), s.indexOf('</ul>', s.indexOf('<ul className="ff-lista-agrupada')));
    expect(lista).toContain("style={{ '--ff-recuo-da-lista': '72px' } as CSSProperties}");
    expect(lista).toMatch(/\{acoes && \(\s*<div className="-mt-1 flex justify-end px-3 pb-1\.5">\s*<AcoesDaFicha l=\{l\} base=\{base\} f=\{f\} \/>\s*<\/div>\s*\)\}\s*<\/li>/);
    expect(lista).not.toContain('empilhado />\n              </span>');
  });

  it('insumos: o nome quebra em vez de cortar; com a caixa de marcar, o separador começa depois dela', () => {
    const s = readFileSync('src/components/erp/telas/insumos/lista.tsx', 'utf8');
    const lista = s.slice(s.indexOf('<ul className="ff-lista-agrupada'), s.indexOf('</ul>', s.indexOf('<ul className="ff-lista-agrupada')));
    expect(lista).toContain("style={selecionar ? ({ '--ff-recuo-da-lista': '52px' } as CSSProperties) : undefined}");
    expect(lista).toMatch(/<span className=\{`block break-words text-\[17px\] font-medium leading-snug \[overflow-wrap:anywhere\] /);
  });

  it('separador recuado como nos Ajustes (16 px), entre as linhas, sem pegar o toque', () => {
    expect(regra('.ff-app .ff-lista-agrupada > li')).toContain('position: relative');
    const sep = regra('.ff-app .ff-lista-agrupada > li + li::before');
    for (const d of ["content: ''", 'position: absolute', 'top: 0', 'right: 0', 'left: var(--ff-recuo-da-lista, 16px)', 'border-top: 1px solid var(--ff-linha)', 'pointer-events: none']) expect(sep).toContain(d);
    expect(regra('.ff-app .ff-seta-da-linha')).toContain('color: rgb(var(--ff-suave))');
    // Cores forçadas: a seta herda a cor do link (o `suave` cairia a 2,17:1 com o tema cruzado).
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.ff-app \.ff-seta-da-linha \{\s*color: inherit;\s*\}\s*\}/);
  });

  it('no celular, o painel da lista perde a borda e fica com o raio de 12 px; no alto contraste, a borda volta', () => {
    const celular = css.slice(css.indexOf('@media (max-width: 639px) {\n  .ff-app .ff-painel:has(.ff-lista-agrupada)'));
    expect(celular).toMatch(/^@media \(max-width: 639px\) \{\s*\.ff-app \.ff-painel:has\(\.ff-lista-agrupada\) \{\s*border-color: transparent;\s*border-radius: 12px;/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.ff-app \.ff-painel:has\(\.ff-lista-agrupada\) \{\s*border-color: CanvasText;/);
    expect(renderToStaticMarkup(createElement(Painel, { children: 'x' }))).toMatch(/^<section class="ff-painel min-w-0 rounded-cartao border border-linha bg-painel /);
  });
});

describe('interruptor dos Ajustes', () => {
  it('51 × 31 px; desligado com contorno no suave; ligado no verde do ok com o polegar à direita; o foco é o anel neutro dos campos', () => {
    expect(INTERRUPTOR).toBe('ff-interruptor');
    const base = regra('.ff-app .ff-interruptor');
    for (const d of ['width: 51px', 'height: 31px', 'appearance: none', 'border-radius: 16px', 'background-color: var(--ff-preenchimento-forte)', 'box-shadow: inset 0 0 0 1px rgb(var(--ff-suave))']) expect(base).toContain(d);
    const polegar = regra('.ff-app .ff-interruptor::after');
    for (const d of ['width: 27px', 'height: 27px', 'border-radius: 50%']) expect(polegar).toContain(d);
    expect(regra('.ff-app .ff-interruptor:checked')).toContain('background-color: rgb(var(--ff-ok))');
    expect(regra('.ff-app .ff-interruptor:checked::after')).toContain('transform: translateX(20px)');
    // O foco é o dos campos (neutro: vermelho no campo quer dizer erro); uma regra própria perderia para essa e nunca valeria.
    expect(css).not.toContain('.ff-interruptor:focus-visible');
    expect(css).toMatch(/\.ff-app\.ff-app :is\(input, select, textarea\):focus-visible \{/);
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
    expect(h).toContain('grid grid-cols-[4.75rem_6rem_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_6.5rem] sm:gap-x-2');
    expect(h).not.toContain('grid-cols-[5.5rem_6.5rem_minmax(0,1fr)]');
    // O valor que o formulário manda é o padrão do navegador ("on"), como antes: nenhum `value` no interruptor.
    for (const m of h.matchAll(/<input type="checkbox" role="switch"[^>]*>/g)) expect(m[0]).not.toContain('value=');
    // O interruptor vem depois do nome, na ponta da linha, e o rótulo envolve tudo (o toque na linha inteira liga e desliga).
    expect(h).toMatch(/<label class="col-span-3 flex min-h-11 cursor-pointer[^"]*"><svg[\s\S]*?<span class="min-w-0 flex-1 text-texto">[^<]+<\/span><input type="checkbox" role="switch"/);
  });

  it('"prazo depois de aberto" do insumo: interruptor com o mesmo nome, na ponta, com o estado; o nome lido tem espaço', () => {
    const h = renderToStaticMarkup(createElement(CamposDeConservacao, { principalInicial: 'REFRIGERADO', validadesIniciais: null, erros: {}, idBase: 'i' }));
    const linhas = [...h.matchAll(/<label class="col-span-3 flex[^"]*">([\s\S]*?)<\/label>/g)].map((m) => m[1]);
    expect(linhas).toHaveLength(4);
    for (const l of linhas) {
      // O interruptor vem por último (na ponta da linha), sem `value` (manda "on", como antes).
      expect(l).toMatch(/<input type="checkbox" role="switch" class="ff-interruptor" name="aceita_[A-Z_]+"[^>]*\/>$/);
      expect(l).not.toMatch(/<input[^>]*value=/);
    }
    // O nome que o leitor de tela lê: o lugar, um espaço e "conservação principal" (sem ficar colado).
    const refrigerado = linhas.find((l) => l.includes('name="aceita_REFRIGERADO"'))!;
    expect(refrigerado.replace(/<[^>]+>/g, '')).toBe(`${ROTULO_DA_OPCAO.REFRIGERADO} conservação principal`);
    // Ligar um lugar fica no estado do componente (o `checked` vem do estado, e a mudança passa por `mudar`).
    const fonte = readFileSync('src/components/erp/telas/insumos/campos-conservacao.tsx', 'utf8');
    expect(fonte).toMatch(/role="switch"\s*name=\{`aceita_\$\{c\}`\}\s*checked=\{l\.marcada\}\s*onChange=\{\(e\) => mudar\(c, \{ marcada: e\.target\.checked \}\)\}\s*className=\{INTERRUPTOR\}/);
  });

  it('a ajuda fala em ligar (é um interruptor, não uma caixa de marcar)', () => {
    expect(readFileSync('src/components/erp/telas/cadastro/campos-validade.tsx', 'utf8')).toContain("'Ligue onde pode ficar e quanto dura em cada lugar.");
    expect(readFileSync('src/components/erp/telas/insumos/campos-conservacao.tsx', 'utf8')).toContain('Ligue só onde o insumo pode ficar.');
  });
});
