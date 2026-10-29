/**
 * INT-1.4 (decisão 486) — a primeira leitura oficial no TEST do iFood, por comando no servidor (nunca no CI).
 *
 *   docker compose exec worker npm run integracao:ler-test -- --client-id <Client ID do app Teste (C)> [--loja <uuid>] [--dia AAAA-MM-DD] [--token-novo] [--saida <pasta>]
 *
 * Precisa de INTEGRACAO_IFOOD_ATIVA=true, IFOOD_TEST_CLIENT_SECRET e INTEGRACAO_CHAVE_CIFRAGEM no cofre. Nunca imprime token nem
 * segredo. Código de saída: 0 = HTTP 200 oficial nos três passos; 1 = o iFood recusou ou falhou; 2 = recusado antes de chamar.
 */
import { prisma } from '@/lib/db';
import { executarLeituraTest, lerArgumentos } from '@/lib/integracoes/ifood/comando-leitura-test';
import { transporteFetch } from '@/lib/integracoes/ifood/transporte';

async function principal(): Promise<number> {
  const args = lerArgumentos(process.argv.slice(2));
  if (!args.ok) {
    console.error(args.erro);
    return 2;
  }
  return executarLeituraTest(args.opcoes, { transporte: transporteFetch, env: process.env, agora: Date.now, log: (l) => console.log(l) });
}

principal()
  .then((codigo) => prisma.$disconnect().then(() => process.exit(codigo)))
  .catch(async (e: unknown) => {
    console.error(`A leitura TEST parou: ${e instanceof Error ? e.message : String(e)}`);
    await prisma.$disconnect();
    process.exit(1);
  });
