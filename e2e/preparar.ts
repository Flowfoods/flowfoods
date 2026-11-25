/**
 * P-05 · antes dos testes: entra uma vez com cada perfil pela tela de login real (`/entrar`) e guarda a sessão. Os testes das
 * três larguras reaproveitam essas sessões, sem repetir o login (o limite de tentativas continua valendo de verdade).
 */

import { chromium, type FullConfig } from '@playwright/test';
import { dados, PERFIS, sessaoDe } from './apoio';

export default async function preparar(config: FullConfig) {
  const { baseURL, launchOptions } = config.projects[0].use;
  const d = dados();
  const navegador = await chromium.launch(launchOptions);
  try {
    for (const perfil of PERFIS) {
      const contexto = await navegador.newContext({ baseURL });
      const page = await contexto.newPage();
      await page.goto('/entrar');
      await page.fill('input[name="email"]', d.emails[perfil]);
      await page.fill('input[name="senha"]', d.senha);
      await Promise.all([
        page.waitForURL(/\/erp(\/|\?|$)/, { timeout: 30_000 }),
        page.locator('form button[type="submit"]').first().click(),
      ]);
      await contexto.storageState({ path: sessaoDe(perfil) });
      await contexto.close();
    }
  } finally {
    await navegador.close();
  }
}
