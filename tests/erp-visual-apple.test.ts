/**
 * Visual da Apple no shell do ERP (decisão 530, 18/11/2026), fatia A1 · fundação — sem banco e sem navegador:
 *
 * - letra do texto: a do sistema no iPhone, iPad e Mac (SF), a Libre Franklin nos outros aparelhos; títulos em Gelasio; só
 *   dentro de `.ff-app` (site e Portal não mudam);
 * - tokens novos nos dois temas (preenchimento, polegar do segmentado, material das barras), com contraste AA nas
 *   combinações reais, inclusive com conteúdo preto ou branco rolando por baixo da barra translúcida;
 * - barra do topo translúcida com o borrão num pseudo-elemento (os popovers fixos da barra continuam presos à tela) e barra
 *   sólida sem suporte ao borrão ou com a transparência reduzida no aparelho;
 * - segmentado, filtro em links, campo de busca e botão secundário no estilo da Apple;
 * - o que a letra nova (um pouco mais larga) apertava: a ação do cabeçalho quebra em vez de vazar.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import config from '../tailwind.config';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Segmentos } from '@/components/erp/ui/segmentos';
import { BuscaEmFormulario, FiltroEmLinks } from '@/components/erp/ui/filtros';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { COR } from '@/lib/erp/modulos';

vi.mock('next/navigation', () => ({ useSelectedLayoutSegments: () => [], usePathname: () => '/erp', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const css = readFileSync('src/components/erp/tokens.css', 'utf8');

function variaveis(seletor: string): Record<string, string> {
  const i = css.indexOf(seletor);
  if (i < 0) throw new Error(`bloco não encontrado: ${seletor}`);
  const corpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  return Object.fromEntries([...corpo.matchAll(/--ff-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]));
}
const CLARO = variaveis(".ff-app[data-tema='claro'] {");
const ESCURO = variaveis(".ff-app[data-tema='escuro'] {");
const SISTEMA = variaveis(".ff-app[data-tema='sistema'] {");
const GEOMETRIA = variaveis('.ff-app {');

type RGB = [number, number, number];
const hex = (h: string): RGB => h.slice(1).match(/../g)!.map((x) => parseInt(x, 16)) as RGB;
const canais = (v: string): RGB => (v.startsWith('#') ? hex(v) : (v.split(' ').map(Number) as RGB));
/** `rgb(118 114 100 / 0.13)` → a cor e a opacidade. */
const comAlfa = (v: string): { cor: RGB; alfa: number } => {
  const m = v.match(/^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/);
  if (!m) throw new Error(`cor com opacidade inesperada: ${v}`);
  return { cor: [Number(m[1]), Number(m[2]), Number(m[3])], alfa: Number(m[4]) };
};
/** O navegador compõe em sRGB: a cor por cima, com a opacidade dela, sobre o fundo. */
const sobre = ({ cor, alfa }: { cor: RGB; alfa: number }, fundo: RGB): RGB => cor.map((n, i) => n * alfa + fundo[i] * (1 - alfa)) as RGB;
const luminancia = (c: RGB) =>
  c.map((n) => n / 255).map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)).reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
const contraste = (a: RGB, b: RGB) => (Math.max(luminancia(a), luminancia(b)) + 0.05) / (Math.min(luminancia(a), luminancia(b)) + 0.05);
const PRETO: RGB = [0, 0, 0];
const BRANCO: RGB = [255, 255, 255];

describe('visual da Apple · letra do texto', () => {
  it('no ERP: a letra do sistema (a SF no iPhone, iPad e Mac; a do sistema nos outros), com a Libre Franklin de reserva', () => {
    expect(GEOMETRIA['fonte-texto']).toBe('-apple-system, BlinkMacSystemFont, system-ui, var(--font-franklin)');
  });
  it('o Tailwind lê a variável do ERP e, fora dele (site e Portal), continua na Libre Franklin; títulos seguem em Gelasio', () => {
    const fontes = (config.theme!.extend as { fontFamily: Record<string, string[]> }).fontFamily;
    expect(fontes.sans).toEqual(['var(--ff-fonte-texto, var(--font-franklin))', 'Helvetica Neue', 'Arial', 'sans-serif']);
    expect(fontes.display[0]).toBe('var(--font-gelasio)');
    expect(fontes.franklin[0]).toBe('var(--font-franklin)');
    expect(readFileSync('src/app/globals.css', 'utf8')).not.toContain('--ff-fonte-texto');
  });
});

describe('visual da Apple · tokens novos, nos dois temas', () => {
  it('preenchimento, polegar e material: valores registrados; "do aparelho" no escuro é igual ao escuro', () => {
    expect(CLARO).toMatchObject({
      preenchimento: 'rgb(118 114 100 / 0.13)',
      'preenchimento-forte': 'rgb(118 114 100 / 0.2)',
      polegar: '255 254 251',
      material: 'rgb(255 254 251 / 0.92)',
    });
    expect(ESCURO).toMatchObject({
      preenchimento: 'rgb(238 234 224 / 0.11)',
      'preenchimento-forte': 'rgb(238 234 224 / 0.17)',
      polegar: '74 75 68',
      material: 'rgb(36 37 33 / 0.92)',
    });
    expect(SISTEMA).toEqual(ESCURO);
    // O material é a superfície (`painel`) quase opaca.
    for (const t of [CLARO, ESCURO]) expect(comAlfa(t.material).cor).toEqual(canais(t.painel));
    // A lupa da busca: o ícone de sempre (lucide), no texto secundário de cada tema.
    for (const t of [CLARO, ESCURO]) {
      const cor = canais(t.suave).map((n) => n.toString(16).padStart(2, '0')).join('');
      expect(t.lupa).toMatch(/^url\("data:image\/svg\+xml,%3Csvg /);
      expect(t.lupa).toContain(`stroke='%23${cor}'`);
      expect(t.lupa).toContain("%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E");
    }
  });

  it('o Tailwind lê os tokens com a reserva do tema escuro', () => {
    const cores = (config.theme!.extend as { colors: Record<string, string> }).colors;
    expect(cores.preenchimento).toBe(`var(--ff-preenchimento, ${ESCURO.preenchimento})`);
    expect(cores['preenchimento-forte']).toBe(`var(--ff-preenchimento-forte, ${ESCURO['preenchimento-forte']})`);
    expect(cores.polegar).toBe(`rgb(var(--ff-polegar, ${ESCURO.polegar}) / <alpha-value>)`);
  });

  for (const [tema, t] of [['claro', CLARO], ['escuro', ESCURO]] as const) {
    it(`${tema}: texto ≥ 4,5:1 no polegar, no preenchimento e no texto de exemplo da busca`, () => {
      const texto = canais(t.texto);
      expect(contraste(texto, canais(t.polegar)), 'texto no polegar').toBeGreaterThanOrEqual(4.5);
      for (const base of ['fundo', 'painel'] as const) {
        for (const nome of ['preenchimento', 'preenchimento-forte'] as const) {
          const fundo = sobre(comAlfa(t[nome]), canais(t[base]));
          expect(contraste(texto, fundo), `texto em ${nome} sobre ${base}`).toBeGreaterThanOrEqual(4.5);
          // O texto de exemplo é o texto a 75 % (o `suave` não garante 4,5:1 sobre o preenchimento no fundo creme).
          const exemplo = sobre({ cor: texto, alfa: 0.75 }, fundo);
          expect(contraste(exemplo, fundo), `exemplo em ${nome} sobre ${base}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it(`${tema}: na barra translúcida, texto e texto secundário ≥ 4,5:1 e o anel de foco ≥ 3:1, mesmo com preto ou branco por baixo`, () => {
      for (const atras of [PRETO, BRANCO]) {
        const barra = sobre(comAlfa(t.material), atras);
        expect(contraste(canais(t.texto), barra), `texto, ${atras}`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(canais(t.suave), barra), `suave, ${atras}`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(canais(t.acento), barra), `acento, ${atras}`).toBeGreaterThanOrEqual(3);
        // Sob o ponteiro ou com o menu aberto, os botões da barra ganham um realce (texto a 5 %, ou o preenchimento mais forte
        // na busca): ali o texto é sempre o `texto` (o `suave` e o texto atenuado cairiam abaixo de 4,5:1).
        for (const [nome, realce] of [['texto a 5 %', { cor: canais(t.texto), alfa: 0.05 }], ['preenchimento', comAlfa(t.preenchimento)], ['preenchimento-forte', comAlfa(t['preenchimento-forte'])]] as const) {
          const fundo = sobre(realce, barra);
          expect(contraste(canais(t.texto), fundo), `texto em ${nome}, ${atras}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it(`${tema}: o motivo das escolhas — sob o ponteiro, o \`suave\` e o texto a 75 % cairiam abaixo de 4,5:1 no pior caso`, () => {
      const piores = [PRETO, BRANCO].map((atras) => sobre(comAlfa(t.material), atras));
      const realceDaConta = piores.map((b) => sobre({ cor: canais(t.texto), alfa: 0.05 }, b));
      const realceDaBusca = piores.map((b) => sobre(comAlfa(t['preenchimento-forte']), b));
      const minimo = (cor: (f: RGB) => RGB, fundos: RGB[]) => Math.min(...fundos.map((f) => contraste(cor(f), f)));
      if (tema === 'claro') expect(minimo(() => canais(t.suave), realceDaConta)).toBeLessThan(4.5);
      else expect(minimo((f) => sobre({ cor: canais(t.texto), alfa: 0.75 }, f), realceDaBusca)).toBeLessThan(4.5);
    });
  }

  it('o material não é mais transparente do que o necessário para o contraste: a 90 %, o texto secundário cairia abaixo de 4,5:1', () => {
    const noventa = { cor: comAlfa(CLARO.material).cor, alfa: 0.9 };
    expect(contraste(canais(CLARO.suave), sobre(noventa, PRETO))).toBeLessThan(4.5);
  });
});

describe('visual da Apple · barra do topo translúcida', () => {
  const shell = readFileSync('src/components/erp/shell/Shell.tsx', 'utf8');
  /** Uma regra pelo seletor exato, dentro de um bloco opcional (`@supports`, `@media`). */
  const regra = (seletor: string, dentroDe = ''): string => {
    const inicio = dentroDe ? css.indexOf(dentroDe) : 0;
    if (inicio < 0) throw new Error(`bloco não encontrado: ${dentroDe}`);
    const i = css.indexOf(`${seletor} {`, inicio);
    if (i < 0) throw new Error(`regra não encontrada: ${seletor}`);
    return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  };

  it('a barra usa o material, sem a superfície opaca de antes, e segue presa no alto com camada própria', () => {
    const barra = shell.match(/<header className="([^"]+)"/)![1].split(' ');
    expect(barra).toEqual(expect.arrayContaining(['ff-material', 'sticky', 'top-0', 'z-30', 'border-b', 'border-linha']));
    expect(barra).not.toContain('bg-painel');
  });

  it('o borrão mora no pseudo-elemento, por trás do conteúdo, sem pegar clique', () => {
    const antes = regra('.ff-app .ff-material::before');
    expect(antes).toMatch(/position: absolute;/);
    expect(antes).toMatch(/inset: 0;/);
    expect(antes).toMatch(/z-index: -1;/);
    expect(antes).toMatch(/pointer-events: none;/);
    expect(antes).toMatch(/background-color: var\(--ff-material\);/);
    expect(antes).toMatch(/-webkit-backdrop-filter: saturate\(180%\) blur\(20px\);/);
    expect(antes).toMatch(/\n\s*backdrop-filter: saturate\(180%\) blur\(20px\);/);
  });

  it('nenhuma classe no cabeçalho cria um bloco de referência para os painéis fixos (testado à mão: com `backdrop-blur`, eles saíam 232 px do lugar)', () => {
    // A classe inteira, não só o começo: variantes (`lg:`, `supports-[…]:`) e valores arbitrários (`[transform:…]`) também contam.
    const PERIGOSA = /(^|:|\[)(-webkit-|-)?(backdrop|blur|transform|translate|rotate|scale|skew|filter|drop-shadow|will-change|contain|content-visibility|perspective)/;
    for (const c of ['backdrop-blur', 'lg:backdrop-blur-md', 'supports-[backdrop-filter]:backdrop-blur', '[transform:translateZ(0)]', '[will-change:transform]', '[-webkit-backdrop-filter:blur(4px)]', '-translate-y-px', 'contain-paint', 'md:filter', '[content-visibility:auto]', '[container-type:inline-size]']) expect(c, c).toMatch(PERIGOSA);
    const barra = shell.match(/<header className="([^"]+)"/)![1].split(' ');
    for (const c of barra) expect(c, c).not.toMatch(PERIGOSA);
    // Nem regra de CSS no próprio `.ff-material` (só no ::before).
    for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const seletores = m[1].trim().split(',').map((x) => x.trim()).filter((x) => x.includes('ff-material') && !x.endsWith('::before'));
      for (const x of seletores) expect(m[2], x).not.toMatch(/transform|filter|will-change|contain|perspective/);
    }
  });

  it('nenhuma regra põe o borrão (nem filtro) no próprio elemento: ele viraria a referência dos popovers fixos da barra', () => {
    for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      if (!/backdrop-filter|(^|[\s;])filter:/.test(m[2])) continue;
      const seletores = m[1].trim().split(',').map((s) => s.trim()).filter((s) => s.includes('ff-material'));
      for (const s of seletores) expect(s, s).toMatch(/::before$/);
    }
  });

  it('sem suporte ao borrão ou com a transparência reduzida no aparelho, a barra fica sólida', () => {
    expect(css).toContain('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {');
    expect(regra('.ff-app .ff-material::before', '@supports not ((backdrop-filter')).toMatch(/background-color: rgb\(var\(--ff-painel\)\);/);
    const reduzida = regra('.ff-app .ff-material::before', '@media (prefers-reduced-transparency: reduce)');
    expect(reduzida).toMatch(/background-color: rgb\(var\(--ff-painel\)\);/);
    expect(reduzida).toMatch(/-webkit-backdrop-filter: none;/);
    expect(reduzida).toMatch(/\n\s*backdrop-filter: none;/);
  });
});

describe('visual da Apple · controles', () => {
  it('segmentado: trilho preenchido sem borda (borda só com erro), polegar claro em negrito, todas as opções na cor do texto, foco visível', () => {
    const opcoes = [['KG', 'kg'], ['L', 'L'], ['UN', 'un']] as const;
    const h = renderToStaticMarkup(createElement(Segmentos<'KG' | 'L' | 'UN'>, { nome: 'unidade', legenda: 'Unidade', opcoes, valor: 'KG', aoMudar: () => {} }));
    const trilho = h.match(/<div class="([^"]+)" style="grid-template-columns/)![1].split(' ');
    expect(trilho).toEqual(expect.arrayContaining(['bg-preenchimento', 'border', 'border-transparent', 'rounded-[10px]']));
    expect(trilho.join(' ')).not.toMatch(/border-linha|bg-campo/);
    const comErro = renderToStaticMarkup(createElement(Segmentos<'KG' | 'L' | 'UN'>, { nome: 'unidade', legenda: 'Unidade', opcoes, valor: '', aoMudar: () => {}, invalido: true }));
    expect(comErro.match(/<div class="([^"]+)" style="grid-template-columns/)![1].split(' ')).toContain('border-erro');
    const spans = [...h.matchAll(/<span class="([^"]+)">(kg|L|un)<\/span>/g)].map((m) => m[1].split(' '));
    expect(spans).toHaveLength(3);
    for (const s of spans) {
      expect(s).toEqual(expect.arrayContaining(['text-texto', 'peer-checked:bg-polegar', 'peer-checked:font-semibold', 'peer-checked:hover:bg-polegar', 'peer-checked:ring-1', 'peer-checked:ring-linha-forte', 'peer-focus-visible:outline', 'peer-focus-visible:outline-[3px]', 'peer-focus-visible:outline-offset-2', 'peer-focus-visible:outline-acento']));
      expect(s).not.toContain('text-suave');
      expect(s.some((c) => c.startsWith('peer-checked:shadow-['))).toBe(true);
    }
  });

  it('filtro em links: o mesmo trilho e o mesmo polegar, marcado por `aria-current`', () => {
    for (const quebra of [false, true]) {
      const h = renderToStaticMarkup(createElement(FiltroEmLinks, { rotulo: 'Filtrar por situação', quebra, opcoes: [{ href: '/a', rotulo: 'Ativos', ativo: true }, { href: '/b', rotulo: 'Todos', ativo: false }] }));
      // A borda transparente só aparece no alto contraste do aparelho (cores forçadas): o trilho não some.
      expect(h.match(/<ul class="([^"]+)"/)![1].split(' ')).toEqual(expect.arrayContaining(['bg-preenchimento', 'rounded-[10px]', 'border', 'border-transparent']));
      expect(h).not.toMatch(/border-linha|bg-painel/);
      const ativo = h.match(/<a [^>]*aria-current="page"[^>]*class="([^"]+)"|<a [^>]*class="([^"]+)"[^>]*aria-current="page"/)!;
      const classes = (ativo[1] ?? ativo[2]).split(' ');
      expect(classes).toEqual(expect.arrayContaining(['text-texto', 'aria-[current=page]:bg-polegar', 'aria-[current=page]:font-semibold', 'aria-[current=page]:ring-1', 'aria-[current=page]:ring-linha-forte', 'aria-[current=page]:hover:bg-polegar']));
      expect(classes.some((c) => c.startsWith('aria-[current=page]:shadow-['))).toBe(true);
    }
  });

  it('campo de busca: todo `input[type=search]` do ERP preenchido, sem borda, com a lupa e o texto de exemplo a 75 %', () => {
    const bloco = (seletor: string) => {
      const i = css.indexOf(`${seletor} {`);
      if (i < 0) throw new Error(`regra não encontrada: ${seletor}`);
      return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
    };
    const campo = bloco(".ff-app input[type='search']");
    for (const d of ['border-color: transparent;', 'border-radius: var(--ff-raio-botao);', 'background-color: var(--ff-preenchimento);', 'background-image: var(--ff-lupa);', 'background-repeat: no-repeat;', 'background-position: 12px center;', 'background-size: 16px 16px;', 'padding-left: 36px;']) {
      expect(campo, d).toContain(d);
    }
    const sob = bloco(".ff-app input[type='search']:hover");
    expect(sob).toContain('border-color: transparent;');
    expect(sob).toContain('background-color: var(--ff-preenchimento-forte);');
    expect(bloco(".ff-app input[type='search']::placeholder")).toContain('color: rgb(var(--ff-texto) / 0.75);');
    // Com erro, a borda do erro volta (a regra de cima a apagaria) e vem depois dela.
    expect(bloco(".ff-app input[type='search'][aria-invalid='true']")).toContain('border-color: rgb(var(--ff-erro));');
    expect(css.indexOf(".ff-app input[type='search'][aria-invalid='true'] {")).toBeGreaterThan(css.indexOf(".ff-app input[type='search']:hover {"));
  });

  it('a busca da lista (`BuscaEmFormulario`) é um `input[type=search]` sem cor própria que dispute com a regra; "Buscar" é o botão secundário', () => {
    const h = renderToStaticMarkup(createElement(BuscaEmFormulario, { placeholder: 'Buscar insumo', rotulo: 'Buscar insumo' }));
    const campo = h.match(/<input id="busca-q"[^>]*>/)![0];
    expect(campo).toContain('type="search"');
    expect(campo).not.toMatch(/bg-campo|border-linha|placeholder:text-suave/);
    expect(h).not.toContain('<svg'); // a lupa é a imagem de fundo da regra: nada de lupa dobrada
    expect(h).toContain(`<button type="submit" class="${classeDeBotao('secundario', 'shrink-0')}">Buscar</button>`);
  });

  it('botão secundário: o cinza da Apple, sem borda e com o texto na cor do texto; principal e perigo como antes', () => {
    const secundario = classeDeBotao('secundario');
    // A borda é transparente: some no visual normal e aparece no alto contraste do aparelho (cores forçadas).
    expect(secundario).toContain('border border-transparent bg-preenchimento text-texto hover:bg-preenchimento-forte');
    expect(secundario).not.toMatch(/border-linha|bg-painel/);
    expect(classeDeBotao()).toBe(secundario);
    expect(classeDeBotao('primario')).toContain('bg-acao text-sobre-acao hover:bg-acao-hover');
    expect(classeDeBotao('perigo')).toContain('border border-erro/45 text-erro hover:bg-destaque');
  });

  it('a busca da barra do topo, no computador, é um campo preenchido com o texto na cor do texto', () => {
    const busca = readFileSync('src/components/erp/shell/BuscaGlobal.tsx', 'utf8');
    expect(busca).toMatch(/lg:border lg:border-transparent lg:bg-preenchimento lg:px-3 lg:text-\[13px\] lg:text-texto lg:hover:bg-preenchimento-forte/);
    expect(busca).not.toMatch(/lg:border-linha/);
    // O atalho na cor do texto: sob o ponteiro, sobre a barra translúcida, o texto atenuado cairia abaixo de 4,5:1.
    expect(busca).toMatch(/<kbd className="[^"]*\btext-texto xl:inline/);
    expect(busca).not.toMatch(/<kbd className="[^"]*text-texto\//);
    // E o papel da conta vai para a cor do texto sob o ponteiro e com o menu aberto.
    const conta = readFileSync('src/components/erp/shell/MenuUsuario.tsx', 'utf8');
    expect(conta).toMatch(/classeDoBotao="group /);
    expect(conta).toMatch(/text-suave group-hover:text-texto group-aria-expanded:text-texto">\{usuario\.papel\}/);
  });
});

describe('visual da Apple · larguras que a letra nova (um pouco mais larga) apertava', () => {
  it('cabeçalho de página: sozinha numa linha estreita, a ação encolhe e os botões quebram (antes, `shrink-0` a fazia vazar)', () => {
    const h = renderToStaticMarkup(createElement(PageHeader, { icone: 'insumo', cor: COR.insumo, titulo: 'Fichas técnicas', acao: createElement('a', { href: '/x' }, 'Nova ficha') }));
    const acao = h.match(/<div class="([^"]+)"><a href="\/x">/)![1].split(' ');
    expect(acao).toEqual(expect.arrayContaining(['flex', 'min-w-0', 'flex-wrap']));
    expect(acao).not.toContain('shrink-0');
  });

  it('lista de insumos: a coluna "Situação" e a situação na linha do nome trocam de lugar na mesma largura (nunca somem juntas)', () => {
    const lista = readFileSync('src/components/erp/telas/insumos/lista.tsx', 'utf8');
    const coluna = lista.match(/<th scope="col" className="hidden h-10 px-3 font-semibold (\w+):table-cell">\s*Situação/)![1];
    const celula = lista.match(/<td className="hidden px-3 py-2 (\w+):table-cell">\s*\{i\.ativo \? <Selo tom="ok">Ativo/)![1];
    const naLinha = lista.match(/<span className="(\w+):hidden">\{!i\.ativo && ' · Desativado'\}<\/span>/)![1];
    expect(coluna).toBe('xl');
    expect(celula).toBe(coluna);
    expect(naLinha).toBe(coluna);
  });

  it('acesso: a coluna da direita pode encolher (sem `min-w-0`, o conteúdo dela alargava a grade inteira no celular)', () => {
    const pagina = readFileSync('src/app/erp/acesso/page.tsx', 'utf8');
    expect(pagina).toMatch(/<div className="min-w-0 space-y-4">\s*<Painel titulo=\{`O que você faz em/);
  });

  it('foto da ficha: a coluna ao lado da miniatura não encolhe abaixo do botão (com `min-w-0`, a 320 px ela ficava com 78 px e o botão saía da tela)', () => {
    const foto = readFileSync('src/components/erp/telas/fichas/campo-foto.tsx', 'utf8');
    const coluna = foto.match(/<div className="([^"]+)">\s*\{enviada && !remover && <input type="hidden" name="fotoNova"/)![1].split(' ');
    // Mínimo fixo (8rem, acima dos 123 px de "Escolher foto" medidos no navegador), e não o do texto: assim a coluna não pula
    // de lugar quando o texto do botão muda.
    expect(coluna).toEqual(expect.arrayContaining(['min-w-32', 'flex-1']));
    expect(coluna).not.toContain('min-w-0');
    expect(coluna).not.toContain('min-w-min');
    // Sem `flex-wrap` na linha, a coluna não teria para onde descer.
    expect(foto).toMatch(/<div className="flex flex-wrap items-start gap-4">\s*<div className="grid aspect-\[4\/3\] w-40 shrink-0 /);
    // Os três textos do botão são curtos (cabem nos 8rem); "Enviando a foto…" dava 152 px e vazava da coluna a 375 px.
    const textos = foto.match(/\{preparando \? '([^']+)' : mostrada \|\| \(temFotoAtual && !remover\) \? '([^']+)' : '([^']+)'\}/)!.slice(1);
    expect(textos).toEqual(['Enviando…', 'Trocar foto', 'Escolher foto']);
  });
});

describe('visual da Apple · impressão', () => {
  it('no papel: sem preenchimento, sem material e sem lupa; o polegar fica branco', () => {
    const i = css.indexOf('@media print {');
    const corpo = css.slice(css.indexOf('{', css.indexOf('.ff-app[data-tema] {', i)) + 1, css.indexOf('}', css.indexOf('.ff-app[data-tema] {', i)));
    expect(corpo).toContain('--ff-preenchimento: transparent;');
    expect(corpo).toContain('--ff-preenchimento-forte: transparent;');
    expect(corpo).toContain('--ff-polegar: 255 255 255;');
    expect(corpo).toContain('--ff-material: rgb(255 255 255);');
    expect(corpo).toContain('--ff-lupa: none;');
  });
});

describe('visual da Apple · escopo', () => {
  it('as regras novas moram dentro de `.ff-app`; o site e o Portal não carregam o material nem o preenchimento', () => {
    const seletores = [...css.matchAll(/^([^{}\n]*(?:\.ff-material|input\[type='search'\])[^{}\n]*)\{/gm)].map((m) => m[1].trim());
    expect(seletores.length).toBeGreaterThanOrEqual(6);
    for (const s of seletores) expect(s, s).toMatch(/^\.ff-app /);
    const globais = readFileSync('src/app/globals.css', 'utf8');
    expect(globais).not.toMatch(/--ff-(preenchimento|polegar|material|lupa)|ff-material/);
  });
});
