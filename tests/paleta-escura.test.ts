/**
 * Decisão 476 — as cores do tema escuro moram em blocos repetidos (o CSS não junta uma regra com e sem `@media`). Este teste
 * impede que eles divirjam por descuido: quem muda um tem de mudar o par dele.
 *
 * 09/11/2026 (padrão visual aprovado): a paleta nova vale SÓ para o ERP (`.ff-app`). O site e o Portal do cliente (`.ff-site`)
 * ficam fora daquela entrega e continuam com a paleta auditada na decisão 471. Por isso os dois escuros do ERP seguem iguais
 * entre si, o do site fica travado nos valores dele e o do ERP nos valores aprovados: nenhum dos dois muda sem este teste saber.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync('src/components/erp/tokens.css', 'utf8');
const globais = readFileSync('src/app/globals.css', 'utf8');

/** As variáveis de um bloco, a partir do seletor (até a primeira chave que fecha). */
function variaveis(css: string, seletor: string, prefixo: string): Record<string, string> {
  const i = css.indexOf(seletor);
  if (i < 0) throw new Error(`bloco não encontrado: ${seletor}`);
  const corpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  return Object.fromEntries([...corpo.matchAll(new RegExp(`--${prefixo}([\\w-]+):\\s*([^;]+);`, 'g'))].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]));
}

const erpEscuro = variaveis(tokens, ".ff-app[data-tema='escuro'] {", 'ff-');
const erpSistema = variaveis(tokens, ".ff-app[data-tema='sistema'] {", 'ff-');
const siteEscuro = variaveis(globais, 'body:has(.ff-site) {', 'site-');

describe('decisão 476 · uma paleta escura só', () => {
  it('o escuro escolhido e o escuro do sistema no ERP são iguais, variável por variável', () => {
    expect(Object.keys(erpEscuro).length).toBeGreaterThan(20);
    expect(erpSistema).toEqual(erpEscuro);
  });

  it('o site e o Portal continuam com a paleta escura deles (o padrão do ERP não vaza para `.ff-site`)', () => {
    expect(siteEscuro).toEqual({
      surface: '14 13 12',
      'surface-2': '22 21 19',
      'surface-3': '52 49 46',
      papel: '22 21 19',
      ink: '245 240 235',
      'ink-2': '232 226 220',
      'ink-3': '210 203 196',
      'ink-4': '176 169 162',
      'ink-5': '150 143 136',
      primary: '196 21 34',
      'primary-dark': '168 17 28',
      marca: '234 29 44',
      realce: '245 82 90',
      'bloco-realce': '245 82 90',
      bloco: '31 29 27',
      'bloco-texto': '245 240 235',
    });
    // O claro do site também: creme, preto e os vermelhos por papel.
    expect(variaveis(globais, ':root {\n  --site-surface', 'site-')).toMatchObject({ surface: '245 240 235', papel: '252 250 248', ink: '10 10 10', primary: '196 21 34', marca: '234 29 44' });
    // Nenhuma variável do ERP é definida fora do escopo dele.
    expect(globais).not.toMatch(/--ff-(fundo|painel|texto|suave|acao|acento|destaque)\b/);
  });

  it('o escuro do ERP é o aprovado em 09/11/2026 (fundo, superfície, texto, divisória, destaque, botão, sucesso e atenção)', () => {
    expect(erpEscuro).toMatchObject({
      fundo: '24 25 23', // #181917
      painel: '36 37 33', // #242521
      lateral: '36 37 33',
      texto: '238 234 224', // #eeeae0
      suave: '176 177 166', // #b0b1a6
      linha: '#3b3d35',
      acento: '238 140 126', // #ee8c7e
      destaque: '60 41 38', // #3c2926
      acao: '184 61 51', // #b83d33
      'sobre-acao': '255 253 248', // #fffdf8
      ok: '155 200 170', // #9bc8aa
      'ok-fundo': '39 55 44', // #27372c
      atencao: '229 187 118', // #e5bb76
      'atencao-fundo': '57 50 34', // #393222
    });
  });
});
