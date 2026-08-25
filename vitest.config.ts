import { defineConfig } from 'vitest/config';

/**
 * Portão do motor do Diagnóstico.
 *
 * Os testes vieram junto com o motor de propósito. Motor de scoring sem teste é
 * o tipo de código que apodrece em silêncio: ele nunca "quebra", só passa a
 * calcular o momento errado — e o erro aparece na frente do cliente, na call.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/diagnostico/**/*.test.ts'],
  },
});
