/** Operação administrativa no servidor. Nunca imprime ambiente, URL, token ou payload. */
import { prisma } from '../src/lib/db';
import { controleAnalytics, pausarAnalytics } from '../src/lib/integracoes/core/controle-analytics';
import { integracaoIfoodAtiva } from '../src/lib/integracoes/core/cofre';

async function principal(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--estado') {
    const controle = await controleAnalytics();
    console.log(JSON.stringify({ chaveGeralLigada: integracaoIfoodAtiva(), pausaPersistente: controle.pausada, retomadaMinimaEm: controle.bloqueadaAte, atualizadoEm: controle.atualizadoEm }, null, 2));
    return;
  }
  if (args.length === 3 && ['--pausar', '--retomar'].includes(args[0]) && args[1] === '--autor' && args[2].trim()) {
    await pausarAnalytics(args[0] === '--pausar', args[2]);
    console.log(args[0] === '--pausar' ? 'Coleta pausada. Dados e evidências preservados.' : 'Pausa removida. A chave geral e as autorizações continuam obrigatórias.');
    return;
  }
  console.error('Use --estado, --pausar --autor "Responsável" ou --retomar --autor "Responsável".');
  process.exitCode = 2;
}
principal().catch(() => {
  console.error('Não foi possível operar o controle Analytics. Nenhuma credencial foi exibida.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
