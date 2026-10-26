/**
 * Decisão 476 — as cores do tema escuro moram em três blocos (o escuro escolhido no ERP, o escuro do sistema no ERP e o
 * escuro do site e do Portal), com os mesmos valores. Em vez de juntar os blocos (o CSS não junta uma regra com e sem
 * `@media`, e mexer nas telas pede nova auditoria de contraste), este teste impede que eles divirjam: quem muda um tem de
 * mudar os outros.
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

  it('o site e o Portal usam as mesmas cores de fundo, cartão, faixa, texto e vermelho do ERP', () => {
    const pares: [site: string, erp: string][] = [
      ['surface', 'fundo'],
      ['surface-2', 'painel'],
      ['papel', 'painel'],
      ['bloco', 'forte'],
      ['ink', 'texto'],
      ['bloco-texto', 'texto'],
      ['primary', 'acao'],
      ['marca', 'acento'],
      ['realce', 'erro'],
    ];
    for (const [site, erp] of pares) expect(siteEscuro[site], `--site-${site} × --ff-${erp}`).toBe(erpEscuro[erp]);
  });
});
