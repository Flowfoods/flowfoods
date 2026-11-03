/**
 * Visão C, "botão Voltar em todas as páginas" (decisão 516): todo `page.tsx` do ERP do parceiro (`/erp/**`) e do espelho do
 * nível 1 (`/rodolfo/erp/[slug]/**`) tem um retorno. Vale uma de três:
 *  1. a rota está nas listas do shell (`temVoltarNoShell`), que desenha o Voltar acima da tela;
 *  2. a página, ou o componente de tela que ela usa (seguindo os imports, função por função), renderiza `<Voltar`;
 *  3. está na lista curta de exceções justificadas, e cada exceção prova o seu retorno (ou que só redireciona).
 * Página nova sem nada disso reprova aqui. E nenhuma página tem os dois Voltar ao mesmo tempo (shell e tela).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { temVoltarNoShell } from '@/lib/erp/voltar-navegacao';

const RAIZ = process.cwd();
const ARVORES = [
  { pasta: join(RAIZ, 'src', 'app', 'erp'), prefixo: '/erp' },
  { pasta: join(RAIZ, 'src', 'app', 'rodolfo', '(painel)', 'erp', '[slug]'), prefixo: '/rodolfo/erp/alfa' },
];

const paginas = (pasta: string): string[] =>
  readdirSync(pasta).flatMap((n) => {
    const p = join(pasta, n);
    return statSync(p).isDirectory() ? paginas(p) : n === 'page.tsx' ? [p] : [];
  });

/** `[lojaId]`, `[id]`... viram um valor de exemplo: o shell trata o segmento dinâmico como um segmento qualquer. */
const rotaDa = (arquivo: string, pasta: string, prefixo: string) =>
  prefixo + relative(pasta, dirname(arquivo)).split(/[\\/]/).filter(Boolean).map((s) => '/' + (s.startsWith('[') ? 'x1' : s)).join('');

const fontes = new Map<string, ts.SourceFile>();
const fonte = (arquivo: string) => {
  let f = fontes.get(arquivo);
  if (!f) {
    f = ts.createSourceFile(arquivo, readFileSync(arquivo, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    fontes.set(arquivo, f);
  }
  return f;
};

const resolver = (de: string, modulo: string): string | null => {
  const base = modulo.startsWith('@/') ? join(RAIZ, 'src', modulo.slice(2)) : modulo.startsWith('.') ? join(dirname(de), modulo) : null;
  if (!base) return null;
  return [base + '.tsx', base + '.ts', join(base, 'index.tsx'), join(base, 'index.ts')].find((c) => existsSync(c)) ?? null;
};

/** O que o arquivo declara (funções e constantes) e de onde vem cada nome importado; tipos ficam de fora. */
function simbolos(f: ts.SourceFile) {
  const locais = new Map<string, ts.Node>();
  const importados = new Map<string, { arquivo: string; nome: string }>();
  let padrao: ts.Node | null = null;
  const ehPadrao = (n: ts.FunctionDeclaration) => !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
  for (const st of f.statements) {
    if (ts.isFunctionDeclaration(st)) {
      if (st.name) locais.set(st.name.text, st);
      if (ehPadrao(st)) padrao = st;
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) locais.set(d.name.text, d);
    } else if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const nomes = ts.isImportDeclaration(st)
        ? (!st.importClause?.isTypeOnly && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings) ? st.importClause.namedBindings.elements : [])
        : (st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements : []);
      const arquivo = resolver(f.fileName, st.moduleSpecifier.text);
      if (arquivo) for (const el of nomes) if (!el.isTypeOnly) importados.set(el.name.text, { arquivo, nome: (el.propertyName ?? el.name).text });
    }
  }
  return { locais, importados, padrao };
}

/** A função (`null` = o export default da página) desenha `<Voltar`, direto ou num componente que ela usa. */
function rendeVoltar(arquivo: string, nome: string | null, vistos = new Set<string>()): boolean {
  const chave = `${arquivo}#${nome}`;
  if (vistos.has(chave) || vistos.size > 400) return false;
  vistos.add(chave);
  const f = fonte(arquivo);
  const s = simbolos(f);
  const no = nome === null ? s.padrao : s.locais.get(nome);
  if (!no) {
    const de = nome ? s.importados.get(nome) : undefined;
    return de ? rendeVoltar(de.arquivo, de.nome, vistos) : false;
  }
  let achou = false;
  const usados = new Set<string>();
  const visitar = (n: ts.Node) => {
    if (achou) return;
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(f) === 'Voltar') {
      achou = true;
      return;
    }
    // Tag JSX, chamada ou componente passado como valor: qualquer nome com inicial maiúscula.
    if (ts.isIdentifier(n) && /^[A-Z]/.test(n.text)) usados.add(n.text);
    ts.forEachChild(n, visitar);
  };
  visitar(no);
  if (achou) return true;
  for (const u of usados) {
    if (u === nome) continue;
    if (s.locais.has(u) && rendeVoltar(arquivo, u, vistos)) return true;
    const de = s.importados.get(u);
    if (de && rendeVoltar(de.arquivo, de.nome, vistos)) return true;
  }
  return false;
}

/** Exceções justificadas: cada uma prova, no código, que tem retorno próprio ou que só redireciona. */
const EXCECOES: { rota: RegExp; motivo: string; prova: () => boolean }[] = [
  {
    rota: /^\/(erp|rodolfo\/erp\/alfa)\/fichas\/x1\/imprimir$/,
    motivo: 'variante de impressão: o retorno é o botão "Voltar para a ficha" da barra que não sai no papel',
    prova: () => /<Link href=\{voltar\}[^>]*>\s*Voltar para a ficha\s*<\/Link>/.test(readFileSync(join(RAIZ, 'src', 'components', 'erp', 'telas', 'fichas', 'impressao.tsx'), 'utf8')),
  },
  {
    rota: /^\/rodolfo\/erp\/alfa\/integracoes$/,
    motivo: 'só redireciona à Central de Integrações do parceiro (decisão 491); não desenha tela',
    prova: () => {
      const t = readFileSync(join(ARVORES[1].pasta, 'integracoes', 'page.tsx'), 'utf8');
      return /\bredirect\(/.test(t) && !/<[A-Za-z]/.test(t.replace(/\/\*[\s\S]*?\*\//g, ''));
    },
  },
];

/**
 * Decisão 518: páginas que o shell cobre sem volta e que, abertas pela pendência da Home com a volta válida, desenham o próprio
 * "Voltar para o início" (o shell cede, como no relatório de compras com origem). O teste prova as duas metades com
 * `temVoltarNoShell`: com a Home exata da área o shell não desenha; com qualquer outra volta, desenha.
 */
const CEDEM_A_VOLTA_DA_HOME = [/^\/(erp|rodolfo\/erp\/alfa)\/faturamento$/];
const raizDaRota = (rota: string) => (rota.startsWith('/erp') ? '/erp' : '/rodolfo/erp/alfa');

const inventario = ARVORES.flatMap(({ pasta, prefixo }) =>
  paginas(pasta).sort().map((arquivo) => {
    const rota = rotaDa(arquivo, pasta, prefixo);
    return { arquivo: relative(RAIZ, arquivo), rota, shell: temVoltarNoShell(rota), tela: rendeVoltar(arquivo, null) };
  }),
);

describe('Inventário do Voltar: toda página do ERP tem retorno (Visão C)', () => {
  it('percorre as duas árvores inteiras (parceiro e nível 1)', () => {
    expect(inventario.filter((p) => p.rota.startsWith('/erp')).length).toBeGreaterThanOrEqual(99);
    expect(inventario.filter((p) => p.rota.startsWith('/rodolfo/erp/alfa')).length).toBeGreaterThanOrEqual(100);
  });

  it('nenhuma página fica sem Voltar: shell, tela ou exceção justificada', () => {
    const sem = inventario.filter((p) => !p.shell && !p.tela && !EXCECOES.some((e) => e.rota.test(p.rota)));
    expect(sem.map((p) => `${p.rota} (${p.arquivo})`)).toEqual([]);
  });

  it('cada exceção ainda vale: o retorno próprio existe ou a página só redireciona; nenhuma é exceção à toa', () => {
    for (const e of EXCECOES) {
      const alvo = inventario.filter((p) => e.rota.test(p.rota));
      expect(alvo.length, e.motivo).toBeGreaterThan(0);
      expect(e.prova(), e.motivo).toBe(true);
      for (const p of alvo) expect(p.shell || p.tela, `${p.rota} já tem Voltar: tire a exceção`).toBe(false);
    }
  });

  it('nenhuma página desenha dois Voltar (o do shell e o da tela)', () => {
    // Decisão 518: a tela que só desenha o Voltar com a volta da Home cede ao shell sem ela, e o shell cede a ela com a volta.
    const cedem = inventario.filter((p) => p.shell && p.tela && CEDEM_A_VOLTA_DA_HOME.some((r) => r.test(p.rota)));
    for (const p of cedem) expect(temVoltarNoShell(p.rota, 'volta=' + encodeURIComponent(raizDaRota(p.rota))), p.rota).toBe(false);
    expect(inventario.filter((p) => p.shell && p.tela && !cedem.includes(p)).map((p) => p.rota)).toEqual([]);
  });

  it('decisão 518: o faturamento do mês tem o Voltar do shell sem volta, e o próprio "Voltar para o início" só com a Home exata', () => {
    for (const rota of ['/erp/faturamento', '/rodolfo/erp/alfa/faturamento']) {
      const p = inventario.find((x) => x.rota === rota);
      expect(p, rota).toMatchObject({ shell: true, tela: true });
      const raiz = raizDaRota(rota);
      expect(temVoltarNoShell(rota, 'volta=' + encodeURIComponent(raiz))).toBe(false);
      // Volta inválida (outra área, outra tela, codificada, externa, com query): o shell continua desenhando o Voltar de sempre.
      for (const v of ['/erp/insumos', '/rodolfo/erp/outro', raiz === '/erp' ? '/rodolfo/erp/alfa' : '/erp', '%2Ferp', 'https://fora.test/erp', '//erp', raiz + '?sem-acesso=1']) {
        expect(temVoltarNoShell(rota, 'volta=' + encodeURIComponent(v)), `${rota} ${v}`).toBe(true);
      }
      // Volta repetida: a página a recusa (chega como lista), então o shell também desenha o seu (nunca ficam os dois sem Voltar).
      const uma = 'volta=' + encodeURIComponent(raiz);
      expect(temVoltarNoShell(rota, `${uma}&${uma}`)).toBe(true);
      expect(temVoltarNoShell(rota, `mes=2026-10&${uma}&volta=`)).toBe(true);
    }
    // Só o faturamento do mês cede: o dia tem o próprio "Voltar para o mês" e nunca esteve no shell.
    expect(inventario.filter((p) => CEDEM_A_VOLTA_DA_HOME.some((r) => r.test(p.rota))).map((p) => p.rota).sort()).toEqual(['/erp/faturamento', '/rodolfo/erp/alfa/faturamento']);
  });

  it('classificar insumos tem o Voltar na própria tela, nas duas árvores, sem depender do shell', () => {
    for (const rota of ['/erp/insumos/classificar', '/rodolfo/erp/alfa/insumos/classificar']) {
      const p = inventario.find((x) => x.rota === rota);
      expect(p, rota).toBeDefined();
      expect(p!.shell, rota).toBe(false);
      expect(p!.tela, rota).toBe(true);
    }
    // Controle: a análise não inventa Voltar onde só o shell desenha nem no redirecionamento puro.
    expect(inventario.find((x) => x.rota === '/erp/fichas')).toMatchObject({ shell: true, tela: false });
    expect(inventario.find((x) => x.rota === '/rodolfo/erp/alfa/integracoes')).toMatchObject({ shell: false, tela: false });
  });
});
