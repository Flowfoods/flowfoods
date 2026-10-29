/**
 * Central de Integrações (INT-1.2) — confere, no servidor, se a integração do iFood está pronta para ligar. Nunca imprime valor
 * de segredo: só nomes de variável, presença e frases.
 *
 *   docker compose exec worker npm run integracao:conferir
 *
 * Código de saída: 0 = pronto (ou desligada e pronta); 1 = falta algo. Não chama o iFood.
 */
import { listarApps } from '@/lib/integracoes/core/apps';
import { conferirConfiguracao, temSegredo } from '@/lib/integracoes/core/cofre';
import { prisma } from '@/lib/db';

async function principal(): Promise<number> {
  const apps = await listarApps();
  const nomes = Array.from(new Set(apps.map((a) => a.nomeDoSegredo)));
  const s = conferirConfiguracao(nomes);
  console.log(`Integração do iFood: ${s.ativa ? 'LIGADA' : 'desligada'} (INTEGRACAO_IFOOD_ATIVA).`);
  for (const a of apps) {
    console.log(`- App "${a.nome}" (${a.ambiente}, ${a.categoria}, Client ID ${a.clientId}): segredo em ${a.nomeDoSegredo} ${temSegredo(a.nomeDoSegredo) ? 'presente' : 'AUSENTE'}.`);
  }
  if (s.problemas.length === 0) {
    console.log('Configuração pronta.');
    return 0;
  }
  console.log('Falta:');
  for (const p of s.problemas) console.log(`- ${p}`);
  return 1;
}

principal()
  .then((codigo) => prisma.$disconnect().then(() => process.exit(codigo)))
  .catch(async (e: unknown) => {
    console.error(`Não consegui conferir: ${e instanceof Error ? e.message : String(e)}`);
    await prisma.$disconnect();
    process.exit(1);
  });
