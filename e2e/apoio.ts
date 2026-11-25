/**
 * P-05 · apoio dos testes de permissão no navegador: a massa sintética de `scripts/e2e-semear.ts` e as sessões que
 * `e2e/preparar.ts` guarda (uma entrada por perfil, para não esbarrar no limite de tentativas de login).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

export const PERFIS = ['dono', 'gerente', 'operador', 'proprio'] as const;
export type Perfil = (typeof PERFIS)[number];

export interface DadosE2E {
  senha: string;
  emails: Record<Perfil, string>;
  alfa: {
    lojaPenha: { id: string; nome: string };
    lojaDelivery: { id: string; nome: string };
    insumo: { id: string; nome: string };
    ficha: { id: string; nome: string };
    fornecedorPenha: string;
    fornecedorDelivery: string;
    /** O valor da nota de cada loja (marca a linha da compra na tela). */
    valorPenha: string;
    valorDelivery: string;
  };
  beta: { loja: { id: string; nome: string }; insumo: { id: string; nome: string }; fornecedor: string };
  periodo: { de: string; ate: string };
}

export const PASTA_DO_ESTADO = join(process.cwd(), 'e2e', '.estado');

export function dados(): DadosE2E {
  return JSON.parse(readFileSync(join(PASTA_DO_ESTADO, 'dados.json'), 'utf8')) as DadosE2E;
}

/** A sessão guardada de um perfil (cookies), para `test.use({ storageState })`. */
export const sessaoDe = (perfil: Perfil) => join(PASTA_DO_ESTADO, `sessao-${perfil}.json`);

/** Abre uma tela do ERP, confere que ela abriu (sem erro) e que não há rolagem lateral nesta largura. */
export async function abrir(page: Page, caminho: string) {
  const r = await page.goto(caminho);
  expect(r?.status(), `${caminho}: status`).toBeLessThan(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${caminho}: sem rolagem lateral`).toBe(true);
  return r;
}

/**
 * URL direta para uma tela sem permissão: o SERVIDOR recusa (a primeira resposta já é o redirecionamento, sem a tela) e a
 * pessoa volta ao Início (`/erp`) com o aviso do motivo esperado: `sem-acesso` (falta permissão) ou `sem-modulo` (módulo não
 * liberado para o parceiro). Aceitar os dois esconderia a falta de uma das travas.
 */
export async function recusadaNoServidor(page: Page, caminho: string, motivo: 'sem-acesso' | 'sem-modulo' = 'sem-acesso') {
  const primeira = await page.request.get(caminho, { maxRedirects: 0 });
  expect([302, 303, 307, 308], `${caminho}: o servidor redireciona`).toContain(primeira.status());
  expect(primeira.headers().location ?? '', `${caminho}: para o Início com o motivo`).toMatch(new RegExp(`^(https?://[^/]+)?/erp\\?${motivo}=`));
  await page.goto(caminho);
  const url = new URL(page.url());
  expect(url.pathname, `${caminho}: volta ao Início`).toBe('/erp');
  expect(url.searchParams.has(motivo), `${caminho}: com o aviso ${motivo}`).toBe(true);
}

/** O texto visível da página (sem marcação), para conferir o que aparece e o que não pode aparecer. */
export const textoDaPagina = (page: Page) => page.locator('body').innerText();
