/**
 * Cabeçalho da decisão 535 (prévia aprovada em 23/11/2026; "não deve estar quebrado", Rodolfo, 24/11/2026). Sem navegador:
 *
 * - FlowFoods numa linha só: as duas palavras saem da mesma imagem oficial transparente, recortadas e lado a lado, com a mesma
 *   altura e alinhadas pela base; BARNEY OS logo abaixo, à esquerda;
 * - a versão clara e a escura acompanham o tema do ERP (claro, escuro e sistema), sem JS;
 * - no celular, a marca do cliente vira uma faixa com o nome e a seta, sem a logo; no tablet e no desktop, a logo fica ao lado
 *   do nome.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/components/erp/shell/cabecalho-identidade.css', 'utf8');
const tsx = readFileSync('src/components/erp/shell/CabecalhoIdentidade.tsx', 'utf8');
/** O corpo da primeira regra com este seletor exato. */
function regra(seletor: string): string {
  const i = css.indexOf(`${seletor} {`);
  if (i < 0) throw new Error(`regra não encontrada: ${seletor}`);
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
}
const numero = (corpo: string, prop: string) => Number(new RegExp(`${prop}: calc\\((-?\\d+)px \\* var\\(--ff-logo-escala\\)\\)`).exec(corpo)![1]);

describe('cabeçalho · FlowFoods numa linha', () => {
  it('as duas palavras lado a lado (linha, não coluna), alinhadas pela base, com o espaço de uma letra entre elas', () => {
    const linha = regra('.ff-logo-linha');
    expect(linha).toContain('display: flex');
    expect(linha).not.toContain('flex-direction');
    expect(linha).toContain('align-items: flex-end');
    expect(linha).toContain('--ff-logo-escala: calc(24 / 227)');
    // No celular, um pouco menor: cabe ao lado da foto a 320 px.
    expect(css).toMatch(/@container \(max-width: 639px\) \{\s*\.ff-logo-linha \{ --ff-logo-escala: calc\(20 \/ 227\); \}/);
  });

  it('cada palavra é uma janela do tamanho dela sobre a MESMA imagem oficial, na mesma altura', () => {
    const palavra = regra('.ff-logo-palavra');
    expect(palavra).toContain('overflow: hidden');
    expect(numero(palavra, 'height')).toBe(227);
    expect(numero(regra('.ff-logo-palavra img'), 'width')).toBe(1080);
    // "Flow": colunas 228–851 e linhas 290–513; "Foods": colunas 160–919 e linhas 551–773 (1 px de folga em volta).
    expect([numero(regra('.ff-logo-flow'), 'width'), numero(regra('.ff-logo-flow img'), 'left'), numero(regra('.ff-logo-flow img'), 'top')]).toEqual([628, -226, -289]);
    expect([numero(regra('.ff-logo-foods'), 'width'), numero(regra('.ff-logo-foods img'), 'left'), numero(regra('.ff-logo-foods img'), 'top')]).toEqual([764, -158, -549]);
    // Nenhum arquivo novo: as quatro imagens são as duas originais (claro e escuro), uma de cada por palavra.
    expect(tsx).toContain("(['flow', 'foods'] as const).map((palavra) =>");
    expect(tsx.match(/src="\/identidade\/flowfoods-claro-transparente\.png"/g)).toHaveLength(1);
    expect(tsx.match(/src="\/identidade\/flowfoods-escuro-transparente\.png"/g)).toHaveLength(1);
    for (const tema of ['claro', 'escuro']) expect(existsSync(`public/identidade/flowfoods-${tema}-transparente.png`)).toBe(true);
    // A pilha empilhada de antes não volta.
    expect(css).not.toContain('ff-logo-janela');
    expect(tsx).not.toContain('ff-logo-janela');
  });

  it('BARNEY OS logo abaixo, à esquerda da palavra; o nome acessível é o do link', () => {
    const pilha = regra('.ff-assinatura-pilha');
    expect(pilha).toContain('flex-direction: column');
    expect(pilha).toContain('align-items: flex-start');
    expect(pilha).toContain('gap: 6px');
    expect(tsx).toContain('aria-label="FlowFoods — início. BARNEY OS"');
    expect(tsx).toMatch(/<span className="ff-logo-linha" aria-hidden>/);
    expect(tsx.indexOf('ff-logo-linha')).toBeLessThan(tsx.indexOf('<span className="ff-barney-os">'));
  });

  it('a versão de cada tema, sem JS: claro por padrão, escura no escuro e no sistema escuro', () => {
    expect(regra('.ff-logo-palavra .ff-logo-escuro')).toContain('display: none');
    expect(css).toMatch(/\.ff-app\[data-tema='escuro'\] \.ff-logo-claro \{ display: none; \}/);
    expect(css).toMatch(/\.ff-app\[data-tema='escuro'\] \.ff-logo-escuro \{ display: block; \}/);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*\.ff-app\[data-tema='sistema'\] \.ff-logo-claro \{ display: none; \}\s*\.ff-app\[data-tema='sistema'\] \.ff-logo-escuro \{ display: block; \}/);
  });
});

describe('cabeçalho · marca do cliente', () => {
  it('tablet e desktop: a logo (72 × 36, inteira) ao lado do nome, numa pílula no centro', () => {
    const botao = regra('.ff-marca-selecionada');
    expect(botao).toContain('display: flex');
    expect(botao).not.toContain('flex-direction: column');
    const imagem = regra('.ff-marca-imagem');
    for (const d of ['width: 72px', 'height: 36px', 'flex: none']) expect(imagem).toContain(d);
    expect(readFileSync('src/components/erp/shell/ImagemDeIdentidade.tsx', 'utf8')).toContain("'object-contain'");
  });

  it('celular: faixa única com o nome e a seta, sem a logo, sem iniciais e sem lugar guardado para ela', () => {
    const celular = css.slice(css.indexOf('@container (max-width: 639px) {'));
    expect(celular).toContain('.ff-marca-imagem { display: none; }');
    expect(celular).toMatch(/\.ff-cabecalho-marca \{ grid-column: 1 \/ -1; grid-row: 2; max-width: none; \}/);
    expect(celular).toMatch(/\.ff-marca-selecionada \{ min-height: 44px;/);
  });
});

describe('cabeçalho · "Trocar logo da marca" (decisão 536)', () => {
  it('atalho separado da troca de marca, só com `logoBase`, que abre o MESMO editor da Identidade visual na rota da marca', () => {
    expect(tsx).toMatch(/\{dados\.logoBase && marca && <button\s+type="button"\s+aria-haspopup="dialog"/);
    expect(tsx).toContain('Trocar logo da marca');
    expect(tsx).toContain('Altera a imagem de {marca.nome}');
    expect(tsx).toContain("import { EditorImagem } from '../telas/identidade/editor-imagem';");
    expect(tsx).toContain('<EditorImagem url={`${logoDe.base}/${encodeURIComponent(logoDe.marca.id)}/logo`} atual={logoDe.marca.logoUrl} nome={logoDe.marca.nome} tipo="logo"');
    // A marca da janela fica presa ao abrir, com a rota e o parceiro: trocar a marca do cabeçalho não muda de quem é a logo, e
    // a janela não depende dos dados do cabeçalho (no nível 1 eles somem um instante quando o layout recarrega ao salvar).
    expect(tsx).toMatch(/setLogoDe\(\{ marca, base: dados\.logoBase!, parceiroId: dados\.parceiroId \}\);\s*fechar\(\);/);
    expect(tsx).toContain('<Dialogo aberto={logoDe !== null}');
    expect(tsx).not.toMatch(/\{dados\?\.logoBase && \(\s*<Dialogo/);
    // Nada de foto pessoal ou de outra marca na janela.
    const janela = tsx.slice(tsx.indexOf('<Dialogo aberto={logoDe !== null}'), tsx.indexOf('</Dialogo>'));
    expect(janela).not.toMatch(/foto|perfil\/foto|tipo="foto"/);
  });

  it('o painel do seletor nasce dele (Expansão)', () => {
    expect(tsx).toMatch(/classeDoBotao="ff-marca-selecionada ff-transicao"\s*alinhar="esquerda"\s*\/\/[^\n]*\n\s*expansao/);
  });
});
