/**
 * Conferência manual de leitura Review v2 em TEST, dentro do worker.
 * Carregue o cofre com . ./scripts/exportar-segredos.sh no mesmo shell.
 * Saída 0: amostra conferida ou janela vazia confirmada. 1: execução inconclusiva ou auditoria indisponível.
 * Saída 2: recusada antes de consultar.
 */
import { prisma } from '@/lib/db';
import { appPorId } from '@/lib/integracoes/core/apps';
import { armazemDoBanco } from '@/lib/integracoes/core/armazem-token';
import { executarConferenciaReviewTest } from '@/lib/integracoes/ifood/conferencia-review-test';
import { transporteFetch } from '@/lib/integracoes/ifood/transporte';

async function principal() {
  try {
    const resultado = await executarConferenciaReviewTest(process.argv.slice(2), {
      env: process.env, buscarApp: appPorId, armazem: armazemDoBanco, transporte: transporteFetch,
      registrar: async dados => {
        await prisma.auditLog.create({ data: { evento: 'integracao.conferencia-review-test', dados } });
      },
    });
    if (resultado.codigo === 2) {
      console.error(JSON.stringify(resultado));
      if (resultado.motivo === 'argumentos-invalidos') {
        console.error('Use --app-id <id cadastrado> --loja <uuid> --de <instante ISO com fuso> --ate <instante ISO com fuso>.');
      }
    } else {
      console.log(JSON.stringify(resultado));
    }
    process.exitCode = resultado.codigo;
  } catch {
    console.error('A conferência Review TEST parou por falha local.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {
      console.error('Não foi possível encerrar a conexão da conferência.');
      process.exitCode = 1;
    });
  }
}

void principal();
