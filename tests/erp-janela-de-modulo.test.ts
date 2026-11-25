/**
 * Janela de módulo (UX-MOD-2, piloto do nível 1, decisão 526) — sem banco e sem navegador:
 *
 * - o que a janela mostra sai do menu (nunca diverge dele); o piloto é só Rede e Equipe, só no nível 1;
 * - as regras puras: endereços da janela, quando a navegação vira tela inteira, a página de trás no shell, a pilha do
 *   Voltar e o rascunho por formulário;
 * - as rotas: o espaço `@janela` só intercepta páginas que existem, reexportando a MESMA página (as mesmas conferências de
 *   acesso); as rotas vazias fecham a janela ao sair dela; os limites de erro; o /erp dos parceiros não tem janela;
 * - o quadro: nome acessível com a tela, contexto, botões, abas com a atual marcada, Voltar desligado ao abrir, o aviso do
 *   parceiro no corpo;
 * - o estilo: tamanho, tela inteira no celular (com ou sem Expandir), a trava de rolagem por CSS.
 *
 * O comportamento (abrir, abas, Voltar, Fechar, Escape, minimizar, âncora, rascunho, busca, foco, celular) é provado no
 * roteiro de navegador local registrado no PR; aqui ficam as regras e a estrutura.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/rodolfo/erp/alfa/lojas',
  useSearchParams: () => new URLSearchParams(''),
  useSelectedLayoutSegments: () => [],
  useRouter: () => ({ back: () => {}, push: () => {}, replace: () => {}, refresh: () => {} }),
}));

import {
  AREA_DA_JANELA,
  areaDaJanela,
  caminhoDe,
  caminhoDoFundo,
  campoAlterado,
  contaComoRascunho,
  destinoViraTelaInteira,
  ehDaJanela,
  formularioComRascunho,
  fotografiaDosCampos,
  fundoDaJanelaNoShell,
  ID_DA_JANELA_NA_BARRA,
  ID_DA_JANELA_NO_CONTEUDO,
  PASSOS_MAXIMOS_AO_FECHAR,
  proximaPilha,
  telaAbertaNaJanela,
  telaDaJanela,
  TELAS_DA_JANELA,
  type CampoDoRascunho,
} from '@/lib/erp/janela';
import { modulosDoParceiro } from '@/lib/erp/modulos';
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { TODOS_OS_MODULOS_COM_LIBERACAO } from '@/lib/erp/liberacao';
import { JanelaDeModulo } from '@/components/erp/shell/JanelaDeModulo';

const BASE = '/rodolfo/erp/alfa';
const NIVEL1 = join('src', 'app', 'rodolfo', '(painel)', 'erp', '[slug]');
const ESPACO = join(NIVEL1, '@janela');
const ler = (f: string) => readFileSync(f, 'utf8');
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
const arquivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : [p];
  });
const pastas = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? [n, ...pastas(p)] : [];
  });
const ROTA_VAZIA = /^export default function \w+\(\) \{\s*return null;\s*\}$/;
const SHELL = join('src', 'components', 'erp', 'shell');
const componente = semComentario(ler(join(SHELL, 'JanelaDeModulo.tsx')));
const css = ler(join('src', 'components', 'erp', 'tokens.css'));

describe('janela de módulo · o que ela mostra', () => {
  it('o piloto é Rede e Equipe: as abas são as telas do menu, na ordem do menu, sem Integrações', () => {
    expect(AREA_DA_JANELA).toBe('rede');
    expect([...TELAS_DA_JANELA]).toEqual(['lojas', 'equipe', 'historico']);
    const area = areaDaJanela(BASE);
    const doMenu = modulosDoParceiro(ALCANCE_FLOWFOODS, BASE, TODOS_OS_MODULOS_COM_LIBERACAO).find((m) => m.chave === 'rede')!;
    expect(area).toMatchObject({ nome: doMenu.nome, icone: doMenu.icone, cor: doMenu.cor });
    const itens = doMenu.grupos.flatMap((g) => g.itens).map(({ href, rotulo }) => ({ href, rotulo }));
    // As mesmas telas do menu (nome e endereço), na ordem dele. Integrações, que só leva à Central, saiu de Rede e Equipe
    // (decisão 539: é área própria) e continua fora da janela.
    expect(area.abas).toEqual(itens.filter((i) => TELAS_DA_JANELA.some((t) => i.href === `${BASE}/${t}`)));
    expect(area.abas.map((a) => a.href)).toEqual([`${BASE}/lojas`, `${BASE}/equipe`, `${BASE}/historico`]);
    expect(itens.some((i) => i.href === `${BASE}/integracoes`)).toBe(false);
    expect(area.abas.some((a) => a.href.endsWith('/integracoes'))).toBe(false);
  });
});

describe('janela de módulo · endereços', () => {
  it('reconhece as telas da janela de qualquer parceiro, só no caminho exato', () => {
    expect(caminhoDe('/a/b?x=1#c')).toBe('/a/b');
    expect(telaDaJanela(`${BASE}/equipe`)).toEqual({ base: BASE, tela: 'equipe' });
    expect(telaDaJanela(`${BASE}/equipe?ver=perfis`)).toEqual({ base: BASE, tela: 'equipe' });
    expect(telaDaJanela('/rodolfo/erp/beta/historico')).toEqual({ base: '/rodolfo/erp/beta', tela: 'historico' });
    for (const fora of [BASE, `${BASE}/integracoes`, `${BASE}/equipe/1`, '/erp/lojas', '/rodolfo/lojas', `${BASE}/lojas/`]) expect(telaDaJanela(fora), fora).toBeNull();
    expect(ehDaJanela(`${BASE}/lojas`, BASE)).toBe(true);
    expect(ehDaJanela('/rodolfo/erp/beta/lojas', BASE)).toBe(false);
  });

  it('a tela aberta vem do segmento interceptado; a página de trás, dos segmentos do conteúdo (sem grupos de rota)', () => {
    expect(telaAbertaNaJanela(['(rede)', '(.)equipe'])).toBe('equipe');
    expect(telaAbertaNaJanela([])).toBeNull();
    expect(telaAbertaNaJanela(['dre'])).toBeNull();
    expect(telaAbertaNaJanela(['(rede)', '(.)integracoes'])).toBeNull();
    expect(caminhoDoFundo(BASE, [])).toBe(BASE);
    expect(caminhoDoFundo(BASE, ['dre'])).toBe(`${BASE}/dre`);
    expect(caminhoDoFundo(BASE, ['(grupo)', 'fichas', 'f1'])).toBe(`${BASE}/fichas/f1`);
  });

  it('vira tela inteira: página de trás que já é uma tela da janela, ou destino de outro parceiro; o resto abre na janela', () => {
    // Do hub ou de outra tela do parceiro: abre na janela.
    expect(destinoViraTelaInteira(`${BASE}/equipe`, BASE, [])).toBe(false);
    expect(destinoViraTelaInteira(`${BASE}/historico?entidade=x`, BASE, ['dre'])).toBe(false);
    // Da tela inteira de uma tela da janela (link direto, recarga, endereço antigo): para a mesma com filtro ou para outra.
    expect(destinoViraTelaInteira(`${BASE}/equipe?ver=perfis`, BASE, ['equipe'])).toBe(true);
    expect(destinoViraTelaInteira(`${BASE}/lojas`, BASE, ['historico'])).toBe(true);
    // Outro parceiro: a interceptação guardaria o parceiro de trás.
    expect(destinoViraTelaInteira('/rodolfo/erp/beta/lojas', BASE, [])).toBe(true);
    // O que não é tela da janela não muda.
    expect(destinoViraTelaInteira(`${BASE}/dre`, BASE, ['equipe'])).toBe(false);
    expect(destinoViraTelaInteira('/erp/lojas', BASE, ['equipe'])).toBe(false);
  });

  it('o shell descreve a página de trás enquanto a janela está aberta; sem janela, o endereço', () => {
    expect(fundoDaJanelaNoShell(`${BASE}/lojas`, ['erp', 'alfa'])).toBe(BASE);
    expect(fundoDaJanelaNoShell(`${BASE}/equipe`, ['erp', 'alfa', 'dre'])).toBe(`${BASE}/dre`);
    // Tela inteira (o conteúdo é a própria tela): sem janela.
    expect(fundoDaJanelaNoShell(`${BASE}/equipe`, ['erp', 'alfa', 'equipe'])).toBeNull();
    // Endereço que não é da janela, ou segmentos que não são do parceiro do endereço: nada muda.
    expect(fundoDaJanelaNoShell(`${BASE}/dre`, ['erp', 'alfa'])).toBeNull();
    expect(fundoDaJanelaNoShell(`${BASE}/lojas`, ['erp', 'beta'])).toBeNull();
    expect(fundoDaJanelaNoShell(`${BASE}/lojas`, ['inbox'])).toBeNull();
    expect(fundoDaJanelaNoShell('/erp/lojas', ['lojas'])).toBeNull();
  });

  it('a pilha do Voltar: novo empilha, o penúltimo desempilha, o mesmo não conta, com limite', () => {
    const a = `${BASE}/lojas`;
    const b = `${BASE}/equipe`;
    const c = `${BASE}/historico?entidade=x`;
    expect(proximaPilha([], a)).toEqual([a]);
    const mesma = [a];
    expect(proximaPilha(mesma, a)).toBe(mesma);
    expect(proximaPilha([a], b)).toEqual([a, b]);
    expect(proximaPilha([a, b], c)).toEqual([a, b, c]);
    expect(proximaPilha([a, b, c], b)).toEqual([a, b]);
    expect(proximaPilha([a, b], a)).toEqual([a]);
    let longa: string[] = [];
    for (let i = 0; i < PASSOS_MAXIMOS_AO_FECHAR + 10; i++) longa = proximaPilha(longa, `${a}?p=${i}`);
    expect(longa).toHaveLength(PASSOS_MAXIMOS_AO_FECHAR);
    expect(longa.at(-1)).toBe(`${a}?p=${PASSOS_MAXIMOS_AO_FECHAR + 9}`);
  });
});

describe('janela de módulo · rascunho', () => {
  const texto = (value: string, defaultValue = '', extra: Partial<CampoDoRascunho> = {}): CampoDoRascunho => ({ tagName: 'INPUT', type: 'text', value, defaultValue, ...extra });
  const marca = (checked: boolean, defaultChecked: boolean): CampoDoRascunho => ({ tagName: 'INPUT', type: 'checkbox', checked, defaultChecked });
  const escolha = (selectedIndex: number, padrao: number | null, n = 3): CampoDoRascunho => ({
    tagName: 'SELECT',
    selectedIndex,
    options: Array.from({ length: n }, (_, i) => ({ selected: i === selectedIndex, defaultSelected: i === padrao })),
  });

  it('conta o formulário que grava; busca, filtro e campo solto não', () => {
    expect(contaComoRascunho(null)).toBe(false);
    expect(contaComoRascunho({ metodo: null, papel: null, filtro: false })).toBe(true);
    expect(contaComoRascunho({ metodo: 'post', papel: null, filtro: false })).toBe(true);
    expect(contaComoRascunho({ metodo: 'GET', papel: null, filtro: false })).toBe(false);
    expect(contaComoRascunho({ metodo: ' get ', papel: null, filtro: false })).toBe(false);
    expect(contaComoRascunho({ metodo: null, papel: 'search', filtro: false })).toBe(false);
    expect(contaComoRascunho({ metodo: null, papel: null, filtro: true })).toBe(false);
  });

  it('campo alterado é o que difere do que a tela desenhou; oculto, botão, desligado e filtro não contam', () => {
    expect(campoAlterado(texto('', ''))).toBe(false);
    expect(campoAlterado(texto('Loja nova', ''))).toBe(true);
    expect(campoAlterado(texto('12.345', '12.345'))).toBe(false);
    expect(campoAlterado({ tagName: 'TEXTAREA', value: 'x', defaultValue: '' })).toBe(true);
    expect(campoAlterado(marca(true, false))).toBe(true);
    expect(campoAlterado(marca(false, false))).toBe(false);
    expect(campoAlterado({ tagName: 'INPUT', type: 'radio', checked: false, defaultChecked: true })).toBe(true);
    expect(campoAlterado({ tagName: 'INPUT', type: 'file', files: { length: 1 } })).toBe(true);
    expect(campoAlterado({ tagName: 'INPUT', type: 'file', files: { length: 0 } })).toBe(false);
    // Escolha única sem `selected` no HTML: a primeira opção é a desenhada.
    expect(campoAlterado(escolha(0, null))).toBe(false);
    expect(campoAlterado(escolha(2, null))).toBe(true);
    expect(campoAlterado(escolha(1, 1))).toBe(false);
    expect(campoAlterado({ ...escolha(0, null), multiple: true, options: [{ selected: true, defaultSelected: false }] })).toBe(true);
    for (const tipo of ['hidden', 'submit', 'button', 'reset', 'image']) expect(campoAlterado(texto('a', 'b', { type: tipo })), tipo).toBe(false);
    expect(campoAlterado(texto('a', '', { disabled: true }))).toBe(false);
    expect(campoAlterado(texto('a', '', { hasAttribute: (n) => n === 'data-filtro' }))).toBe(false);
    expect(campoAlterado({ tagName: 'BUTTON', value: 'a', defaultValue: '' })).toBe(false);
  });

  it('cada formulário conta sozinho: o enviado sem erro sai da conta; com erro na tela ou mudado depois, volta', () => {
    const campos = [texto('Loja nova', ''), marca(true, false)];
    const enviado = fotografiaDosCampos(campos);
    expect(formularioComRascunho({ campos, enviado: null, comErro: false })).toBe(true);
    // Enviado assim e sem erro: entregue (a tela redesenha com o valor salvo, ou mostra o erro, que rearma).
    expect(formularioComRascunho({ campos, enviado, comErro: false })).toBe(false);
    expect(formularioComRascunho({ campos, enviado, comErro: true })).toBe(true);
    // Mudou depois do envio: volta a contar.
    const depois = [texto('Loja nova 2', ''), marca(true, false)];
    expect(formularioComRascunho({ campos: depois, enviado, comErro: false })).toBe(true);
    // Nada diferente do desenhado (salvo e redesenhado, ou apagado): nunca conta, nem com erro antigo na tela.
    expect(formularioComRascunho({ campos: [texto('', '')], enviado: null, comErro: true })).toBe(false);
  });

  it('a fotografia muda com texto, marcação, escolha e arquivo', () => {
    const base = fotografiaDosCampos([texto('a'), marca(false, false), escolha(0, null)]);
    expect(fotografiaDosCampos([texto('b'), marca(false, false), escolha(0, null)])).not.toBe(base);
    expect(fotografiaDosCampos([texto('a'), marca(true, false), escolha(0, null)])).not.toBe(base);
    expect(fotografiaDosCampos([texto('a'), marca(false, false), escolha(1, null)])).not.toBe(base);
    expect(fotografiaDosCampos([texto('a'), marca(false, false), escolha(0, null)])).toBe(base);
  });
});

describe('janela de módulo · rotas', () => {
  it('o espaço da janela tem só as interceptações do piloto, o quadro, os limites de erro e as rotas vazias', () => {
    const lista = arquivos(ESPACO).map((f) => relative(ESPACO, f).replace(/\\/g, '/')).sort();
    expect(lista).toEqual(
      [
        '(rede)/(.)equipe/page.tsx',
        '(rede)/(.)historico/page.tsx',
        '(rede)/(.)lojas/page.tsx',
        '(rede)/error.tsx',
        '(rede)/layout.tsx',
        '(rede)/loading.tsx',
        '[...rota]/page.tsx',
        'default.tsx',
        'error.tsx',
        'page.tsx',
      ].sort(),
    );
  });

  it('cada interceptação reexporta a MESMA página da rota, que existe e confere o parceiro no servidor', () => {
    for (const tela of TELAS_DA_JANELA) {
      const t = ler(join(ESPACO, '(rede)', `(.)${tela}`, 'page.tsx'));
      expect(semComentario(t)).toBe(
        `export { default } from '@/app/rodolfo/(painel)/erp/[slug]/${tela}/page';\n\nexport const dynamic = 'force-dynamic';`,
      );
      const pagina = ler(join(NIVEL1, tela, 'page.tsx'));
      expect(pagina).toMatch(/export default async function/);
      expect(pagina).toMatch(/exigirParceiro\(/);
    }
  });

  it('as rotas vazias não desenham nem consultam nada: sair da janela para o hub ou outra tela fecha a janela', () => {
    for (const f of ['default.tsx', 'page.tsx', join('[...rota]', 'page.tsx')]) expect(semComentario(ler(join(ESPACO, f))), f).toMatch(ROTA_VAZIA);
  });

  it('o conteúdo do parceiro tem default "não encontrada": o Next exige, porque a rota vazia da janela cobre toda URL', () => {
    // Estrutura de rotas estrita do Next 16: cada URL coberta por um espaço precisa de página ou default nos outros. Na carga
    // direta de um endereço inexistente, "não encontrada", como antes; na navegação suave, ver os Limites da decisão 526.
    expect(semComentario(ler(join(NIVEL1, 'default.tsx')))).toBe(
      "import { notFound } from 'next/navigation';\n\nexport default function SemPaginaNoParceiro() {\n  notFound();\n}",
    );
  });

  it('o quadro confere o parceiro, usa o contexto do topo e leva o aviso de situação; a moldura fica fora da pilha', () => {
    const quadro = ler(join(ESPACO, '(rede)', 'layout.tsx'));
    expect(quadro).toMatch(/await exigirParceiro\(slug\)/);
    expect(quadro).toMatch(/await visaoDaRequisicao\(ctx\)/);
    expect(quadro).toMatch(/rotuloDoEscopo\(visao\.tipo === 'loja' \? visao\.nome : null, ctx\.parceiro\.nome\)/);
    expect(quadro).toMatch(/const base = `\/rodolfo\/erp\/\$\{ctx\.parceiro\.slug\}`;/);
    expect(quadro).toMatch(/aviso=\{ctx\.bloqueio \? <AvisoDoParceiro status=\{ctx\.parceiro\.status\} bloqueio=\{ctx\.bloqueio\} \/> : null\}/);
    const layout = ler(join(NIVEL1, 'layout.tsx'));
    expect(layout).toMatch(/janela: React\.ReactNode;/);
    expect(layout).toMatch(/<AvisoDoParceiro status=\{parceiro\.status\} bloqueio=\{bloqueio\} \/>/);
    expect(layout).toMatch(/\{children\}\s*<\/div>\s*<MolduraDaJanela base=\{`\/rodolfo\/erp\/\$\{parceiro\.slug\}`\}>\{janela\}<\/MolduraDaJanela>\s*<\/>/);
  });

  it('carregando e erro aparecem na janela; "Tentar de novo" busca de novo (retry); nada do servidor é mostrado', () => {
    expect(ler(join(ESPACO, '(rede)', 'loading.tsx'))).toMatch(/role="status"[\s\S]*Carregando a tela\./);
    for (const f of [join('(rede)', 'error.tsx'), 'error.tsx']) {
      const erro = semComentario(ler(join(ESPACO, f)));
      expect(erro, f).toMatch(/onClick=\{\(\) => retry\(\)\}[\s\S]*Tentar de novo/);
      expect(erro, f).not.toMatch(/\breset\b|error\.message|digest/);
    }
    // O erro antes do quadro aparece como janela pequena, com Fechar de volta à página de trás.
    const doEspaco = ler(join(ESPACO, 'error.tsx'));
    expect(doEspaco).toMatch(/el\.showModal\(\)/);
    expect(doEspaco).toMatch(/onClick=\{\(\) => router\.back\(\)\}[\s\S]*Fechar/);
  });

  it('o /erp dos parceiros não tem janela: nenhum espaço paralelo nem interceptação', () => {
    const nomes = pastas(join('src', 'app', 'erp'));
    expect(nomes.filter((n) => n.startsWith('@') || /^\(\.{1,3}\)/.test(n))).toEqual([]);
  });
});

describe('janela de módulo · o quadro', () => {
  const html = renderToStaticMarkup(
    createElement(
      JanelaDeModulo,
      // O conteúdo vai como filho do createElement (não como propriedade); o tipo pede `children`, que ele preenche.
      { base: BASE, area: areaDaJanela(BASE), contexto: 'Alfa · Rede Completa', aviso: createElement('p', { 'data-aviso': '' }, 'Parceiro suspenso.') } as Parameters<typeof JanelaDeModulo>[0],
      createElement('h1', null, 'Lojas e marcas'),
    ),
  );
  const atributo = (tag: string, nome: string) => new RegExp(`${nome}="([^"]*)"`).exec(tag)?.[1];
  const dialogo = /<dialog\b[^>]*>/.exec(html)![0];

  it('diálogo do kit; o nome diz a área e a tela; o contexto descreve; o nome da janela recebe o foco ao abrir', () => {
    expect(atributo(dialogo, 'class')).toBe('ff-dialogo ff-janela');
    expect(atributo(dialogo, 'aria-label')).toBe('Rede e Equipe: Lojas e marcas');
    expect(new RegExp(`<p id="${atributo(dialogo, 'aria-describedby')}"[^>]*>([^<]*)</p>`).exec(html)?.[1]).toBe('Alfa · Rede Completa');
    // O nome da janela não é título de seção: o primeiro título dentro dela é o h1 da tela.
    const nome = /<p[^>]*data-ff-titulo="true"[^>]*>([^<]*)<\/p>/.exec(html)!;
    expect(nome[1]).toBe('Rede e Equipe');
    expect(nome[0]).toMatch(/tabindex="-1"/);
    expect(/<h[1-6]\b[^>]*>([^<]*)/.exec(html)?.[1]).toBe('Lojas e marcas');
    expect(atributo(dialogo, 'data-passos')).toBe('0');
  });

  it('botões com nome fixo e alvo de 44 px; Voltar desligado ao abrir; Expandir com estado e fora do celular', () => {
    const botoes = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(botoes.map((b) => atributo(b, 'aria-label'))).toEqual(['Voltar', 'Minimizar', 'Expandir', 'Fechar']);
    for (const b of botoes) expect(atributo(b, 'class')).toMatch(/\bh-11 w-11\b/);
    expect(botoes[0]).toMatch(/disabled=""/);
    expect(atributo(botoes[2], 'aria-pressed')).toBe('false');
    expect(atributo(botoes[2], 'class')).toMatch(/max-\[699px\]:hidden/);
  });

  it('abas da área com a atual marcada, num trilho que rola; o aviso e a tela no corpo; sem pergunta nem botão de reabrir', () => {
    expect(html).toMatch(/<nav aria-label="Seções de Rede e Equipe" class="[^"]*\boverflow-x-auto\b/);
    expect(html).toMatch(/<ul class="flex w-max min-w-full gap-1 px-3">/);
    const abas = [...html.matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)];
    expect(abas.map((a) => [atributo(a[0], 'href'), a[1]])).toEqual([
      [`${BASE}/lojas`, 'Lojas e marcas'],
      [`${BASE}/equipe`, 'Equipe'],
      [`${BASE}/historico`, 'Histórico'],
    ]);
    expect(abas.filter((a) => atributo(a[0], 'aria-current') === 'page').map((a) => a[1])).toEqual(['Lojas e marcas']);
    expect(html).toMatch(/<div class="ff-janela-corpo[^"]*"><div class="mb-5"><p data-aviso="">Parceiro suspenso\.<\/p><\/div><h1>Lojas e marcas<\/h1><\/div>/);
    expect(html).not.toMatch(/role="alert"|ff-janela-minimizada/);
  });
});

describe('janela de módulo · regras que o roteiro de navegador exercita', () => {
  it('a janela não mexe no estilo do body (o Dialogo do kit guarda e devolve esse valor): a trava é de CSS', () => {
    expect(componente).not.toMatch(/document\.body\.style/);
    const trava = css.slice(css.indexOf('html:has(.ff-app dialog.ff-janela[open]) {'));
    expect(trava.slice(0, trava.indexOf('}'))).toMatch(/overflow:\s*hidden/);
  });

  it('fechamento pelo próprio navegador vira minimizar; âncora rola sem histórico; sair do site avisa com returnValue', () => {
    expect(componente).toMatch(/onClose=\{\(e\) => \{\s*if \(fechando\.current \|\| minimizadaAgora\.current \|\| e\.currentTarget\.open\) return;\s*minimizar\(\);/);
    expect(componente).toMatch(/if \(href\.startsWith\('#'\)\) \{[\s\S]*?e\.preventDefault\(\);\s*irParaAncora\(href\.slice\(1\)\);/);
    expect(componente).toMatch(/e\.preventDefault\(\);\s*e\.returnValue = '';/);
  });

  it('o conteúdo não depende de estar minimizada (só o diálogo fecha); trocar de tela substitui o endereço', () => {
    expect(componente.match(/\{children\}/g)).toEqual(['{children}']);
    // O corpo da janela é sempre o aviso e a tela, sem condição em volta (o comentário de dentro vira `{}` sem comentários).
    expect(componente).toMatch(
      /<div ref=\{corpo\} className="ff-janela-corpo [^"]*">\s*\{aviso && <div className="mb-5">\{aviso\}<\/div>\}\s*(\{\}\s*)?<ContextoDaCaixa\.Provider value=\{null\}>\{children\}<\/ContextoDaCaixa\.Provider>\s*<\/div>/,
    );
    expect(componente).toMatch(/if \(ehDaJanela\(destino\.pathname, base\)\) router\.replace\(alvo, \{ scroll: false \}\);\s*else router\.push\(alvo\);/);
    expect(componente).toMatch(/<Link\s+href=\{a\.href\}\s+replace\s+scroll=\{false\}/);
  });

  it('o botão de reabrir mora na barra do topo e, abaixo de 1440 px, no alto do conteúdo; o shell tem os dois lugares', () => {
    expect(ID_DA_JANELA_NA_BARRA).toBe('ff-janela-na-barra');
    expect(ID_DA_JANELA_NO_CONTEUDO).toBe('ff-janela-no-conteudo');
    const shell = ler(join(SHELL, 'Shell.tsx'));
    // A partir de 1440 px, na barra; abaixo, no alto do conteúdo, no fluxo (presa, cobriria as barras que as telas prendem).
    // O lugar na barra usa a MESMA consulta de largura da faixa (min-width 1440 px): nunca os dois juntos em largura
    // fracionária. E não encolhe abaixo do mínimo do botão: quem cede é a trilha.
    expect(shell).toMatch(/<div id=\{ID_DA_JANELA_NA_BARRA\} className="hidden min-w-\[60px\] items-center empty:hidden has-\[\[data-ponto\]\]:min-w-\[76px\] min-\[1440px\]:flex" \/>/);
    expect(shell).toMatch(/<div id=\{ID_DA_JANELA_NO_CONTEUDO\} className="-mx-4 -mt-6 mb-4 empty:hidden sm:-mx-6 lg:-mx-8 min-\[1440px\]:hidden" \/>/);
    // Na barra, o botão não encolhe abaixo do próprio conteúdo com o recuo: 60 px só com o ícone, 76 px com o ponto.
    expect(componente).toMatch(/\$\{sujaAoMinimizar \? 'min-w-\[76px\]' : 'min-w-\[60px\]'\}/);
    expect(componente).toMatch(/<span aria-hidden data-ponto className="h-2 w-2 shrink-0 rounded-full bg-atencao" \/>/);
    expect(componente).toMatch(/createPortal\(botaoNaBarra\(false\), lugares\.barra\)\}\{createPortal\(botaoNoConteudo, lugares\.conteudo\)/);
  });

  it('o shell descreve a página de trás (trilha, menu, ajuda, Voltar); a gaveta fecha pelo endereço', () => {
    const shell = ler(join(SHELL, 'Shell.tsx'));
    expect(shell.match(/useCaminhoDaPagina\(\)/g)).toHaveLength(2);
    expect(shell).toMatch(/const endereco = usePathname\(\);[\s\S]*setGaveta\(false\);\s*setAjudaAberta\(false\);\s*\}, \[endereco\]\);/);
    expect(ler(join(SHELL, 'VoltarDaNavegacao.tsx'))).toMatch(/const caminho = useCaminhoDaPagina\(\);/);
  });
});

describe('janela de módulo · estilo', () => {
  const regra = (seletor: string) => {
    const i = css.indexOf(`${seletor} {`);
    if (i < 0) throw new Error(`regra não encontrada: ${seletor}`);
    return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  };

  it('larga para tabela e formulário, expandida ocupa a tela, no celular é a tela toda (com ou sem Expandir)', () => {
    const janela = regra('.ff-app dialog.ff-janela');
    expect(janela).toMatch(/width:\s*min\(1040px, calc\(100vw - 48px\)\)/);
    expect(janela).toMatch(/height:\s*min\(88dvh, 920px\)/);
    expect(janela).toMatch(/overflow:\s*hidden/);
    const cheia = regra(".ff-app dialog.ff-janela[data-cheia='true']");
    expect(cheia).toMatch(/width:\s*calc\(100vw - 16px\)/);
    expect(cheia).toMatch(/height:\s*calc\(100dvh - 16px\)/);
    const inicio = css.indexOf("@media (max-width: 699px) {\n  .ff-app dialog.ff-janela,\n  .ff-app dialog.ff-janela[data-cheia='true'] {");
    expect(inicio).toBeGreaterThan(css.indexOf(".ff-app dialog.ff-janela[data-cheia='true'] {"));
    const celular = css.slice(inicio);
    expect(celular.slice(0, celular.indexOf('}'))).toMatch(/margin:\s*0;[\s\S]*width:\s*100vw;[\s\S]*height:\s*100dvh;[\s\S]*border-radius:\s*0;/);
  });

  it('a entrada, o fundo de bloqueio e o movimento reduzido vêm do diálogo do kit', () => {
    expect(regra('.ff-app dialog.ff-dialogo[open]')).toMatch(/animation:\s*ff-camada var\(--ff-movimento\) var\(--ff-curva-entrada\)/);
    expect(regra('.ff-app dialog.ff-dialogo::backdrop')).toMatch(/animation:\s*ff-fundo/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.ff-app dialog::backdrop \{[\s\S]*animation: none !important;/);
  });
});
