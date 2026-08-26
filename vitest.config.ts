import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Um portão, dois motores.
 *
 * `src/lib/diagnostico` — o motor de scoring do Diagnóstico. Veio com os
 * testes de propósito: motor de scoring sem teste apodrece em silêncio — nunca
 * "quebra", só passa a calcular o momento errado, e o erro aparece na frente
 * do cliente, na call.
 *
 * `tests/` — o domínio do Barney (tetos, janela, dedup, inbound). Roda sem
 * banco e sem rede por construção.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/lib/diagnostico/**/*.test.ts', 'tests/**/*.test.ts'],
    // Fuso fixo: os testes de janela e de teto diário do Barney só significam
    // alguma coisa se o relógio do CI concordar com o do worker.
    env: {
      TZ: 'America/Sao_Paulo',
      // O cliente Prisma é construído na importação de `@/lib/db`. Uma URL de
      // mentira basta: nenhum teste faz query — eles exercitam o domínio puro,
      // que não toca no banco.
      DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste?schema=public',
    },
  },
});
