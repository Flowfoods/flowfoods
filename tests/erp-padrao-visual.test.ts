/**
 * Padrão visual aprovado em 09/11/2026 no shell do ERP — sem banco e sem navegador:
 *
 * - tokens: os valores aprovados nos dois temas, com só dois ajustes de contraste documentados; farol e séries preservados;
 * - contraste das combinações reais (texto ≥ 4,5:1; foco e marca ≥ 3:1), claro e escuro;
 * - tema: claro, escuro e "do aparelho" resolvidos no CSS, pelo atributo que o servidor escreve (sem JS, sem flash);
 * - geometria e movimento: raios, 220 ms, curva, entrada de modal/popover/gaveta/fundo; fechar é imediato; movimento reduzido;
 * - popover ancorado desliza para caber na tela; abrir e fechar não chamam o servidor;
 * - escopo: nada disto chega ao site nem ao Portal (`.ff-site`, `globals.css`).
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import config from '../tailwind.config';
import { ajusteParaCaber } from '@/components/erp/shell/Popover';
import { SeloEmBreve } from '@/components/erp/ui/em-breve';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { CAMPO } from '@/components/erp/ui/campos';
import { Painel, Selo } from '@/components/erp/ui/superficies';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { COR } from '@/lib/erp/modulos';

vi.mock('next/navigation', () => ({ usePathname: () => '/erp', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const css = readFileSync('src/components/erp/tokens.css', 'utf8');
const globais = readFileSync('src/app/globals.css', 'utf8');

/** As variáveis `--ff-*` de um bloco, a partir do seletor (até a primeira chave que fecha). */
function variaveis(seletor: string): Record<string, string> {
  const i = css.indexOf(seletor);
  if (i < 0) throw new Error(`bloco não encontrado: ${seletor}`);
  const corpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  return Object.fromEntries([...corpo.matchAll(/--ff-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]));
}
/** Uma regra CSS inteira (seletor exato → declarações). */
function regra(seletor: string): string {
  const i = css.indexOf(`${seletor} {`);
  if (i < 0) throw new Error(`regra não encontrada: ${seletor}`);
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
}
function quadros(nome: string): string {
  const i = css.indexOf(`@keyframes ${nome} {`);
  if (i < 0) throw new Error(`keyframes não encontrado: ${nome}`);
  return css.slice(i, css.indexOf('\n}', i)).replace(/\s+/g, ' ');
}

const CLARO = variaveis(".ff-app[data-tema='claro'] {");
const ESCURO = variaveis(".ff-app[data-tema='escuro'] {");
const SISTEMA = variaveis(".ff-app[data-tema='sistema'] {");
const GEOMETRIA = variaveis('.ff-app {');

type RGB = [number, number, number];
const hex = (h: string): RGB => h.slice(1).match(/../g)!.map((x) => parseInt(x, 16)) as RGB;
const canais = (v: string): RGB => (v.startsWith('#') ? hex(v) : (v.split(' ').map(Number) as RGB));
const luminancia = (c: RGB) =>
  c.map((n) => n / 255).map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)).reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
const contraste = (a: RGB, b: RGB) => (Math.max(luminancia(a), luminancia(b)) + 0.05) / (Math.min(luminancia(a), luminancia(b)) + 0.05);
const emCanais = (h: string) => hex(h).join(' ');

describe('padrão visual · tokens aprovados, claro e escuro', () => {
  it('claro: fundo, superfície, texto, divisória, destaque, botão, sucesso e atenção são os aprovados', () => {
    expect(CLARO).toMatchObject({
      fundo: emCanais('#f5f2eb'),
      painel: emCanais('#fffefb'),
      texto: emCanais('#292b27'),
      linha: '#e8e7de',
      acento: emCanais('#bc382e'),
      marca: emCanais('#bc382e'),
      destaque: emCanais('#fbebe5'),
      acao: emCanais('#bc382e'),
      'sobre-acao': emCanais('#fffdf8'),
      ok: emCanais('#42765b'),
      'ok-fundo': emCanais('#edf4ec'),
      atencao: emCanais('#926626'),
      'atencao-fundo': emCanais('#faf2e1'),
    });
  });

  it('escuro: os mesmos papéis com os valores aprovados; "do aparelho" no escuro é idêntico, variável por variável', () => {
    expect(ESCURO).toMatchObject({
      fundo: emCanais('#181917'),
      painel: emCanais('#242521'),
      texto: emCanais('#eeeae0'),
      suave: emCanais('#b0b1a6'),
      linha: '#3b3d35',
      acento: emCanais('#ee8c7e'),
      destaque: emCanais('#3c2926'),
      acao: emCanais('#b83d33'),
      'sobre-acao': emCanais('#fffdf8'),
      ok: emCanais('#9bc8aa'),
      'ok-fundo': emCanais('#27372c'),
      atencao: emCanais('#e5bb76'),
      'atencao-fundo': emCanais('#393222'),
    });
    expect(SISTEMA).toEqual(ESCURO);
    // Os dois temas definem exatamente os mesmos tokens: nenhum fica herdado do outro por esquecimento.
    expect(Object.keys(CLARO).sort()).toEqual(Object.keys(ESCURO).sort());
  });

  it('só dois valores saem do aprovado, e só o necessário para o contraste: texto secundário no claro e farol vermelho no escuro', () => {
    const fundo = canais(CLARO.fundo);
    // Aprovado #74766d: 4,12:1 sobre o fundo claro. O ajuste é o primeiro tom que passa de 4,5:1 nas superfícies reais.
    expect(contraste(hex('#74766d'), fundo)).toBeLessThan(4.5);
    expect(CLARO.suave).toBe(emCanais('#686a61'));
    for (const superficie of ['fundo', 'painel', 'forte', 'destaque', 'ok-fundo', 'atencao-fundo']) {
      expect(contraste(canais(CLARO.suave), canais(CLARO[superficie])), superficie).toBeGreaterThanOrEqual(4.5);
    }
    // Farol vermelho no escuro: #f5424d dava 4,24:1 sobre a nova superfície. Mesma matiz, mais clara.
    expect(contraste(hex('#f5424d'), canais(ESCURO.painel))).toBeLessThan(4.5);
    expect(ESCURO['farol-vermelho']).toBe(emCanais('#f4656c'));
  });

  it('farol e séries dos gráficos NÃO foram trocados por outras cores (só o ajuste acima)', () => {
    expect(CLARO).toMatchObject({ 'farol-azul': '47 93 138', 'farol-verde': '22 101 52', 'farol-amarelo': '111 99 0', 'farol-laranja': '176 68 0', 'farol-vermelho': '196 21 34' });
    expect(ESCURO).toMatchObject({ 'farol-azul': '141 180 220', 'farol-verde': '93 187 132', 'farol-amarelo': '226 197 90', 'farol-laranja': '240 145 58' });
    expect(CLARO).toMatchObject({ 'serie-1': '#2563a8', 'serie-2': '#0e9f6e', 'serie-3': '#c2410c' });
    expect(ESCURO).toMatchObject({ 'serie-1': '#4a86d0', 'serie-2': '#129c6e', 'serie-3': '#d9602a' });
    // A paleta das áreas continua a mesma (acentos por módulo); "Em breve" é neutro.
    expect(COR).toMatchObject({ insumo: '#2F7D5B', fichas: '#A16207', compras: '#2563A8', estoque: '#0F766E', producao: '#4C5A8A', etiquetas: '#57534E', dre: '#4D7C0F', rede: '#7E3A6B', futuro: '#57534E' });
  });

  for (const [tema, t] of [['claro', CLARO], ['escuro', ESCURO]] as const) {
    it(`${tema}: texto ≥ 4,5:1 e foco/marca ≥ 3:1 nas combinações que as telas usam`, () => {
      const c = (nome: string) => canais(t[nome]);
      const pares: [texto: string, fundo: string, minimo: number][] = [
        ['texto', 'fundo', 4.5], ['texto', 'painel', 4.5], ['texto', 'forte', 4.5], ['texto', 'destaque', 4.5], ['texto', 'campo', 4.5], ['texto', 'lateral', 4.5],
        ['suave', 'fundo', 4.5], ['suave', 'painel', 4.5], ['suave', 'forte', 4.5], ['suave', 'destaque', 4.5], ['suave', 'lateral', 4.5],
        // Botão principal, em repouso e sob o ponteiro.
        ['sobre-acao', 'acao', 4.5], ['sobre-acao', 'acao-hover', 4.5],
        // Estado: a palavra sobre a página, sobre a superfície e sobre o fundo do próprio par.
        ['erro', 'fundo', 4.5], ['erro', 'painel', 4.5], ['erro', 'destaque', 4.5],
        ['ok', 'fundo', 4.5], ['ok', 'painel', 4.5], ['ok', 'ok-fundo', 4.5],
        ['atencao', 'fundo', 4.5], ['atencao', 'painel', 4.5], ['atencao', 'atencao-fundo', 4.5],
        // Anel de foco, filete e marca: elemento essencial, 3:1.
        ['acento', 'fundo', 3], ['acento', 'painel', 3], ['marca', 'lateral', 3],
      ];
      for (const [texto, fundo, minimo] of pares) expect(contraste(c(texto), c(fundo)), `${texto} sobre ${fundo}`).toBeGreaterThanOrEqual(minimo);
    });
  }

  it('o Tailwind lê os tokens novos (cor com opacidade e raio nomeado), nunca um hex solto', () => {
    const cores = (config.theme!.extend as { colors: Record<string, string> }).colors;
    for (const nome of ['destaque', 'sobre-acao', 'ok-fundo', 'atencao-fundo']) expect(cores[nome]).toBe(`rgb(var(--ff-${nome}, ${ESCURO[nome]}) / <alpha-value>)`);
    // O valor de reserva (peça do ERP fora do shell) é o do tema escuro aprovado.
    for (const nome of ['fundo', 'painel', 'texto', 'suave', 'acao', 'acento', 'erro', 'ok', 'atencao']) expect(cores[nome], nome).toBe(`rgb(var(--ff-${nome}, ${ESCURO[nome]}) / <alpha-value>)`);
    expect((config.theme!.extend as { borderRadius: Record<string, string> }).borderRadius).toEqual({
      cartao: 'var(--ff-raio-cartao, 16px)',
      modal: 'var(--ff-raio-modal, 19px)',
      popover: 'var(--ff-raio-popover, 13px)',
      nav: 'var(--ff-raio-nav, 12px)',
      botao: 'var(--ff-raio-botao, 10px)',
      campo: 'var(--ff-raio-campo, 9px)',
    });
  });
});

describe('padrão visual · tema lido no servidor, sem flash', () => {
  it('os três temas resolvem no CSS pelo atributo do wrapper; o fundo do html acompanha o escuro', () => {
    expect(css).toMatch(/\.ff-app,\s*\n\.ff-app\[data-tema='claro'\] \{/);
    expect(css).toMatch(/\.ff-app\[data-tema='escuro'\] \{/);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*\n\s*\.ff-app\[data-tema='sistema'\] \{/);
    // A rolagem elástica mostra o fundo do html: é o do tema, nos dois caminhos do escuro.
    expect(css.match(/html:has\(\.ff-app\[data-tema='(escuro|sistema)'\]\) \{\s*background-color: #181917;/g)).toHaveLength(2);
    expect(CLARO['color-scheme']).toBeUndefined(); // `color-scheme` não é variável: fica declarado no bloco
    expect(css.match(/color-scheme: light;/g)!.length).toBeGreaterThanOrEqual(1);
    expect(css.match(/color-scheme: dark;/g)).toHaveLength(2);
  });

  it('o wrapper do shell recebe o tema do servidor e nenhum script decide a cor', () => {
    const shell = readFileSync('src/components/erp/shell/AppShell.tsx', 'utf8');
    expect(shell).toMatch(/className="ff-app font-sans" data-tema=\{props\.tema\}/);
    expect(shell).not.toMatch(/<script|localStorage|matchMedia/);
    for (const layout of ['src/app/erp/layout.tsx', 'src/app/rodolfo/(painel)/layout.tsx']) {
      expect(readFileSync(layout, 'utf8'), layout).toMatch(/tema=\{lerTema\(c\.get\(COOKIE_TEMA\)\?\.value\)\}/);
    }
  });
});

describe('padrão visual · geometria', () => {
  it('raios aprovados num lugar só: cartão 16, modal 19, popover 13, navegação 12, botão 10, campo 9', () => {
    expect(GEOMETRIA).toMatchObject({ 'raio-cartao': '16px', 'raio-modal': '19px', 'raio-popover': '13px', 'raio-nav': '12px', 'raio-botao': '10px', 'raio-campo': '9px' });
  });

  it('os componentes compartilhados usam os raios nomeados', () => {
    expect(classeDeBotao('primario')).toContain('rounded-botao');
    expect(classeDeBotao('primario')).toContain('bg-acao text-sobre-acao');
    // Sob o ponteiro o botão de perigo usa o par aprovado do vermelho (texto ≥ 4,5:1 onde quer que o botão esteja).
    expect(classeDeBotao('perigo')).toContain('text-erro hover:bg-destaque');
    expect(classeDeBotao('perigo')).not.toMatch(/bg-erro\//);
    // Texto de exemplo do campo: a cor secundária inteira, nunca atenuada.
    expect(CAMPO).toContain('placeholder:text-suave ');
    expect(CAMPO).not.toMatch(/placeholder:text-suave\//);
    expect(CAMPO).toContain('rounded-campo');
    expect(renderToStaticMarkup(createElement(Painel, { titulo: 'Painel', children: 'x' }))).toMatch(/^<section class="min-w-0 rounded-cartao border border-linha bg-painel /);
    expect(regra('.ff-app dialog.ff-dialogo')).toContain('border-radius: var(--ff-raio-modal)');
    expect(regra('.ff-app .ff-popover')).toContain('border-radius: var(--ff-raio-popover)');
    expect(regra('.ff-app .ff-nav-item')).toContain('border-radius: var(--ff-raio-nav)');
  });

  it('alvo de toque e campo no celular: botão e campo com 44 px, texto do campo com 16 px', () => {
    expect(classeDeBotao()).toMatch(/\bmin-h-11\b/);
    expect(CAMPO).toMatch(/\bmin-h-11\b/);
    expect(css).toMatch(/@media \(max-width: 599px\) \{[\s\S]*?\.ff-app :is\(input, select, textarea\) \{\s*font-size: 16px;/);
    expect(css).toMatch(/@media \(pointer: coarse\) \{[\s\S]*?min-height: 44px;/);
  });

  it('título editorial em Gelasio 29 px/1,2 (25 no celular); selo sempre sobre superfície opaca', () => {
    const h = renderToStaticMarkup(createElement(PageHeader, { icone: 'inicio', cor: COR.inicio, titulo: 'Título' }));
    expect(h).toMatch(/<h1 class="[^"]*font-display text-\[25px\] font-normal leading-\[1\.2\][^"]*sm:text-\[29px\]/);
    for (const tom of ['ok', 'alerta', 'erro', 'neutro'] as const) {
      expect(renderToStaticMarkup(createElement(Selo, { tom, children: 'Texto' })), tom).toContain('bg-painel');
    }
    expect(renderToStaticMarkup(createElement(Selo, { tom: 'ok', cheio: true, children: 'Texto' }))).toContain('bg-ok-fundo border-ok');
    expect(renderToStaticMarkup(createElement(Selo, { tom: 'alerta', cheio: true, children: 'Texto' }))).toContain('bg-atencao-fundo border-atencao');
    expect(renderToStaticMarkup(createElement(Selo, { tom: 'erro', cheio: true, children: 'Texto' }))).toContain('bg-destaque border-erro');
  });

  it('grade lateral: no máximo duas colunas, coluna mínima em `em` (acompanha o texto) e nome que quebra em vez de cortar', () => {
    const grade = regra('.ff-app .ff-nav-grade');
    expect(grade).toContain('display: grid');
    expect(grade).toMatch(/grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, max\(8\.1em, calc\(50% - 3px\)\)\), 1fr\)\);/);
    expect(regra(".ff-app .ff-nav-grade[data-recolhido='true']")).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(regra('.ff-app .ff-nav-rotulo')).toContain('overflow-wrap: anywhere');
    // Ativo por forma (preenchido + contorno na tinta da área) e peso, além da cor.
    const ativo = regra(".ff-app .ff-nav-item[aria-current='page']");
    expect(ativo).toContain('background-color: var(--ff-modulo-realce)');
    expect(ativo).toContain('border-color: var(--ff-modulo-tinta)');
    expect(ativo).toContain('font-weight: 600');
    // O contorno é elemento essencial da seleção: ≥ 3:1 sobre a superfície da lateral, em toda área e nos dois temas.
    for (const [tema, t] of [['claro', CLARO], ['escuro', ESCURO]] as const) {
      const tinta = parseFloat(t['icone-tinta']) / 100;
      for (const [nome, cor] of Object.entries(COR)) {
        const contorno = hex(cor.toLowerCase()).map((n, i) => n * tinta + canais(t.texto)[i] * (1 - tinta)) as RGB;
        expect(contraste(contorno, canais(t.lateral)), `${tema}/${nome}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('padrão visual · movimento das camadas', () => {
  it('um token de 220 ms e a curva de entrada aprovada', () => {
    expect(GEOMETRIA).toMatchObject({ movimento: '220ms', 'curva-entrada': 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  });

  it('modal e popover: opacidade 0→1 com translateY(-7px) scale(0.98); gaveta: translateX(28px) pela direita (espelhada no menu)', () => {
    expect(quadros('ff-camada')).toContain('from { opacity: 0; transform: translateY(-7px) scale(0.98); } to { opacity: 1; transform: none; }');
    expect(quadros('ff-gaveta-direita')).toContain('from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; }');
    expect(quadros('ff-gaveta')).toContain('from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: none; }');
    expect(regra('.ff-app dialog.ff-dialogo[open]')).toContain('animation: ff-camada var(--ff-movimento) var(--ff-curva-entrada);');
    expect(regra('.ff-app .ff-popover')).toContain('animation: ff-camada var(--ff-movimento) var(--ff-curva-entrada);');
    expect(regra('.ff-app dialog.ff-gaveta.ff-gaveta-direita[open]')).toContain('animation: ff-gaveta-direita var(--ff-movimento) var(--ff-curva-entrada);');
    expect(regra('.ff-app dialog.ff-gaveta[open]')).toContain('animation: ff-gaveta var(--ff-movimento) var(--ff-curva-entrada);');
  });

  it('fundo de bloqueio: só opacidade, 220 ms ease, e a página continua reconhecível atrás', () => {
    const fundo = regra('.ff-app dialog.ff-dialogo::backdrop');
    expect(fundo).toContain('animation: ff-fundo var(--ff-movimento, 220ms) ease;');
    expect(quadros('ff-fundo')).toBe('@keyframes ff-fundo { from { opacity: 0; }');
    expect(CLARO.bloqueio).toBe('rgb(38 42 35 / 0.32)');
    expect(ESCURO.bloqueio).toBe('rgb(0 0 0 / 0.56)');
  });

  it('botões e navegação: só cor, fundo, borda, sombra e opacidade em 220 ms (o alvo não se desloca)', () => {
    const t = regra('.ff-app .ff-transicao');
    expect(t).toContain('transition-property: background-color, border-color, color, box-shadow, opacity;');
    expect(t).toContain('transition-duration: var(--ff-movimento);');
    expect(t).not.toMatch(/transform|width|height|margin|padding|all/);
  });

  it('fechar é imediato: nenhuma animação de saída, laço, vai-e-vem ou atraso', () => {
    // Toda animação do arquivo é de ENTRADA: nasce em [open], no fundo do diálogo, no popover que acabou de montar ou no véu.
    const comAnimacao = [...css.matchAll(/([^{}]+)\{[^{}]*\banimation: (?!none)[^;]+;[^{}]*\}/g)].map((m) => m[1].trim().split('\n').pop()!.trim());
    expect(comAnimacao.sort()).toEqual(
      [
        '.ff-app .ff-popover',
        '.ff-app dialog.ff-dialogo::backdrop',
        '.ff-app dialog.ff-dialogo[open]',
        '.ff-app dialog.ff-gaveta.ff-gaveta-direita[open]',
        '.ff-app dialog.ff-gaveta[open]',
        '.ff-veu-ajuda',
      ].sort(),
    );
    expect([...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]).sort()).toEqual(['ff-camada', 'ff-fundo', 'ff-gaveta', 'ff-gaveta-direita', 'ff-veu']);
    expect(css).not.toMatch(/infinite|alternate|animation-delay|transition-delay|:not\(\[open\]\)|bounce|overshoot/);
    // Os componentes fecham na hora: sem esperar animação nem temporizador.
    for (const arquivo of ['src/components/erp/ui/Dialogo.tsx', 'src/components/erp/shell/Popover.tsx']) {
      expect(readFileSync(arquivo, 'utf8'), arquivo).not.toMatch(/animationend|transitionend|setTimeout|requestAnimationFrame/);
    }
    expect(readFileSync('src/components/erp/ui/Dialogo.tsx', 'utf8')).toMatch(/if \(el\.open\) el\.close\(\);/);
  });

  it('movimento reduzido: nada anima nem transiciona, inclusive o fundo do diálogo (que `*` não alcança)', () => {
    const i = css.indexOf('@media (prefers-reduced-motion: reduce) {');
    const bloco = css.slice(i, css.indexOf('\n}\n', i));
    expect(bloco).toMatch(/\.ff-app \*,\s*\.ff-app \*::before,\s*\.ff-app \*::after,\s*\.ff-app dialog::backdrop \{/);
    expect(bloco).toContain('animation: none !important;');
    expect(bloco).toContain('transition: none !important;');
  });
});

describe('padrão visual · popover ancorado sempre dentro da tela', () => {
  it('cabe: não desliza; passaria da esquerda: encosta na folga de 12 px; passaria da direita: volta o que sobra', () => {
    expect(ajusteParaCaber({ esquerda: 100, direita: 388 }, 1280)).toBe(0);
    // Sino a 320 px: o painel de 296 px alinhado à direita do botão começaria fora da tela.
    expect(ajusteParaCaber({ esquerda: -32, direita: 264 }, 320)).toBe(44);
    expect(ajusteParaCaber({ esquerda: 0, direita: 296 }, 320)).toBe(12);
    // Alinhado à esquerda de um botão perto da borda direita.
    expect(ajusteParaCaber({ esquerda: 200, direita: 500 }, 390)).toBe(-122);
    // Nunca empurra para fora pelo outro lado: tela mais estreita que o painel fica na folga da esquerda.
    expect(ajusteParaCaber({ esquerda: 20, direita: 340 }, 320)).toBe(-8);
    expect(ajusteParaCaber({ esquerda: 12, direita: 332 }, 320)).toBe(0);
  });

  it('abre por botão real, fecha por Escape e por toque fora, e não chama o servidor para abrir ou fechar', () => {
    const fonte = readFileSync('src/components/erp/shell/Popover.tsx', 'utf8');
    expect(fonte).toMatch(/aria-expanded=\{aberto\}/);
    expect(fonte).toMatch(/aria-controls=\{id\}/);
    expect(fonte).toMatch(/addEventListener\('pointerdown', fora\)/);
    expect(fonte).toMatch(/e\.key === 'Escape'/);
    expect(fonte).toMatch(/botao\.current\?\.focus\(\)/);
    expect(fonte).not.toMatch(/fetch\(|use server|from '\.\/acoes'|router\./);
    const dialogo = readFileSync('src/components/erp/ui/Dialogo.tsx', 'utf8');
    expect(dialogo).not.toMatch(/fetch\(|use server|from '[^']*acoes'|router\./);
    // Diálogo nativo: showModal deixa o fundo inerte e prende o Tab; Escape e clique no fundo fecham; o foco volta.
    expect(dialogo).toMatch(/el\.showModal\(\)/);
    expect(dialogo).toMatch(/onCancel=/);
    expect(dialogo).toMatch(/aria-label=\{titulo\}/);
    expect(dialogo).toMatch(/\(destino\?\.current \?\? antes\)\?\.focus\(\)/);
  });
});

describe('padrão visual · selo "Em breve"', () => {
  it('é texto (nunca link nem botão); o cadeado tem leitura própria', () => {
    const simples = renderToStaticMarkup(createElement(SeloEmBreve));
    const comCadeado = renderToStaticMarkup(createElement(SeloEmBreve, { cadeado: true }));
    for (const h of [simples, comCadeado]) {
      expect(h).toMatch(/^<span class="[^"]*">/);
      expect(h).toContain('Em breve');
      expect(h).not.toMatch(/<a[ >]|<button|href=|tabindex|role=/);
    }
    // O texto descreve o ícone; não afirma bloqueio de acesso (o catálogo não é falta de permissão nem de liberação).
    expect(simples).not.toContain('cadeado');
    expect(comCadeado).toContain('<span class="sr-only">Com cadeado. </span>');
    expect(comCadeado).not.toMatch(/Bloqueado|Sem acesso|Não liberado/);
    expect(comCadeado).toContain('aria-hidden="true"');
  });
});

describe('padrão visual · escopo: site e Portal não mudam', () => {
  it('globals.css não ganhou token, raio, animação nem regra do shell', () => {
    expect(globais).not.toMatch(/--ff-(raio|movimento|curva|destaque|bloqueio|sobre-acao)|ff-camada|ff-popover|ff-nav-grade|\.ff-app/);
    // A identidade do site segue a de antes.
    expect(globais).toContain('--ff-creme: #F5F0EB;');
    expect(globais).toContain('--site-surface: 245 240 235;');
  });

  it('toda regra nova de tokens.css mora dentro de `.ff-app` (ou é keyframes, véu da ajuda, html do tema ou impressão)', () => {
    for (const seletor of ['.ff-popover', '.ff-nav-grade', '.ff-nav-item', '.ff-nav-rotulo', 'dialog.ff-dialogo']) {
      for (const m of css.matchAll(new RegExp(`^(.*${seletor.replace(/[.[\]]/g, '\\$&')}[^{]*)\\{`, 'gm'))) expect(m[1].trim(), m[1]).toMatch(/^\.ff-app /);
    }
  });
});
