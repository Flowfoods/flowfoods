/**
 * Janela de módulo (UX-MOD-2, piloto do nível 1, decisão 526) — sem banco e sem navegador:
 *
 * - o que a janela mostra sai do menu (nunca diverge dele); o piloto é só Rede e Equipe, só no nível 1;
 * - as rotas: o espaço `@janela` só intercepta páginas que existem, reexportando a MESMA página (as mesmas conferências de
 *   acesso); as rotas vazias fecham a janela ao sair dela; o /erp dos parceiros não tem janela;
 * - o quadro: nome acessível, contexto, botões, abas com a atual marcada, Voltar desligado ao abrir;
 * - a regra do rascunho e os comportamentos que só o navegador exercita (provados no roteiro local) estão no código;
 * - o estilo: tamanho, tela inteira no celular, a entrada e o fundo do diálogo do kit.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/rodolfo/erp/alfa/lojas',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ back: () => {}, push: () => {}, refresh: () => {} }),
}));

import { AREA_DA_JANELA, areaDaJanela, contaComoRascunho, PASSOS_MAXIMOS_AO_FECHAR, TELAS_DA_JANELA } from '@/lib/erp/janela';
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
const componente = ler(join('src', 'components', 'erp', 'shell', 'JanelaDeModulo.tsx'));
const css = ler(join('src', 'components', 'erp', 'tokens.css'));

describe('janela de módulo · o que ela mostra', () => {
  it('o piloto é Rede e Equipe: as abas são as telas do menu, na ordem do menu, sem Integrações', () => {
    expect(AREA_DA_JANELA).toBe('rede');
    expect([...TELAS_DA_JANELA]).toEqual(['lojas', 'equipe', 'historico']);
    const area = areaDaJanela(BASE);
    const doMenu = modulosDoParceiro(ALCANCE_FLOWFOODS, BASE, TODOS_OS_MODULOS_COM_LIBERACAO).find((m) => m.chave === 'rede')!;
    expect(area).toMatchObject({ nome: doMenu.nome, icone: doMenu.icone, cor: doMenu.cor });
    const itens = doMenu.grupos.flatMap((g) => g.itens).map(({ href, rotulo }) => ({ href, rotulo }));
    // As mesmas telas do menu (nome e endereço), na ordem dele; Integrações só leva à Central, então fica fora da janela.
    expect(area.abas).toEqual(itens.filter((i) => TELAS_DA_JANELA.some((t) => i.href === `${BASE}/${t}`)));
    expect(area.abas.map((a) => a.href)).toEqual([`${BASE}/lojas`, `${BASE}/equipe`, `${BASE}/historico`]);
    expect(itens.some((i) => i.href === `${BASE}/integracoes`)).toBe(true);
    expect(area.abas.some((a) => a.href.endsWith('/integracoes'))).toBe(false);
  });
});

describe('janela de módulo · rotas', () => {
  it('o espaço da janela tem só as interceptações do piloto, o quadro e as rotas vazias', () => {
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
    // Estrutura de rotas estrita do Next 16: cada URL coberta por um espaço precisa de página ou default nos outros. As URLs
    // do parceiro sem página são rotas de arquivo (respondem antes do layout) ou não existem; "não encontrada", como antes.
    expect(semComentario(ler(join(NIVEL1, 'default.tsx')))).toBe(
      "import { notFound } from 'next/navigation';\n\nexport default function SemPaginaNoParceiro() {\n  notFound();\n}",
    );
  });

  it('o quadro confere o parceiro e usa o contexto do topo; o layout do parceiro põe a janela fora da pilha com margem', () => {
    const quadro = ler(join(ESPACO, '(rede)', 'layout.tsx'));
    expect(quadro).toMatch(/await exigirParceiro\(slug\)/);
    expect(quadro).toMatch(/await visaoDaRequisicao\(ctx\)/);
    expect(quadro).toMatch(/rotuloDoEscopo\(visao\.tipo === 'loja' \? visao\.nome : null, ctx\.parceiro\.nome\)/);
    expect(quadro).toMatch(/<JanelaDeModulo area=\{areaDaJanela\(`\/rodolfo\/erp\/\$\{ctx\.parceiro\.slug\}`\)\} contexto=\{contexto\}>/);
    const layout = ler(join(NIVEL1, 'layout.tsx'));
    expect(layout).toMatch(/janela: React\.ReactNode;/);
    expect(layout).toMatch(/\{children\}\s*<\/div>\s*\{janela\}\s*<\/>/);
    // Carregando e erro aparecem DENTRO da janela, sem números inventados e sem detalhe do servidor.
    expect(ler(join(ESPACO, '(rede)', 'loading.tsx'))).toMatch(/role="status"[\s\S]*Carregando a tela\./);
    const erro = ler(join(ESPACO, '(rede)', 'error.tsx'));
    expect(erro).toMatch(/Tentar de novo/);
    expect(erro).not.toMatch(/error\.message|digest\}/);
  });

  it('o /erp dos parceiros não tem janela: nenhum espaço paralelo nem interceptação', () => {
    const nomes = pastas(join('src', 'app', 'erp'));
    expect(nomes.filter((n) => n.startsWith('@') || /^\(\.{1,3}\)/.test(n))).toEqual([]);
  });
});

describe('janela de módulo · o quadro', () => {
  const html = renderToStaticMarkup(
    createElement(JanelaDeModulo, { area: areaDaJanela(BASE), contexto: 'Alfa · Rede Completa', children: createElement('h1', null, 'Lojas e marcas') }),
  );
  const atributo = (tag: string, nome: string) => new RegExp(`${nome}="([^"]*)"`).exec(tag)?.[1];
  const dialogo = /<dialog\b[^>]*>/.exec(html)![0];

  it('diálogo do kit com nome e contexto acessíveis; foco no título ao abrir', () => {
    expect(atributo(dialogo, 'class')).toBe('ff-dialogo ff-janela');
    const titulo = new RegExp(`<h2 id="${atributo(dialogo, 'aria-labelledby')}"[^>]*>([^<]*)</h2>`).exec(html)!;
    expect(titulo[1]).toBe('Rede e Equipe');
    expect(titulo[0]).toMatch(/data-ff-titulo="true"/);
    expect(titulo[0]).toMatch(/tabindex="-1"/);
    expect(new RegExp(`<p id="${atributo(dialogo, 'aria-describedby')}"[^>]*>([^<]*)</p>`).exec(html)?.[1]).toBe('Alfa · Rede Completa');
    expect(atributo(dialogo, 'data-passos')).toBe('0');
  });

  it('botões com nome, alvo de 44 px; Voltar desligado ao abrir; Expandir some no celular', () => {
    const botoes = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(botoes.map((b) => atributo(b, 'aria-label'))).toEqual(['Voltar', 'Minimizar', 'Expandir', 'Fechar']);
    for (const b of botoes) expect(atributo(b, 'class')).toMatch(/\bh-11 w-11\b/);
    expect(botoes[0]).toMatch(/disabled=""/);
    expect(atributo(botoes[2], 'aria-pressed')).toBe('false');
    expect(atributo(botoes[2], 'class')).toMatch(/max-\[699px\]:hidden/);
  });

  it('abas da área com a atual marcada; o conteúdo da tela no corpo; sem pergunta nem botão de reabrir ao abrir', () => {
    expect(html).toMatch(/<nav aria-label="Seções de Rede e Equipe"/);
    const abas = [...html.matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)];
    expect(abas.map((a) => [atributo(a[0], 'href'), a[1]])).toEqual([
      [`${BASE}/lojas`, 'Lojas e marcas'],
      [`${BASE}/equipe`, 'Equipe'],
      [`${BASE}/historico`, 'Histórico'],
    ]);
    expect(abas.filter((a) => atributo(a[0], 'aria-current') === 'page').map((a) => a[1])).toEqual(['Lojas e marcas']);
    expect(html).toMatch(/<div class="ff-janela-corpo[^"]*"><h1>Lojas e marcas<\/h1><\/div>/);
    expect(html).not.toMatch(/role="alert"|ff-janela-minimizada/);
  });
});

describe('janela de módulo · rascunho e comportamento', () => {
  it('conta como rascunho o campo de formulário que grava; busca, filtro e campo solto não', () => {
    expect(contaComoRascunho(null)).toBe(false);
    expect(contaComoRascunho({ metodo: null, papel: null, filtro: false })).toBe(true);
    expect(contaComoRascunho({ metodo: 'post', papel: null, filtro: false })).toBe(true);
    expect(contaComoRascunho({ metodo: 'GET', papel: null, filtro: false })).toBe(false);
    expect(contaComoRascunho({ metodo: ' get ', papel: null, filtro: false })).toBe(false);
    expect(contaComoRascunho({ metodo: null, papel: 'search', filtro: false })).toBe(false);
    expect(contaComoRascunho({ metodo: null, papel: null, filtro: true })).toBe(false);
  });

  it('Escape e toque no fundo pedem para fechar; com rascunho, perguntam antes, na própria janela', () => {
    expect(componente).toMatch(/onCancel=\{\(e\) => \{\s*e\.preventDefault\(\);\s*if \(pedido\) setPedido\(null\);\s*else pedir\(\{ tipo: 'fechar' \}\);/);
    expect(componente).toMatch(/if \(e\.target === e\.currentTarget && !pedido\) pedir\(\{ tipo: 'fechar' \}\)/);
    expect(componente).toMatch(/function pedir\(p: Pedido\) \{\s*if \(sujo\) setPedido\(p\);\s*else concluir\(p\);/);
    expect(componente).toMatch(/Continuar editando/);
    // Links dentro da janela com rascunho também perguntam; clique com modificador, outra aba, download ou fora do site não.
    expect(componente).toMatch(/evento\.button !== 0 \|\| evento\.metaKey \|\| evento\.ctrlKey \|\| evento\.shiftKey \|\| evento\.altKey/);
    expect(componente).toMatch(/a\.target && a\.target !== '_self'/);
    expect(componente).toMatch(/a\.hasAttribute\('download'\)/);
    expect(componente).toMatch(/!href\.startsWith\('\/'\) \|\| href\.startsWith\('\/\/'\)/);
  });

  it('Fechar volta o histórico até a página de trás, com limite; Voltar desfaz um passo; a contagem não erra', () => {
    expect(PASSOS_MAXIMOS_AO_FECHAR).toBe(50);
    expect(componente).toMatch(/fechando\.current = 1;\s*ref\.current\?\.close\(\);\s*router\.back\(\);/);
    expect(componente).toMatch(/if \(fechando\.current < PASSOS_MAXIMOS_AO_FECHAR\) \{\s*fechando\.current \+= 1;\s*router\.back\(\);/);
    // Mesmo endereço (efeito repetido) e o instante de carregamento antes do endereço mudar não contam como passo.
    expect(componente).toMatch(/if \(anterior === null \|\| anterior === endereco\) return;/);
    expect(componente).toMatch(/if \(!area\.abas\.some\(\(a\) => a\.href === anterior\.split\('\?'\)\[0\]\)\) return;/);
    // O marcador de Voltar é lido ANTES do atualizador (que roda depois, já com o marcador zerado).
    expect(componente).toMatch(/const voltou = voltando\.current;\s*voltando\.current = false;\s*setPassos\(\(p\) => \(voltou \? Math\.max\(0, p - 1\) : p \+ 1\)\);/);
  });

  it('minimizar guarda tudo; com rascunho, um link da página de trás ou sair do site pergunta antes', () => {
    // O conteúdo nunca depende de estar minimizada: o diálogo só fecha, nada desmonta.
    expect(componente).not.toMatch(/minimizada \?[^:]*\{children\}|!minimizada && [^)]*children/);
    expect(componente).toMatch(/if \(minimizada && el\.open\) \{\s*el\.close\(\);/);
    expect(componente).toMatch(/if \(!minimizada \|\| !sujo\) return;[\s\S]*?document\.addEventListener\('click', interceptar, true\)/);
    expect(componente).toMatch(/window\.addEventListener\('beforeunload', avisar\)/);
    // O botão de reabrir: alvo de 44 px, acima do conteúdo (z-40), dentro da tela.
    expect(componente).toMatch(/ff-janela-minimizada[^"]*fixed bottom-3 right-3 z-40[^"]*min-h-11 max-w-\[calc\(100vw-24px\)\]/);
  });
});

describe('janela de módulo · estilo', () => {
  const regra = (seletor: string) => {
    const i = css.indexOf(`${seletor} {`);
    if (i < 0) throw new Error(`regra não encontrada: ${seletor}`);
    return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  };

  it('larga para tabela e formulário, expandida ocupa a tela, no celular é a tela toda', () => {
    const janela = regra('.ff-app dialog.ff-janela');
    expect(janela).toMatch(/width:\s*min\(1040px, calc\(100vw - 48px\)\)/);
    expect(janela).toMatch(/height:\s*min\(88dvh, 920px\)/);
    expect(janela).toMatch(/overflow:\s*hidden/);
    const cheia = regra(".ff-app dialog.ff-janela[data-cheia='true']");
    expect(cheia).toMatch(/width:\s*calc\(100vw - 16px\)/);
    expect(cheia).toMatch(/height:\s*calc\(100dvh - 16px\)/);
    const celular = css.slice(css.indexOf('@media (max-width: 699px) {\n  .ff-app dialog.ff-janela {'));
    expect(celular.slice(0, celular.indexOf('}'))).toMatch(/margin:\s*0;[\s\S]*width:\s*100vw;[\s\S]*height:\s*100dvh;[\s\S]*border-radius:\s*0;/);
  });

  it('a entrada, o fundo de bloqueio e o movimento reduzido vêm do diálogo do kit', () => {
    expect(regra('.ff-app dialog.ff-dialogo[open]')).toMatch(/animation:\s*ff-camada var\(--ff-movimento\) var\(--ff-curva-entrada\)/);
    expect(regra('.ff-app dialog.ff-dialogo::backdrop')).toMatch(/animation:\s*ff-fundo/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.ff-app dialog::backdrop \{[\s\S]*animation: none !important;/);
  });
});
