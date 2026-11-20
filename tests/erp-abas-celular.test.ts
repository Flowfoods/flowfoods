/**
 * Visual da Apple no ERP, fatia A3 (decisão 532): a barra de abas do celular, como a do iPhone no protótipo aprovado
 * (Início · Cadastros · Compras · Estoque · Mais), e o título grande. Sem banco e sem navegador:
 *
 * - quais abas: Início, as primeiras áreas da pessoa que têm tela (na ordem do menu, já filtradas por permissão) e Mais;
 * - qual acende: a da área da tela atual; fora das abas, o Mais;
 * - onde aparece: só abaixo de 640 px, nunca junto de uma barra fixa de ações nem com o teclado aberto, sem cobrir o fim da
 *   página; sem `:has()`, não aparece;
 * - contraste das abas sobre o material translúcido, com conteúdo preto ou branco por baixo;
 * - o título grande (Gelasio 34 px) sem o quadrado da área.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ALCANCE_FLOWFOODS, resolverAlcance, type VinculoDePermissao } from '@/lib/erp/permissoes';
import { AREAS_NA_BARRA_DO_CELULAR, COR, abasDoCelular, navegacaoDoParceiro, rotuloDaAba } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { BarraDeAbas } from '@/components/erp/shell/BarraDeAbas';
import { PageHeader } from '@/components/erp/ui/cabecalho';

vi.mock('next/navigation', () => ({ useSelectedLayoutSegments: () => [], usePathname: () => '/erp', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const vinculo = (v: Partial<VinculoDePermissao>): VinculoDePermissao => ({
  perfilBase: 'OPERADOR',
  perfilProprio: null,
  permissoesExtras: [],
  permissoesRemovidas: [],
  redeInteira: true,
  lojaIds: [],
  ...v,
});
const DONO = resolverAlcance(vinculo({ perfilBase: 'DONO' }));
const proprio = (permissoes: string[]) => resolverAlcance(vinculo({ perfilBase: null, perfilProprio: permissoes as never }));
const NAV_DONO = navegacaoDoParceiro(DONO, NENHUM_MODULO_LIBERADO);

const css = readFileSync('src/components/erp/tokens.css', 'utf8');
/** O corpo da primeira regra com este seletor exato. */
function regra(seletor: string): string {
  const i = css.indexOf(`${seletor} {`);
  if (i < 0) throw new Error(`regra não encontrada: ${seletor}`);
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
}

describe('abas do celular · quais abas', () => {
  it('dono: Início, as três primeiras áreas e Mais, como no protótipo aprovado', () => {
    const { abas, maisAtiva } = abasDoCelular(NAV_DONO, '/erp');
    expect(AREAS_NA_BARRA_DO_CELULAR).toBe(3);
    expect(abas.map((a) => a.rotulo)).toEqual(['Início', 'Cadastros', 'Compras', 'Estoque']);
    expect(abas.map((a) => a.ativa)).toEqual([true, false, false, false]);
    expect(maisAtiva).toBe(false);
  });

  it('cada aba leva à entrada que o menu já tem (nenhum destino novo)', () => {
    const { abas } = abasDoCelular(NAV_DONO, '/erp');
    expect(abas[0].href).toBe(NAV_DONO.inicio.href);
    expect(abas.slice(1).map((a) => a.href)).toEqual(NAV_DONO.modulos.slice(0, 3).map((m) => m.href));
    expect(abas.slice(1).map((a) => [a.icone, a.cor])).toEqual(NAV_DONO.modulos.slice(0, 3).map((m) => [m.icone, m.cor]));
    expect(abas[0].cor).toBe(COR.inicio);
  });

  it('acende a aba da área em qualquer tela dela; fora das abas, acende o Mais', () => {
    const cadastros = NAV_DONO.modulos[0];
    const tela = cadastros.grupos.at(-1)!.itens.at(-1)!.href;
    let r = abasDoCelular(NAV_DONO, `${tela}/um-detalhe`);
    expect(r.abas.filter((a) => a.ativa).map((a) => a.rotulo)).toEqual(['Cadastros']);
    expect(r.maisAtiva).toBe(false);
    const quarta = NAV_DONO.modulos[3];
    r = abasDoCelular(NAV_DONO, quarta.href!);
    expect(r.abas.some((a) => a.ativa)).toBe(false);
    expect(r.maisAtiva).toBe(true);
    // Fora do menu (nem hub, nem área): nada acende.
    r = abasDoCelular(NAV_DONO, '/erp/fora-do-menu');
    expect(r.abas.some((a) => a.ativa)).toBe(false);
    expect(r.maisAtiva).toBe(false);
  });

  it('módulo sem tela no meio das áreas não toma o lugar de uma aba (o filtro vem antes do corte em três)', () => {
    const [a, b, c] = NAV_DONO.modulos;
    const futuro = { ...a, chave: 'futuro', nome: 'Módulo futuro', href: null, grupos: [], acoes: [] };
    const nav = { ...NAV_DONO, modulos: [a, futuro, b, c] };
    expect(abasDoCelular(nav, '/erp').abas.map((x) => x.rotulo)).toEqual(['Início', rotuloDaAba(a.nome), rotuloDaAba(b.nome), rotuloDaAba(c.nome)]);
  });

  it('pessoa com menos áreas: só as dela; o catálogo "Em breve" (sem tela) nunca entra', () => {
    const navFin = navegacaoDoParceiro(proprio(['faturamento.ver']), NENHUM_MODULO_LIBERADO);
    const fin = abasDoCelular(navFin, '/erp');
    expect(fin.abas.slice(1).map((a) => a.rotulo)).toEqual(navFin.modulos.slice(0, 3).map((m) => rotuloDaAba(m.nome)));
    expect(fin.abas.map((a) => a.rotulo)).toContain('Faturamento');
    expect(fin.abas.map((a) => a.rotulo)).not.toContain('Cadastros');
    const n1 = navegacaoDoParceiro(ALCANCE_FLOWFOODS, NENHUM_MODULO_LIBERADO);
    expect(n1.modulos.some((m) => m.href === null)).toBe(true);
    expect(abasDoCelular(n1, '/erp').abas.every((a) => typeof a.href === 'string' && a.href.length > 0)).toBe(true);
  });

  it('o nome na aba é a primeira palavra da área, curto para 320 px', () => {
    const nomes = navegacaoDoParceiro(DONO, NENHUM_MODULO_LIBERADO).modulos.map((m) => rotuloDaAba(m.nome));
    expect(nomes).toEqual(['Cadastros', 'Compras', 'Estoque', 'Produção', 'Etiquetas', 'Faturamento', 'Rede']);
    for (const n of nomes) expect(n.length, n).toBeLessThanOrEqual(11);
  });
});

describe('abas do celular · marcação', () => {
  const marcar = (caminho: string, gavetaAberta = false) =>
    renderToStaticMarkup(createElement(BarraDeAbas, { nav: NAV_DONO, caminho, gavetaAberta, aoAbrirMais: () => {} }));

  it('nav "Áreas" no material, com links para as áreas e o botão Mais ligado à gaveta', () => {
    const h = marcar('/erp');
    expect(h).toMatch(/^<nav aria-label="Áreas" data-barra-de-abas="true" class="ff-abas-celular ff-material">/);
    expect([...h.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])).toEqual(abasDoCelular(NAV_DONO, '/erp').abas.map((a) => a.href));
    expect(h).toMatch(/<button type="button" aria-controls="ff-gaveta" aria-expanded="false" class="ff-aba-celular">.*<span class="ff-aba-celular-rotulo">Mais<\/span><\/button>/);
    expect(marcar('/erp', true)).toContain('aria-expanded="true"');
    // Sem `data-barra-fixa`: ela não é barra de ações e não pode esconder a si mesma.
    expect(h).not.toContain('data-barra-fixa');
  });

  it('a aba atual: "page" na própria entrada, "true" dentro da área; o Mais marcado quando a área ficou fora', () => {
    expect(marcar('/erp')).toMatch(/<a aria-current="page"[^>]*href="\/erp">/);
    const entrada = NAV_DONO.modulos[1].href!;
    expect(marcar(entrada)).toMatch(new RegExp(`<a aria-current="page"[^>]*href="${entrada}">`));
    expect(marcar(`${entrada}/algo`)).toMatch(new RegExp(`<a aria-current="true"[^>]*href="${entrada}">`));
    expect(marcar(`${entrada}/algo`).match(/aria-current/g)).toHaveLength(1);
    expect(marcar(NAV_DONO.modulos[4].href!)).toContain('data-ativa=""');
    expect(marcar('/erp')).not.toContain('data-ativa');
    // O Mais aceso também para o leitor de tela.
    expect(marcar(NAV_DONO.modulos[4].href!)).toContain('<span class="ff-aba-celular-rotulo">Mais</span><span class="sr-only"> (área atual)</span>');
    expect(marcar('/erp')).not.toContain('(área atual)');
  });

  it('o shell põe a barra depois do conteúdo (ordem do Tab) e o Mais abre a mesma gaveta do menu', () => {
    const shell = readFileSync('src/components/erp/shell/Shell.tsx', 'utf8');
    expect(shell.indexOf('<BarraDeAbas')).toBeGreaterThan(shell.indexOf('</main>'));
    // Só no ERP do parceiro (/erp): no nível 1 o menu é o dos fluxos comerciais internos, fora do plano.
    expect(shell).toMatch(/\{nav\.rotuloDaArea === 'ERP' && <BarraDeAbas nav=\{nav\} caminho=\{caminho\} gavetaAberta=\{gaveta\} aoAbrirMais=\{abrirGaveta\} \/>\}/);
    expect(NAV_DONO.rotuloDaArea).toBe('ERP');
    expect(shell).toContain('<Dialogo id="ff-gaveta" aberto={gaveta} aoFechar={() => setGaveta(false)} titulo="Menu" gaveta voltarPara={retornoDaGaveta}>');
  });

  it('o foco ao fechar a gaveta: Escape e o X devolvem a quem abriu (o Mais ou o menu); escolher um destino leva ao menu do topo', () => {
    const shell = readFileSync('src/components/erp/shell/Shell.tsx', 'utf8');
    // Abrir (pelo Mais ou pelo menu) zera o retorno: o diálogo devolve o foco a quem o abriu.
    expect(shell).toMatch(/const abrirGaveta = useCallback\(\(\) => \{\s*retornoDaGaveta\.current = null;\s*setGaveta\(true\);\s*\}, \[\]\);/);
    expect(shell).toMatch(/ref=\{botaoMenu\}\s*type="button"\s*onClick=\{abrirGaveta\}/);
    // Trocar de tela fecha a gaveta mandando o foco ao menu do topo, não ao Mais (a última parada do Tab da página nova).
    expect(shell).toMatch(/useEffect\(\(\) => \{\s*retornoDaGaveta\.current = botaoMenu\.current;\s*setGaveta\(false\);/);
    expect(readFileSync('src/components/erp/ui/Dialogo.tsx', 'utf8')).toMatch(/\(destino\?\.current \?\? antes\)\?\.focus\(\)/);
  });
});

const marcarBarra = (caminho: string) => renderToStaticMarkup(createElement(BarraDeAbas, { nav: NAV_DONO, caminho, gavetaAberta: false, aoAbrirMais: () => {} }));

describe('abas do celular · onde aparece', () => {
  const bloco = css.slice(css.indexOf('@supports selector(:has(*)) {'), css.indexOf('.ff-app .ff-abas-celular-lista {'));

  it('escondida por padrão; só com `:has()` e abaixo de 640 px, fixa no pé, acima do conteúdo e com a área segura', () => {
    expect(regra('.ff-app .ff-abas-celular')).toContain('display: none');
    expect(bloco).toContain('@media (max-width: 639px) {');
    const visivel = bloco.slice(bloco.indexOf('.ff-app .ff-abas-celular {'));
    for (const d of ['position: fixed', 'bottom: 0', 'z-index: 30', 'display: block', 'padding-bottom: env(safe-area-inset-bottom)']) expect(visivel).toContain(d);
  });

  it('some com uma barra fixa de ações na tela e com um campo de texto em foco (teclado); o fim da página fica acima dela', () => {
    expect(bloco).toMatch(/\.ff-app:has\(\[data-barra-fixa\]\) \.ff-abas-celular,\s*\.ff-app:has\(:is\(input:not\([^)]*\), textarea, select, \[contenteditable='true'\]\):focus\) \.ff-abas-celular \{\s*display: none;/);
    for (const t of ['checkbox', 'radio', 'button', 'submit', 'file', 'hidden']) expect(bloco).toContain(`[type='${t}']`);
    // A barra mede 50 px (49 da lista + 1 da borda); a rolagem até um campo deixa mais 8 px para o anel de foco (3 + 4 px).
    expect(bloco).toMatch(/\.ff-app:has\(\.ff-abas-celular\):not\(:has\(\[data-barra-fixa\]\)\) #conteudo \{\s*padding-bottom: calc\(50px \+ env\(safe-area-inset-bottom\) \+ 3rem\);/);
    expect(bloco).toMatch(/html:has\(\.ff-app \.ff-abas-celular\):not\(:has\(\[data-barra-fixa\]\)\) \{/);
    expect(bloco).toMatch(/scroll-padding-bottom: calc\(50px \+ env\(safe-area-inset-bottom\) \+ 8px\);/);
  });

  it('toda barra fixa de ações no pé das telas é marcada com `data-barra-fixa`', () => {
    const arquivos: string[] = [];
    const andar = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) andar(p);
        else if (p.endsWith('.tsx')) arquivos.push(p);
      }
    };
    andar('src/components/erp/telas');
    let barras = 0;
    for (const a of arquivos) {
      for (const m of readFileSync(a, 'utf8').matchAll(/<div ([^>]*className="[^"]*\b(?:fixed inset-x-0 bottom-0|sticky bottom-0)\b[^"]*")/g)) {
        barras++;
        expect(m[1], a).toContain('data-barra-fixa');
      }
    }
    expect(barras).toBeGreaterThanOrEqual(13);
  });

  it('o aviso de período fechado rola o aviso para cima da barra de abas também', () => {
    expect(readFileSync('src/components/erp/ui/aviso-periodo-fechado.tsx', 'utf8')).toContain("document.querySelectorAll('[data-barra-fixa], [data-barra-de-abas]')");
  });

  it('as classes da barra do celular não se confundem com as das abas da área (`ff-aba`, "Seções de…")', () => {
    // As abas da área usam `ff-aba` desde a UX.9; uma regra solta em `.ff-aba` desmontaria a faixa delas.
    const seletores = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim().split('\n').pop()!.trim());
    const daAba = seletores.filter((x) => /\.ff-aba(?![\w-])/.test(x));
    expect(daAba.sort()).toEqual([".ff-app .ff-aba[aria-current='page']", '.ff-app a.ff-aba:focus-visible'].sort());
    expect(marcarBarra('/erp')).not.toMatch(/class="ff-aba[ "]/);
  });

  it('não sai no papel', () => {
    const impressao = css.slice(css.indexOf('@media print {'));
    expect(impressao).toMatch(/\.ff-app \.ff-abas-celular,\s*\.ff-app \.ff-nao-imprime \{\s*display: none !important;/);
  });

  it('aba: alvo de toque da altura da barra (49 px), nome numa linha; a atual em 600 na cor do texto, com o ícone na tinta da área', () => {
    expect(regra('.ff-app .ff-abas-celular-lista')).toContain('height: 49px');
    const aba = regra('.ff-app .ff-aba-celular');
    for (const d of ['height: 100%', 'width: 100%', 'color: rgb(var(--ff-suave))']) expect(aba).toContain(d);
    expect(regra('.ff-app .ff-aba-celular-rotulo')).toContain('white-space: nowrap');
    // Um pouco mais justo: "Faturamento" em 600 passava 0,3 px dos 64 px da aba a 320 px.
    expect(regra('.ff-app .ff-aba-celular-rotulo')).toContain('letter-spacing: -0.01em');
    // Cores forçadas: o ícone da aba atual herda a cor do nome (a tinta da área cairia abaixo de 3:1 com o tema cruzado).
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.ff-app \.ff-aba-celular\[aria-current\] \.ff-aba-celular-icone \{\s*color: inherit;\s*\}\s*\}/);
    const atual = css.slice(css.indexOf(".ff-app .ff-aba-celular[aria-current],"));
    expect(atual).toMatch(/^\.ff-app \.ff-aba-celular\[aria-current\],\s*\.ff-app \.ff-aba-celular\[data-ativa\] \{\s*color: rgb\(var\(--ff-texto\)\);\s*font-weight: 600;/);
    expect(regra('.ff-app .ff-aba-celular[aria-current] .ff-aba-celular-icone')).toContain('color: var(--ff-modulo-tinta)');
    expect(regra('.ff-app .ff-aba-celular:focus-visible')).toContain('outline: 3px solid rgb(var(--ff-acento))');
  });
});

describe('abas do celular · contraste sobre o material, com preto ou branco por baixo', () => {
  type RGB = [number, number, number];
  const variaveis = (seletor: string): Record<string, string> => {
    const i = css.indexOf(seletor);
    const corpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
    return Object.fromEntries([...corpo.matchAll(/--ff-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]));
  };
  const hex = (h: string): RGB => h.slice(1).match(/../g)!.map((x) => parseInt(x, 16)) as RGB;
  const canais = (v: string): RGB => v.split(' ').map(Number) as RGB;
  const comAlfa = (v: string) => {
    const m = v.match(/^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/)!;
    return { cor: [Number(m[1]), Number(m[2]), Number(m[3])] as RGB, alfa: Number(m[4]) };
  };
  const sobre = ({ cor, alfa }: { cor: RGB; alfa: number }, fundo: RGB): RGB => cor.map((n, i) => n * alfa + fundo[i] * (1 - alfa)) as RGB;
  const mistura = (a: RGB, b: RGB, pesoDeA: number): RGB => a.map((n, i) => n * pesoDeA + b[i] * (1 - pesoDeA)) as RGB;
  const lum = (c: RGB) => c.map((n) => n / 255).map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)).reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
  const contraste = (a: RGB, b: RGB) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  for (const [tema, seletor] of [['claro', ".ff-app[data-tema='claro'] {"], ['escuro', ".ff-app[data-tema='escuro'] {"]] as const) {
    it(`${tema}: nomes ≥ 4,5:1 (suave e texto) e ícone da área atual ≥ 3:1, em toda a paleta`, () => {
      const t = variaveis(seletor);
      const tinta = parseFloat(t['icone-tinta']) / 100;
      for (const debaixo of [[0, 0, 0], [255, 255, 255]] as RGB[]) {
        const fundo = sobre(comAlfa(t.material), debaixo);
        expect(contraste(canais(t.suave), fundo), `${tema}/suave`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(canais(t.texto), fundo), `${tema}/texto`).toBeGreaterThanOrEqual(4.5);
        for (const [nome, cor] of Object.entries(COR)) {
          expect(contraste(mistura(hex(cor), canais(t.texto), tinta), fundo), `${tema}/${nome}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
});

describe('título grande (decisão 532)', () => {
  it('Gelasio 34 px/1,15, sem o quadrado da área; o subtítulo vem logo abaixo', () => {
    const h = renderToStaticMarkup(createElement(PageHeader, { icone: 'insumo', cor: COR.insumo, titulo: 'Insumos', subtitulo: 'Rede Completa · 43 insumos' }));
    expect(h).toMatch(/<h1 class="break-words font-display text-\[34px\] font-normal leading-\[1\.15\] tracking-\[-0\.01em\] \[text-wrap:balance\]">Insumos<\/h1>/);
    expect(h).toMatch(/<\/h1><p class="mt-1 break-words text-\[13px\] text-suave sm:text-sm">Rede Completa · 43 insumos<\/p>/);
    expect(h).not.toContain('ff-icone-modulo');
  });
});
