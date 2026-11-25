/**
 * P-05 · permissões por loja como teste automático. Cada cenário roda nas três larguras (`playwright.config.ts`).
 *
 * F (QA de 25/11/2026): Gerente de uma loja entra já na loja dele, não vê outra loja e a URL direta de Equipe e Integrações
 *   volta ao Início. Acrescido: a tela e a planilha de compras só trazem a loja dele, mesmo pedindo a outra pela URL.
 * G (QA de 25/11/2026): Operador de outro parceiro não vê dados da Alfa, a URL direta de um insumo dela não revela o registro
 *   (404) e Faturamento, DRE e Equipe voltam ao Início. Acrescido: impressão da ficha e planilhas da Alfa.
 * Perfil próprio (só ver insumos e fichas): o que ele pode abre; o resto volta ao Início; planilhas sem a permissão dão 403.
 * Dono: controle positivo (vê as duas lojas e imprime).
 * Sem sessão: nenhuma tela nem planilha.
 *
 * Só leitura: nenhum teste grava, altera ou apaga dado. Massa sintética de `scripts/e2e-semear.ts`.
 */

import { expect, test } from '@playwright/test';
import { abrir, dados, recusadaNoServidor, sessaoDe, textoDaPagina } from './apoio';

const d = dados();
const periodo = `de=${d.periodo.de}&ate=${d.periodo.ate}`;
const planilhaDeCompras = (extra = '') => `/erp/compras/relatorios/periodo/exportar?${periodo}&ver=linhas${extra}`;
const planilhaDeConsumo = `/erp/estoque/relatorios/consumo/exportar?${periodo}`;
const impressaoDaFicha = `/erp/fichas/${d.alfa.ficha.id}/imprimir`;

test.describe('Gerente de uma loja (cenário F)', () => {
  test.use({ storageState: sessaoDe('gerente') });

  test('entra já na própria loja, sem seletor de visão nem a outra loja', async ({ page }) => {
    const r = await abrir(page, '/erp');
    expect(await textoDaPagina(page)).toContain(d.alfa.lojaPenha.nome);
    // Sem o botão de troca de visão, que é por onde se escolhe a rede ou outra loja (o Dono tem: ver o controle positivo).
    // "Rede Completa" não serve de marca: o texto de ajuda da tela fala dela para todos.
    await expect(page.getByRole('button', { name: /^Visão:/ })).toHaveCount(0);
    // O HTML inteiro (inclui os dados que o servidor manda para os componentes, como as opções de um seletor fechado) não
    // traz a outra loja.
    expect(await r!.text()).not.toContain(d.alfa.lojaDelivery.nome);
  });

  test('URL direta de Equipe e Integrações volta ao Início, pela falta de permissão', async ({ page }) => {
    await recusadaNoServidor(page, '/erp/equipe');
    // A Integração está liberada para a Alfa na massa: a recusa só pode vir da permissão ("ver integrações").
    await recusadaNoServidor(page, '/erp/integracoes', 'sem-acesso');
  });

  test('compras: a tela e a planilha só trazem a loja dele, mesmo pedindo a outra pela URL', async ({ page }) => {
    // As linhas de compra são da loja: a nota da loja dele (R$ 79,90) aparece, a da outra (R$ 81,50) não. O filtro
    // "Fornecedor" lista o cadastro do parceiro inteiro (fornecedor é do parceiro, não da loja): por isso a conferência é
    // pelas linhas, não pelo texto da página.
    await abrir(page, `/erp/compras/relatorios/periodo?${periodo}&ver=linhas`);
    const tela = await textoDaPagina(page);
    expect(tela).toContain(d.alfa.valorPenha);
    expect(tela).not.toContain(d.alfa.valorDelivery);

    const propria = await page.request.get(planilhaDeCompras());
    expect(propria.status()).toBe(200);
    const csv = await propria.text();
    expect(csv).toContain(d.alfa.fornecedorPenha);
    expect(csv).not.toContain(d.alfa.fornecedorDelivery);
    expect(csv).not.toContain(d.alfa.lojaDelivery.nome);

    const outra = await page.request.get(planilhaDeCompras(`&loja=${d.alfa.lojaDelivery.id}`));
    expect(outra.status()).toBeLessThan(500);
    const csvOutra = await outra.text();
    expect(csvOutra).not.toContain(d.alfa.fornecedorDelivery);
    expect(csvOutra).not.toContain(d.alfa.valorDelivery);
  });

  test('imprime a ficha do próprio parceiro', async ({ page }) => {
    await abrir(page, impressaoDaFicha);
    expect(await textoDaPagina(page)).toContain(d.alfa.ficha.nome);
  });
});

test.describe('Operador de outro parceiro (cenário G)', () => {
  test.use({ storageState: sessaoDe('operador') });

  test('a lista de insumos é só do parceiro dele', async ({ page }) => {
    await abrir(page, '/erp/insumos');
    const texto = await textoDaPagina(page);
    expect(texto).toContain(d.beta.insumo.nome);
    expect(texto).not.toContain(d.alfa.insumo.nome);
  });

  test('URL direta de um insumo da Alfa não revela o registro', async ({ page }) => {
    const r = await page.goto(`/erp/insumos/${d.alfa.insumo.id}`);
    expect(r?.status()).toBe(404);
    expect(await r!.text()).not.toContain(d.alfa.insumo.nome);
  });

  test('URL direta de Faturamento, DRE e Equipe volta ao Início', async ({ page }) => {
    for (const caminho of ['/erp/faturamento', '/erp/dre', '/erp/equipe']) await recusadaNoServidor(page, caminho);
    // Integrações: a Beta não tem o módulo liberado, e o Operador nem a permissão; a permissão é conferida primeiro.
    await recusadaNoServidor(page, '/erp/integracoes', 'sem-acesso');
  });

  test('impressão da ficha da Alfa não revela a ficha', async ({ page }) => {
    const r = await page.goto(impressaoDaFicha);
    expect(r?.status()).toBe(404);
    expect(await r!.text()).not.toContain(d.alfa.ficha.nome);
  });

  test('planilhas: sem ver compras, 403; a do estoque não traz nada da Alfa', async ({ page }) => {
    const compras = await page.request.get(planilhaDeCompras('&rede=1'));
    expect(compras.status()).toBe(403);
    expect(await compras.text()).not.toContain(d.alfa.fornecedorPenha);

    const consumo = await page.request.get(planilhaDeConsumo);
    expect(consumo.status()).toBe(200);
    const csv = await consumo.text();
    // Controle positivo: a planilha é a da loja dele (sem isso, uma resposta vazia passaria).
    expect(csv).toContain(d.beta.loja.nome);
    expect(csv).not.toContain(d.alfa.insumo.nome);
    expect(csv).not.toContain(d.alfa.lojaPenha.nome);
  });
});

test.describe('Perfil próprio: só ver insumos e fichas', () => {
  test.use({ storageState: sessaoDe('proprio') });

  test('abre insumos e fichas; o resto volta ao Início', async ({ page }) => {
    await abrir(page, '/erp/insumos');
    expect(await textoDaPagina(page)).toContain(d.alfa.insumo.nome);
    await abrir(page, '/erp/fichas');
    expect(await textoDaPagina(page)).toContain(d.alfa.ficha.nome);
    for (const caminho of ['/erp/compras', '/erp/estoque', '/erp/faturamento', '/erp/equipe', '/erp/insumos/novo']) {
      await recusadaNoServidor(page, caminho);
    }
  });

  test('imprime a ficha (ver fichas) e não baixa planilha sem a permissão dela', async ({ page }) => {
    await abrir(page, impressaoDaFicha);
    expect(await textoDaPagina(page)).toContain(d.alfa.ficha.nome);
    for (const planilha of [planilhaDeCompras('&rede=1'), planilhaDeConsumo]) {
      const r = await page.request.get(planilha);
      expect(r.status(), planilha).toBe(403);
      expect(await r.text(), planilha).not.toContain(d.alfa.fornecedorPenha);
    }
  });
});

test.describe('Dono: controle positivo', () => {
  test.use({ storageState: sessaoDe('dono') });

  test('a planilha da rede traz as duas lojas dele e nada da Beta', async ({ page }) => {
    const r = await page.request.get(planilhaDeCompras('&rede=1'));
    expect(r.status()).toBe(200);
    const csv = await r.text();
    expect(csv).toContain(d.alfa.fornecedorPenha);
    expect(csv).toContain(d.alfa.fornecedorDelivery);
    expect(csv).not.toContain(d.beta.fornecedor);
  });

  test('imprime a ficha e não abre o insumo da Beta pela URL', async ({ page }) => {
    await abrir(page, impressaoDaFicha);
    expect(await textoDaPagina(page)).toContain(d.alfa.ficha.nome);
    const r = await page.goto(`/erp/insumos/${d.beta.insumo.id}`);
    expect(r?.status()).toBe(404);
    expect(await r!.text()).not.toContain(d.beta.insumo.nome);
  });

  test('tem o seletor de visão (as duas lojas) e abre a Central de Integrações', async ({ page }) => {
    const r = await abrir(page, '/erp');
    await expect(page.getByRole('button', { name: /^Visão:/ }).first()).toBeVisible();
    expect(await r!.text()).toContain(d.alfa.lojaDelivery.nome);
    await abrir(page, '/erp/integracoes');
    expect(new URL(page.url()).pathname).toBe('/erp/integracoes');
  });
});

test.describe('Sem sessão', () => {
  test('nenhuma tela nem planilha', async ({ page }) => {
    await page.goto('/erp/insumos');
    expect(new URL(page.url()).pathname).toBe('/entrar');
    // A planilha nem chega à rota: o servidor manda para o login (307) antes; a rota, se alcançada, responde 401.
    for (const planilha of [planilhaDeCompras('&rede=1'), planilhaDeConsumo]) {
      const r = await page.request.get(planilha, { maxRedirects: 0 });
      expect([307, 401], planilha).toContain(r.status());
      if (r.status() === 307) expect(r.headers().location, planilha).toMatch(/^(https?:\/\/[^/]+)?\/entrar(\?|$)/);
      const corpo = await r.text();
      expect(corpo, planilha).not.toContain(d.alfa.fornecedorPenha);
      expect(corpo, planilha).not.toContain(d.alfa.insumo.nome);
    }
  });
});
