/**
 * Barra de Módulos do celular e do tablet (decisão 535, prévia aprovada por Rodolfo em 23/11/2026; substitui a barra de abas
 * da A3, decisão 532) e o título grande. Sem banco e sem navegador:
 *
 * - quais atalhos: as quatro primeiras áreas da pessoa que têm tela (na ordem do menu, já filtradas por permissão); com menos
 *   de quatro, o Início entra primeiro; o Módulos fica sempre no centro das cinco posições;
 * - qual acende: o atalho da área da tela atual, onde a Cápsula fica; fora dos atalhos, nenhum (o Módulos não recebe o estado);
 * - a janela de Módulos: as áreas da pessoa (a atual marcada), a busca e o "Em breve" como texto;
 * - onde aparece: abaixo de 900 px (no tablet, flutuante), nunca junto de uma barra fixa de ações nem com o teclado aberto (menos
 *   a busca da própria janela), sem cobrir o fim da página; sem `:has()`, não aparece;
 * - contraste sobre o material translúcido (com conteúdo preto ou branco por baixo) e sobre a Cápsula;
 * - o título grande (Gelasio 34 px) sem o quadrado da área.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ALCANCE_FLOWFOODS, resolverAlcance, type VinculoDePermissao } from '@/lib/erp/permissoes';
import {
  ATALHOS_DA_BARRA,
  COLUNA_DE_MODULOS,
  COR,
  atalhosDaBarra,
  chavesDaBarra,
  colunaDoAtalho,
  opcoesDaBarra,
  padraoDaBarra,
  vagasDaBarra,
  filtrarModulos,
  navegacaoDoParceiro,
  nomeCurtoDoModulo,
  rotuloDaAba,
} from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { BarraDeAbas } from '@/components/erp/shell/BarraDeAbas';
import { JanelaDeModulos, origemDaExpansao, rotuloDaPosicao } from '@/components/erp/shell/JanelaDeModulos';
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

describe('barra de Módulos · quais atalhos', () => {
  it('dono: as quatro primeiras áreas, duas de cada lado do Módulos, como na prévia aprovada', () => {
    const { atalhos, ativo } = atalhosDaBarra(NAV_DONO, '/erp');
    expect(ATALHOS_DA_BARRA).toBe(4);
    expect(COLUNA_DE_MODULOS).toBe(2);
    expect(atalhos.map((a) => a.rotulo)).toEqual(['Cadastros', 'Compras', 'Estoque', 'Produção']);
    expect(atalhos.map((a) => a.coluna)).toEqual([0, 1, 3, 4]);
    // No Início nenhum atalho acende: as quatro posições são áreas.
    expect(ativo).toBeNull();
    expect(atalhos.every((a) => !a.ativo)).toBe(true);
  });

  it('cada atalho leva à entrada que o menu já tem (nenhum destino novo), com o ícone e a cor da área', () => {
    const { atalhos } = atalhosDaBarra(NAV_DONO, '/erp');
    expect(atalhos.map((a) => a.href)).toEqual(NAV_DONO.modulos.slice(0, 4).map((m) => m.href));
    expect(atalhos.map((a) => [a.icone, a.cor, a.nome])).toEqual(NAV_DONO.modulos.slice(0, 4).map((m) => [m.icone, m.cor, m.nome]));
  });

  it('acende o atalho da área em qualquer tela dela (a coluna da Cápsula); fora dos atalhos, nenhum', () => {
    const cadastros = NAV_DONO.modulos[0];
    const tela = cadastros.grupos.at(-1)!.itens.at(-1)!.href;
    let r = atalhosDaBarra(NAV_DONO, `${tela}/um-detalhe`);
    expect(r.atalhos.filter((a) => a.ativo).map((a) => a.rotulo)).toEqual(['Cadastros']);
    expect(r.ativo).toBe(0);
    r = atalhosDaBarra(NAV_DONO, NAV_DONO.modulos[3].href!);
    expect(r.ativo).toBe(4);
    // A quinta área ficou fora dos atalhos: nada acende, e o Módulos não toma o estado da seção.
    r = atalhosDaBarra(NAV_DONO, NAV_DONO.modulos[4].href!);
    expect(r.atalhos.some((a) => a.ativo)).toBe(false);
    expect(r.ativo).toBeNull();
    r = atalhosDaBarra(NAV_DONO, '/erp/fora-do-menu');
    expect(r.ativo).toBeNull();
  });

  it('módulo sem tela no meio das áreas não toma o lugar de um atalho (o filtro vem antes do corte em quatro)', () => {
    const [a, b, c, d] = NAV_DONO.modulos;
    const futuro = { ...a, chave: 'futuro', nome: 'Módulo futuro', href: null, grupos: [], acoes: [] };
    const nav = { ...NAV_DONO, modulos: [a, futuro, b, c, d] };
    expect(atalhosDaBarra(nav, '/erp').atalhos.map((x) => x.rotulo)).toEqual([a, b, c, d].map((m) => rotuloDaAba(m.nome)));
  });

  it('menos de quatro áreas: o Início entra primeiro, e o Módulos continua no centro, com os atalhos encostados nele', () => {
    const [a, b] = NAV_DONO.modulos;
    const duas = { ...NAV_DONO, modulos: [a, b] };
    const r = atalhosDaBarra(duas, '/erp');
    expect(r.atalhos.map((x) => x.rotulo)).toEqual(['Início', rotuloDaAba(a.nome), rotuloDaAba(b.nome)]);
    expect(r.atalhos.map((x) => x.coluna)).toEqual([0, 1, 3]);
    // No Início, o atalho do Início acende.
    expect(r.ativo).toBe(0);
    expect(atalhosDaBarra({ ...NAV_DONO, modulos: [] }, '/erp').atalhos.map((x) => [x.rotulo, x.coluna])).toEqual([['Início', 1]]);
    expect(atalhosDaBarra({ ...NAV_DONO, modulos: [a] }, '/erp').atalhos.map((x) => x.coluna)).toEqual([1, 3]);
    // As colunas nunca caem no Módulos nem saem das cinco.
    for (let total = 1; total <= 4; total++) {
      const colunas = Array.from({ length: total }, (_, i) => colunaDoAtalho(i, total));
      expect(colunas).not.toContain(COLUNA_DE_MODULOS);
      expect(colunas.every((c) => c >= 0 && c <= 4)).toBe(true);
      expect(new Set(colunas).size).toBe(total);
    }
  });

  it('pessoa com menos áreas: só as dela; o catálogo "Em breve" (sem tela) nunca vira atalho', () => {
    const navFin = navegacaoDoParceiro(proprio(['faturamento.ver']), NENHUM_MODULO_LIBERADO);
    const fin = atalhosDaBarra(navFin, '/erp');
    expect(fin.atalhos.map((a) => a.rotulo)).toContain('Faturamento');
    expect(fin.atalhos.map((a) => a.rotulo)).not.toContain('Cadastros');
    const n1 = navegacaoDoParceiro(ALCANCE_FLOWFOODS, NENHUM_MODULO_LIBERADO);
    expect(n1.modulos.some((m) => m.href === null)).toBe(true);
    expect(atalhosDaBarra(n1, '/erp').atalhos.every((a) => typeof a.href === 'string' && a.href.length > 0)).toBe(true);
  });

  it('o nome no atalho é a primeira palavra da área, curto para 320 px; na grade, o nome inteiro quando cabe', () => {
    const nomes = NAV_DONO.modulos.map((m) => rotuloDaAba(m.nome));
    expect(nomes).toEqual(['Cadastros', 'Compras', 'Estoque', 'Produção', 'Etiquetas', 'Faturamento', 'Rede']);
    for (const n of nomes) expect(n.length, n).toBeLessThanOrEqual(11);
    // Os nomes da prévia aprovada: o inteiro até 14 letras ("Rede e Equipe"), senão o da aba.
    expect(NAV_DONO.modulos.map((m) => nomeCurtoDoModulo(m.nome))).toEqual(['Cadastros', 'Compras', 'Estoque', 'Produção', 'Etiquetas', 'Faturamento', 'Rede e Equipe']);
  });

  it('a busca da janela: nome, resumo, função e os sinônimos das abas, sem acento e pelo começo da palavra', () => {
    const nomes = (q: string) => filtrarModulos(NAV_DONO.modulos, q).map((m) => m.chave);
    expect(nomes('')).toEqual(NAV_DONO.modulos.map((m) => m.chave));
    expect(nomes('PRODUCAO')).toEqual([NAV_DONO.modulos[3].chave]);
    expect(nomes('  estoque ')).toContain(NAV_DONO.modulos[2].chave);
    // "Financeiro" é sinônimo do Faturamento e DRE (decisão 527); "nanceiro" (meio da palavra) não acha pelo sinônimo.
    expect(nomes('fin')).toContain(NAV_DONO.modulos[5].chave);
    expect(nomes('nanceiro')).not.toContain(NAV_DONO.modulos[5].chave);
    expect(nomes('xyz')).toEqual([]);
  });
});

describe('barra de Módulos · a escolha da pessoa ("Editar barra", decisão 536)', () => {
  const [cad, comp, est, prod, etq, fat, rede] = NAV_DONO.modulos.map((m) => m.chave);

  it('as opções são o Início e as áreas com tela, na ordem do menu; o padrão é o da decisão 535', () => {
    expect(opcoesDaBarra(NAV_DONO).map((o) => o.chave)).toEqual(['inicio', ...NAV_DONO.modulos.filter((m) => m.href).map((m) => m.chave)]);
    expect(vagasDaBarra(NAV_DONO)).toBe(4);
    expect(padraoDaBarra(NAV_DONO)).toEqual([cad, comp, est, prod]);
    expect(chavesDaBarra(NAV_DONO)).toEqual(padraoDaBarra(NAV_DONO));
    // O "Em breve" nunca é opção.
    const n1 = navegacaoDoParceiro(ALCANCE_FLOWFOODS, NENHUM_MODULO_LIBERADO);
    const futuros = n1.modulos.filter((m) => !m.href).map((m) => m.chave);
    expect(futuros.length).toBeGreaterThan(0);
    for (const f of futuros) expect(opcoesDaBarra(n1).map((o) => o.chave)).not.toContain(f);
  });

  it('a escolha vale na ordem da tela: substitui e reordena; o que faltar vem do padrão, sem repetir', () => {
    expect(chavesDaBarra(NAV_DONO, [fat, 'inicio', rede, comp])).toEqual([fat, 'inicio', rede, comp]);
    const { atalhos } = atalhosDaBarra(NAV_DONO, '/erp', [fat, 'inicio', rede, comp]);
    expect(atalhos.map((a) => [a.chave, a.coluna])).toEqual([[fat, 0], ['inicio', 1], [rede, 3], [comp, 4]]);
    // No Início, o atalho do Início acende (a Cápsula fica nele).
    expect(atalhosDaBarra(NAV_DONO, '/erp', [fat, 'inicio', rede, comp]).ativo).toBe(1);
    // Só duas escolhidas: completa com o padrão, sem repetir.
    expect(chavesDaBarra(NAV_DONO, [etq, cad])).toEqual([etq, cad, comp, est]);
  });

  it('a escolha nunca abre destino fora do menu: chave sem acesso, "Em breve", repetida ou inventada fica de fora', () => {
    const navFin = navegacaoDoParceiro(proprio(['faturamento.ver']), NENHUM_MODULO_LIBERADO);
    const opcoes = opcoesDaBarra(navFin).map((o) => o.chave);
    const r = chavesDaBarra(navFin, [cad, fat, fat, 'nao-existe', 'inicio']);
    expect(r).not.toContain(cad);
    expect(r).not.toContain('nao-existe');
    expect(new Set(r).size).toBe(r.length);
    expect(r.every((c) => opcoes.includes(c))).toBe(true);
    expect(r.length).toBe(vagasDaBarra(navFin));
    expect(r.slice(0, 2)).toEqual([fat, 'inicio']);
    // Escolha maior que as vagas: só as primeiras valem.
    expect(chavesDaBarra(NAV_DONO, [rede, fat, etq, prod, est])).toEqual([rede, fat, etq, prod]);
  });

  it('o rótulo de cada seletor diz o lado do Módulos', () => {
    expect([0, 1, 2, 3].map((i) => rotuloDaPosicao(i, 4))).toEqual([
      '1º atalho · à esquerda do Módulos',
      '2º atalho · à esquerda do Módulos',
      '3º atalho · à direita do Módulos',
      '4º atalho · à direita do Módulos',
    ]);
    expect([0, 1, 2].map((i) => rotuloDaPosicao(i, 3))).toEqual(['1º atalho · à esquerda do Módulos', '2º atalho · à esquerda do Módulos', '3º atalho · à direita do Módulos']);
  });

  it('a janela oferece "Editar barra" só com a edição; o editor grava só no "Salvar barra" e o "Cancelar" não tem efeito', () => {
    const botao = { current: null };
    const com = renderToStaticMarkup(
      createElement(JanelaDeModulos, { id: 'j', nav: NAV_DONO, atual: null, botao, aoFechar: () => {}, edicao: { opcoes: opcoesDaBarra(NAV_DONO).map((o) => ({ chave: o.chave, nome: o.nome })), atuais: chavesDaBarra(NAV_DONO), padrao: padraoDaBarra(NAV_DONO), salvar: async () => ({ ok: true }) } }),
    );
    expect(com).toMatch(/<button type="button" class="[^"]*text-acento[^"]*"><svg[^>]*>.*<\/svg>Editar barra<\/button>/);
    const sem = renderToStaticMarkup(createElement(JanelaDeModulos, { id: 'j', nav: NAV_DONO, atual: null, botao, aoFechar: () => {} }));
    expect(sem).not.toContain('Editar barra');
    const fonte = readFileSync('src/components/erp/shell/JanelaDeModulos.tsx', 'utf8');
    const editor = fonte.slice(fonte.indexOf('function EditorDaBarra('));
    // Falha de rede ou do servidor não prende o editor em "Salvando…"; igual ao padrão grava "sem escolha" (lista vazia).
    expect(editor).toMatch(/try \{[\s\S]*?\} catch \{[\s\S]*?setErro\([\s\S]*?\} finally \{\s*setPendente\(false\);/);
    expect(editor).toContain("edicao.salvar(escolha.join('|') === edicao.padrao.join('|') ? [] : escolha)");
    // Só o "Salvar barra" chama a ação; "Cancelar" e "Voltar ao padrão" só mexem no que está na tela.
    expect(editor.match(/edicao\.salvar\(/g)).toHaveLength(1);
    // O Início é "Início" também nas opções do editor (o mesmo nome da barra).
    expect(opcoesDaBarra(NAV_DONO)[0]).toMatchObject({ chave: 'inicio', rotulo: 'Início', nome: 'Início' });
    expect(editor).toMatch(/onClick=\{\(\) => aoTerminar\(false\)\} className=\{classeDeBotao\('fantasma'\)\}>\s*Cancelar/);
    expect(editor).toMatch(/onClick=\{\(\) => \{\s*setEscolha\(edicao\.padrao\);/);
    // Repetida trava o salvar e é dita (com o campo marcado); o seletor mantém a barra à vista.
    expect(editor).toContain('disabled={!!repetida || pendente || !mudou}');
    expect(editor).toContain('está em duas posições. Cada área entra na barra uma vez só.');
    expect(editor).toMatch(/<select[\s\S]*?data-mantem-barra[\s\S]*?aria-invalid=\{repetida === chave \? true : undefined\}/);
    // As opções do seletor são as da barra (nunca uma lista à parte).
    expect(editor).toContain('{edicao.opcoes.map((o) => (');
  });

  it('a barra passa a escolha salva adiante: o layout lê da sessão, a ação é a do servidor', () => {
    const layout = readFileSync('src/app/erp/layout.tsx', 'utf8');
    expect(layout).toContain('barra={{ escolhidos: pessoa.atalhosDaBarra, salvar: acaoSalvarAtalhosDaBarra }}');
    const barra = readFileSync('src/components/erp/shell/BarraDeAbas.tsx', 'utf8');
    expect(barra).toContain('const { atalhos, ativo } = atalhosDaBarra(nav, caminho, escolhidos);');
    expect(barra).toContain('opcoes: opcoesDaBarra(nav).map((o) => ({ chave: o.chave, nome: o.nome }))');
  });
});

describe('barra de Módulos · marcação', () => {
  const marcar = (caminho: string) => renderToStaticMarkup(createElement(BarraDeAbas, { nav: NAV_DONO, caminho }));

  it('nav "Áreas" no material: a Cápsula, os quatro atalhos e o Módulos no centro', () => {
    const h = marcar('/erp');
    expect(h).toMatch(/^<nav aria-label="Áreas" data-barra-de-abas="true" class="ff-abas-celular ff-material">/);
    expect([...h.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])).toEqual(atalhosDaBarra(NAV_DONO, '/erp').atalhos.map((a) => a.href));
    // Cinco posições na ordem da tela (a do Tab e a do leitor de tela): o Módulos na terceira, os atalhos nas outras. Todas na
    // primeira linha: uma coluna fora de ordem não pode descer para uma segunda linha, abaixo da tela.
    expect([...h.matchAll(/<li style="grid-column:(\d)">/g)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5]);
    expect(h.indexOf('ff-aba-modulos')).toBeGreaterThan(h.indexOf(`href="${NAV_DONO.modulos[1].href}"`));
    expect(h.indexOf('ff-aba-modulos')).toBeLessThan(h.indexOf(`href="${NAV_DONO.modulos[2].href}"`));
    expect(regra('.ff-app .ff-abas-celular-lista > li')).toContain('grid-row: 1');
    // Com dois atalhos, as colunas continuam em ordem e o Módulos no centro.
    const duas = renderToStaticMarkup(createElement(BarraDeAbas, { nav: { ...NAV_DONO, modulos: NAV_DONO.modulos.slice(0, 1) }, caminho: '/erp' }));
    expect([...duas.matchAll(/<li style="grid-column:(\d)">/g)].map((m) => Number(m[1]))).toEqual([2, 3, 4]);
    expect(h).toMatch(/<button type="button" aria-haspopup="dialog" aria-expanded="false" class="ff-aba-celular ff-aba-modulos">.*<span class="ff-aba-celular-rotulo">Módulos<\/span><\/button>/);
    // Fechada, a janela nem existe (e o botão não aponta para ela).
    expect(h).not.toContain('data-janela-de-modulos');
    expect(h).not.toContain('aria-controls');
    // Sem `data-barra-fixa`: ela não é barra de ações e não pode esconder a si mesma. O Mais saiu: o menu fica no topo.
    expect(h).not.toContain('data-barra-fixa');
    expect(h).not.toContain('>Mais<');
  });

  it('a área atual: "page" na própria entrada, "true" dentro dela; o nome inteiro é o nome acessível do atalho', () => {
    const entrada = NAV_DONO.modulos[1].href!;
    expect(marcar(entrada)).toMatch(new RegExp(`<a aria-current="page" aria-label="${NAV_DONO.modulos[1].nome}"[^>]*href="${entrada}">`));
    expect(marcar(`${entrada}/algo`)).toMatch(new RegExp(`<a aria-current="true"[^>]*href="${entrada}">`));
    expect(marcar(`${entrada}/algo`).match(/aria-current/g)).toHaveLength(1);
    expect(marcar('/erp')).not.toContain('aria-current');
    // O Módulos nunca recebe o estado da seção, nem com a área fora dos atalhos.
    expect(marcar(NAV_DONO.modulos[4].href!)).not.toContain('aria-current');
  });

  it('a Cápsula: uma só, escondida do leitor de tela, na coluna e no tom da área atual; sem área nos atalhos, some', () => {
    const capsula = (h: string) => /<span aria-hidden="true" data-capsula="true"( data-visivel="")? class="ff-capsula ff-identidade-modulo" style="([^"]*)"><\/span>/.exec(h);
    const naCompras = capsula(marcar(NAV_DONO.modulos[1].href!))!;
    expect(naCompras[1]).toBe(' data-visivel=""');
    expect(naCompras[2]).toBe(`--ff-capsula-coluna:1;--cor-modulo:${NAV_DONO.modulos[1].cor}`);
    expect(capsula(marcar(NAV_DONO.modulos[3].href!))![2]).toContain('--ff-capsula-coluna:4;');
    const fora = capsula(marcar(NAV_DONO.modulos[4].href!))!;
    expect(fora[1]).toBeUndefined();
    expect(marcar('/erp').match(/data-capsula/g)).toHaveLength(1);
  });

  it('o shell põe a barra depois do conteúdo (ordem do Tab), só no ERP do parceiro; o menu inteiro segue na gaveta do topo', () => {
    const shell = readFileSync('src/components/erp/shell/Shell.tsx', 'utf8');
    expect(shell.indexOf('<BarraDeAbas')).toBeGreaterThan(shell.indexOf('</main>'));
    expect(shell).toMatch(/\{nav\.rotuloDaArea === 'ERP' && <BarraDeAbas nav=\{nav\} caminho=\{caminho\} barra=\{props\.barra\} \/>\}/);
    expect(NAV_DONO.rotuloDaArea).toBe('ERP');
    expect(shell).toContain('<Dialogo id="ff-gaveta" aberto={gaveta} aoFechar={() => setGaveta(false)} titulo="Menu" gaveta voltarPara={retornoDaGaveta}>');
    expect(shell).toMatch(/ref=\{botaoMenu\}\s*type="button"\s*onClick=\{abrirGaveta\}/);
    expect(shell).toMatch(/useEffect\(\(\) => \{\s*retornoDaGaveta\.current = botaoMenu\.current;\s*setGaveta\(false\);/);
  });
});

describe('janela de Módulos', () => {
  const botao = { current: null };
  const marcar = (caminho: string, nav = NAV_DONO) =>
    renderToStaticMarkup(createElement(JanelaDeModulos, { id: 'j', nav, atual: atalhosDaBarra(nav, caminho).atalhos.length ? (nav.modulos.find((m) => m.href === caminho) ?? null) : null, botao, aoFechar: () => {} }));

  it('diálogo sem bloqueio, com título, fechar, busca e a Expansão; o Início e as áreas da pessoa, na ordem do menu', () => {
    const h = marcar('/erp');
    expect(h).toMatch(/^<div id="j" role="dialog" aria-modal="false" aria-labelledby="[^"]+" data-janela-de-modulos="true" data-formato="barra" class="ff-janela-modulos ff-expansao">/);
    expect(h).toMatch(/<h2 tabindex="-1" id="[^"]+" class="font-display text-\[20px\][^"]*">Módulos<\/h2>/);
    // O Início: nome visível e nome acessível iguais (WCAG 2.5.3); "Áreas da Rede" é o título da tela, não o do bloco.
    expect(h).toMatch(new RegExp(`<a aria-current="true" class="ff-bloco-compacto[^"]*" style="[^"]*" href="${NAV_DONO.inicio.href}">`));
    expect(h).not.toContain(`aria-label="${NAV_DONO.inicio.titulo}"`);
    // As regiões de estado ficam montadas (vazias) para o leitor de tela anunciar quando o texto chega.
    expect(h).toContain('<p role="status" class="sr-only"></p>');
    expect(h).toContain('aria-label="Fechar os módulos"');
    expect(h).toMatch(/<input type="search" aria-label="Buscar módulo" placeholder="Buscar módulo" autoComplete="off" enterKeyHint="search" data-mantem-barra="true" class="ff-busca-modulos" value=""\/>/);
    expect([...h.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])).toEqual([NAV_DONO.inicio.href, ...NAV_DONO.modulos.filter((m) => m.href).map((m) => m.href)]);
    // No Início, o bloco do Início é o atual; os nomes são os curtos, com o inteiro como nome acessível.
    expect(h).toMatch(new RegExp(`<a aria-current="true"[^>]*href="${NAV_DONO.inicio.href}"`));
    expect(h).toContain(`aria-label="${NAV_DONO.modulos[2].nome}" title="${NAV_DONO.modulos[2].nome}"`);
    expect(h).toContain('<span class="ff-bloco-compacto-nome min-w-0">Estoque</span>');
    // O "Editar barra" é da fatia seguinte: nada de link sem destino.
    expect(h).not.toContain('Editar barra');
  });

  it('a área atual fica marcada (só ela); o "Em breve" é texto com selo, nunca link', () => {
    const compras = NAV_DONO.modulos[1];
    const h = marcar(compras.href!);
    expect(h.match(/aria-current="true"/g)).toHaveLength(1);
    expect(h).toMatch(new RegExp(`<a aria-current="true"[^>]*href="${compras.href}"`));
    const n1 = navegacaoDoParceiro(ALCANCE_FLOWFOODS, NENHUM_MODULO_LIBERADO);
    const futuros = n1.modulos.filter((m) => !m.href);
    const j = marcar('/erp', n1);
    expect(j).toContain('>Em breve</p>');
    expect(j.match(/ff-bloco-compacto-futuro/g)).toHaveLength(futuros.length);
    expect([...j.matchAll(/<a [^>]*href="([^"]+)"/g)]).toHaveLength(n1.modulos.filter((m) => m.href).length + 1);
  });

  it('formato central (decisão 537): a mesma janela, no centro da área de trabalho do computador, com quatro colunas e sem "Editar barra"', () => {
    const h = renderToStaticMarkup(createElement(JanelaDeModulos, { id: 'c', nav: NAV_DONO, atual: null, botao, aoFechar: () => {}, formato: 'central' }));
    expect(h).toMatch(/data-formato="central" class="ff-janela-modulos ff-expansao ff-janela-modulos-central"/);
    expect(h).not.toContain('Editar barra');
    const central = regra('.ff-app .ff-janela-modulos.ff-janela-modulos-central');
    for (const d of ['left: var(--ff-fim-da-lateral, 232px)', 'right: 0', 'top: var(--ff-topo-da-janela, 80px)', 'bottom: auto', 'width: min(760px, calc(100% - var(--ff-fim-da-lateral, 232px) - 64px))', 'margin-inline: auto']) expect(central).toContain(d);
    expect(regra('.ff-app .ff-janela-modulos-central .ff-grade-compacta')).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    const fonte = readFileSync('src/components/erp/shell/JanelaDeModulos.tsx', 'utf8');
    // Vai para o fim do `.ff-app` (a barra presa do topo passaria por cima dela na lateral) e o foco entra na busca.
    expect(fonte).toContain("const destino = central && typeof document !== 'undefined' ? botao.current?.closest('.ff-app') : null;");
    expect(fonte).toContain('return destino ? createPortal(conteudo, destino) : conteudo;');
    // Com mouse, a busca; com toque (tablet deitado), o título: o teclado virtual não abre por cima da grade.
    expect(fonte).toMatch(/if \(window\.matchMedia\?\.\('\(pointer: fine\)'\)\.matches\) busca_\.current\?\.focus\(\);\s*else titulo\.current\?\.focus\(\);/);
    // O Tab que sai pelas pontas: depois do último, o foco segue para o que vem depois do seletor; antes do primeiro, volta a ele.
    expect(fonte).toMatch(/if \(e\.shiftKey && \(document\.activeElement === focaveis\[0\] \|\| document\.activeElement === titulo\.current\)\) \{\s*e\.preventDefault\(\);\s*aoFechar\(true\);/);
    expect(fonte).toMatch(/const seguinte = focavelDepois\(botao\.current, janela\.current\);\s*aoFechar\(false\);\s*\(seguinte \?\? botao\.current\)\.focus\(\);/);
    // As setas andam pela grade, como no seletor da gaveta.
    expect(fonte).toContain('<div className="ff-janela-modulos-corpo" onKeyDown={andarPelosBlocos}>');
    // Só a lateral do computador abre a central; a gaveta do celular segue com o painel preso ao seletor.
    const nav = readFileSync('src/components/erp/shell/NavLateral.tsx', 'utf8');
    expect(nav).toMatch(/\{janelaCentral \? \(\s*<SeletorComJanela[^>]*\/>\s*\) : \(\s*<SeletorDeModulo/);
    expect(nav).toContain('<JanelaDeModulos id={id} nav={nav} atual={atual} botao={botao} aoFechar={fechar} formato="central" />');
    const shell = readFileSync('src/components/erp/shell/Shell.tsx', 'utf8');
    expect(shell.match(/janelaCentral/g)).toHaveLength(1);
    expect(shell.indexOf('janelaCentral')).toBeLessThan(shell.indexOf('</aside>'));
  });

  it('a origem da Expansão é o centro do botão, visto do canto da janela', () => {
    expect(origemDaExpansao({ left: 140, top: 600, width: 64, height: 58 }, { left: 8, top: 300 })).toBe('164px 329px');
    expect(origemDaExpansao({ left: 0, top: 0, width: 10, height: 10 }, { left: 0, top: 0 })).toBe('5px 5px');
  });

  it('fecha como o painel do seletor: Escape e o fechar devolvem o foco; toque fora, foco que sai e troca de tela, não', () => {
    const fonte = readFileSync('src/components/erp/shell/JanelaDeModulos.tsx', 'utf8');
    expect(fonte).toMatch(/if \(e\.key !== 'Escape'\) return;\s*e\.preventDefault\(\);\s*aoFechar\(true\);/);
    expect(fonte).toMatch(/onClick=\{\(\) => aoFechar\(true\)\} aria-label="Fechar os módulos"/);
    expect(fonte).toMatch(/if \(janela\.current\?\.contains\(alvo\) \|\| botao\.current\?\.contains\(alvo\)\) return;\s*aoFechar\(false\);/);
    expect(fonte).toMatch(/if \(foraDaCaixa\(e\.currentTarget, e\.relatedTarget\) && !botao\.current\?\.contains\(e\.relatedTarget as Node\)\) aoFechar\(false\);/);
    expect(fonte).toMatch(/if \(caminho !== caminhoAoAbrir\.current\) aoFechar\(false\);/);
    // Abrir e fechar não consultam nem gravam nada, e fechar não espera animação.
    for (const proibido of [/fetch\(/, /'use server'/, /animationend|transitionend|setTimeout|requestAnimationFrame/]) expect(fonte).not.toMatch(proibido);
    const barra = readFileSync('src/components/erp/shell/BarraDeAbas.tsx', 'utf8');
    expect(barra).toMatch(/const fechar = useCallback\(\(devolverFoco: boolean\) => \{\s*setAberta\(false\);\s*if \(devolverFoco\) botao\.current\?\.focus\(\);\s*\}, \[\]\);/);
  });
});

const marcarBarra = (caminho: string) => renderToStaticMarkup(createElement(BarraDeAbas, { nav: NAV_DONO, caminho }));

describe('barra de Módulos · onde aparece', () => {
  const bloco = css.slice(css.indexOf('@supports selector(:has(*)) {'), css.indexOf('.ff-app .ff-abas-celular-trilho {'));

  it('escondida por padrão; só com `:has()` e abaixo de 900 px (onde não há menu lateral), fixa no pé, com a área segura', () => {
    expect(regra('.ff-app .ff-abas-celular')).toContain('display: none');
    expect(bloco).toContain('@media (max-width: 899px) {');
    const visivel = bloco.slice(bloco.indexOf('.ff-app .ff-abas-celular {'));
    for (const d of ['position: fixed', 'bottom: 0', 'z-index: 30', 'display: block', 'padding-bottom: env(safe-area-inset-bottom)']) expect(visivel).toContain(d);
    // A lateral entra a 900 px: as duas navegações nunca aparecem juntas.
    expect(readFileSync('src/components/erp/shell/Shell.tsx', 'utf8')).toContain('hidden h-dvh border-r border-linha bg-lateral min-[900px]:block');
  });

  it('tablet (640 a 899 px): flutuante no centro, 12 px acima do pé, cantos de 20 px e sem `transform` (a janela é fixa na tela)', () => {
    const tablet = bloco.slice(bloco.indexOf('@media (min-width: 640px) and (max-width: 899px) {'));
    const regraDoTablet = tablet.slice(tablet.indexOf('.ff-app .ff-abas-celular {'), tablet.indexOf('}', tablet.indexOf('.ff-app .ff-abas-celular {')));
    for (const d of ['bottom: calc(12px + env(safe-area-inset-bottom))', 'width: min(480px, calc(100% - 48px))', 'margin-inline: auto', 'border-radius: 20px']) expect(regraDoTablet).toContain(d);
    expect(tablet).toMatch(/\.ff-app \.ff-abas-celular\.ff-material::before \{\s*border-radius: inherit;/);
    const daBarra = [...css.matchAll(/([^{}]*\.ff-abas-celular[^{}]*)\{([^{}]*)\}/g)].map((m) => m[2]).join('\n');
    expect(daBarra).not.toMatch(/transform|filter|will-change|contain:/);
  });

  it('some com uma barra fixa de ações e com um campo de texto em foco (teclado), menos a busca da janela; o fim da página fica acima', () => {
    expect(bloco).toMatch(/\.ff-app:has\(\[data-barra-fixa\]\) \.ff-abas-celular,\s*\.ff-app:has\(:is\(input:not\([^)]*\), textarea, select:not\(\[data-mantem-barra\]\), \[contenteditable='true'\]\):focus\) \.ff-abas-celular \{\s*display: none;/);
    for (const t of ['checkbox', 'radio', 'button', 'submit', 'file', 'hidden']) expect(bloco).toContain(`[type='${t}']`);
    expect(bloco).toContain("[type='hidden'], [data-mantem-barra])");
    // Só a busca da janela de Módulos fica de fora (ela abre acima da barra, que é a âncora dela).
    const comMarca = (['src/components/erp/shell', 'src/components/erp/telas', 'src/components/erp/ui'] as const).flatMap((d) =>
      (readdirSync(d, { recursive: true }) as string[]).filter((f) => f.endsWith('.tsx') && readFileSync(`${d}/${f}`, 'utf8').includes('data-mantem-barra')).map((f) => f),
    );
    expect(comMarca).toEqual(['JanelaDeModulos.tsx']);
    // A reserva: 59 px no celular (58 da lista + 1 da borda) e 72 px no tablet (58 + 2 das bordas + 12 do vão até o pé); a
    // rolagem até um campo deixa mais 8 px para o anel de foco (3 + 4 px).
    expect(bloco).toMatch(/@media \(max-width: 639px\) \{\s*:root \{\s*--ff-reserva-da-barra: 59px;/);
    expect(bloco).toMatch(/@media \(min-width: 640px\) and \(max-width: 899px\) \{\s*:root \{\s*--ff-reserva-da-barra: 72px;/);
    expect(regra('.ff-app .ff-abas-celular-lista')).toContain('height: 58px');
    expect(bloco).toMatch(/\.ff-app:has\(\.ff-abas-celular\):not\(:has\(\[data-barra-fixa\]\)\) #conteudo \{\s*padding-bottom: calc\(var\(--ff-reserva-da-barra\) \+ env\(safe-area-inset-bottom\) \+ 3rem\);/);
    expect(bloco).toMatch(/html:has\(\.ff-app \.ff-abas-celular\):not\(:has\(\[data-barra-fixa\]\)\) \{/);
    expect(bloco).toMatch(/scroll-padding-bottom: calc\(var\(--ff-reserva-da-barra\) \+ env\(safe-area-inset-bottom\) \+ 8px\);/);
  });

  it('com a janela aberta, a barra passa da faixa da marca (z-31) e a janela fica acima dela, sem sair da tela', () => {
    expect(bloco).toMatch(/\.ff-app \.ff-abas-celular\[data-modulos-aberto\] \{\s*z-index: 40;/);
    expect(readFileSync('src/components/erp/shell/cabecalho-identidade.css', 'utf8')).toMatch(/\.ff-cabecalho-identidade \{[^}]*z-index: 31;/);
    const janela = regra('.ff-app .ff-janela-modulos');
    for (const d of ['position: fixed', 'inset-inline: 8px', 'bottom: calc(var(--ff-reserva-da-barra, 59px) + env(safe-area-inset-bottom) + 8px)', 'max-height: calc(100dvh - var(--ff-reserva-da-barra, 59px) - env(safe-area-inset-bottom) - 24px)']) expect(janela).toContain(d);
    expect(css).toMatch(/@media \(min-width: 640px\) \{\s*\.ff-app \.ff-janela-modulos \{\s*inset-inline: 0;\s*width: min\(560px, calc\(100% - 48px\)\);/);
    // Duas colunas no celular, três no tablet; o corpo rola por dentro.
    expect(regra('.ff-app .ff-grade-compacta')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toMatch(/@media \(min-width: 640px\) \{\s*\.ff-app \.ff-grade-compacta \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    expect(regra('.ff-app .ff-janela-modulos-corpo')).toContain('overflow-y: auto');
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

  it('o aviso de período fechado rola o aviso para cima da barra também', () => {
    expect(readFileSync('src/components/erp/ui/aviso-periodo-fechado.tsx', 'utf8')).toContain("document.querySelectorAll('[data-barra-fixa], [data-barra-de-abas]')");
  });

  it('as classes da barra não se confundem com as das abas da área (`ff-aba`, "Seções de…")', () => {
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

  it('atalho: alvo da altura da barra (58 px), nome numa linha; o atual em 600 na cor do texto; o ícone sempre na tinta da área', () => {
    const aba = regra('.ff-app .ff-aba-celular');
    for (const d of ['height: 100%', 'width: 100%', 'color: rgb(var(--ff-suave))']) expect(aba).toContain(d);
    expect(regra('.ff-app .ff-aba-celular-rotulo')).toContain('white-space: nowrap');
    // Um pouco mais justo: "Faturamento" em 600 passava 0,3 px dos 64 px da posição a 320 px.
    expect(regra('.ff-app .ff-aba-celular-rotulo')).toContain('letter-spacing: -0.01em');
    // A Cápsula não recolore: o ícone fica na tinta da área com ou sem ela (cores forçadas: herda a cor do nome).
    expect(regra('.ff-app .ff-aba-celular .ff-aba-celular-icone')).toContain('color: var(--ff-modulo-tinta)');
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.ff-app \.ff-aba-celular \.ff-aba-celular-icone \{\s*color: inherit;\s*\}\s*\}/);
    expect(regra('.ff-app .ff-aba-celular[aria-current]')).toMatch(/color: rgb\(var\(--ff-texto\)\);\s*font-weight: 600;/);
    expect(regra('.ff-app .ff-aba-celular:focus-visible')).toContain('outline: 3px solid rgb(var(--ff-acento))');
    // O Módulos: o quadrado no vermelho de ação com o desenho claro, o nome na tinta do acento.
    expect(regra('.ff-app .ff-aba-modulos')).toContain('color: rgb(var(--ff-acento))');
    const quadrado = regra('.ff-app .ff-aba-modulos .ff-aba-celular-caixa');
    expect(quadrado).toContain('background-color: rgb(var(--ff-acao))');
    expect(quadrado).toContain('color: rgb(var(--ff-sobre-acao))');
  });

  it('Cápsula: desliza de coluna em coluna (transform e opacidade, 220 ms, sem atraso), atrás da lista, visível nas cores forçadas', () => {
    const c = regra('.ff-app .ff-capsula');
    for (const d of ['position: absolute', 'width: 20%', 'pointer-events: none', 'opacity: 0', 'transform: translateX(calc(var(--ff-capsula-coluna, 2) * 100%))', 'transition-property: transform, opacity', 'transition-duration: var(--ff-movimento)', 'transition-timing-function: var(--ff-curva-entrada)']) expect(c).toContain(d);
    expect(regra('.ff-app .ff-capsula[data-visivel]')).toContain('opacity: 1');
    const fundo = regra('.ff-app .ff-capsula::before');
    expect(fundo).toContain('border: 1px solid transparent');
    expect(fundo).toContain('background-color: color-mix(in srgb, var(--ff-modulo-cor) 16%, rgb(var(--ff-painel)))');
    // A lista é posicionada e vem depois: fica por cima da Cápsula. A Cápsula vem antes dela no HTML.
    expect(regra('.ff-app .ff-abas-celular-lista')).toContain('position: relative');
    const h = marcarBarra(NAV_DONO.modulos[0].href!);
    expect(h.indexOf('data-capsula')).toBeLessThan(h.indexOf('<ul class="ff-abas-celular-lista">'));
  });
});

describe('barra de Módulos · contraste sobre o material e sobre a Cápsula, com preto ou branco por baixo', () => {
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
    it(`${tema}: nomes ≥ 4,5:1 (suave, texto e o acento do Módulos) e ícones ≥ 3:1, em toda a paleta`, () => {
      const t = variaveis(seletor);
      const tinta = parseFloat(t['icone-tinta']) / 100;
      for (const debaixo of [[0, 0, 0], [255, 255, 255]] as RGB[]) {
        const fundo = sobre(comAlfa(t.material), debaixo);
        expect(contraste(canais(t.suave), fundo), `${tema}/suave`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(canais(t.texto), fundo), `${tema}/texto`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(canais(t.acento), fundo), `${tema}/acento`).toBeGreaterThanOrEqual(4.5);
        for (const [nome, cor] of Object.entries(COR)) {
          expect(contraste(mistura(hex(cor), canais(t.texto), tinta), fundo), `${tema}/${nome}`).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it(`${tema}: sobre a Cápsula (16 % da área no painel), o ícone na tinta fica ≥ 3:1 e o nome ≥ 4,5:1, em toda a paleta`, () => {
      const t = variaveis(seletor);
      const tinta = parseFloat(t['icone-tinta']) / 100;
      for (const [nome, cor] of Object.entries(COR)) {
        const capsula = mistura(hex(cor), canais(t.painel), 0.16);
        expect(contraste(mistura(hex(cor), canais(t.texto), tinta), capsula), `${tema}/${nome}/ícone`).toBeGreaterThanOrEqual(3);
        expect(contraste(canais(t.texto), capsula), `${tema}/${nome}/texto`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${tema}: no quadrado do Módulos, o desenho claro fica ≥ 4,5:1 sobre a ação (parado e aberto)`, () => {
      const t = variaveis(seletor);
      expect(contraste(canais(t['sobre-acao']), canais(t.acao))).toBeGreaterThanOrEqual(4.5);
      expect(contraste(canais(t['sobre-acao']), canais(t['acao-hover']))).toBeGreaterThanOrEqual(4.5);
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
