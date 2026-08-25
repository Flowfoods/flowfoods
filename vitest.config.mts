import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Fuso fixo: os testes de janela e de teto diario so significam alguma coisa
    // se o relogio do CI concordar com o do worker.
    env: {
      TZ: 'America/Sao_Paulo',
      // O cliente Prisma e construido na importacao de `@/lib/db`. Uma URL
      // de mentira basta: nenhum teste faz query — eles exercitam o dominio
      // puro e as funcoes de aperto, que nao tocam no banco.
      DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste?schema=public',
    },
  },
});
