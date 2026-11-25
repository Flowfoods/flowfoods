/**
 * P-05 · permissões por loja no navegador (Playwright). Os cenários F e G do QA de 25/11/2026, o perfil próprio, a impressão e a
 * exportação, em três larguras (celular, tablet e desktop) e quatro perfis. Roda contra o build de produção (`next start`) e um
 * banco local descartável com a massa de `npm run e2e:semear`. No portão (`.github/workflows/deploy.yml`), uma falha aqui
 * bloqueia a publicação.
 *
 * Sem nova tentativa automática: uma falha de permissão não pode passar na segunda vez. Sem paralelismo: um banco, uma massa.
 */

import { defineConfig } from '@playwright/test';

const porta = Number(process.env.E2E_PORTA ?? 3100);
// Onde o Chromium já está instalado fora do cache do Playwright (ambiente local); no CI, `npx playwright install chromium`.
const executavel = process.env.E2E_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.estado/resultados',
  globalSetup: './e2e/preparar.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${porta}`,
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: executavel ? { executablePath: executavel } : {},
  },
  projects: [
    { name: 'celular', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next start -p ${porta}`,
    url: `http://localhost:${porta}/entrar`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
