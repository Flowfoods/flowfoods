/**
 * Central de Integrações (INT-1.3, decisões 485 e 487) — o armazém do token no banco (tabela global `IntegracaoToken`, só o
 * serviço lê). A trava entre processos é do Postgres (advisory lock na transação), pelo id do app: dois processos renovando ao
 * mesmo tempo fazem um pedido só ao iFood (o segundo relê o que o primeiro gravou).
 *
 * Dentro da trava, ler e gravar usam a MESMA transação (a mesma conexão): o que a trava protege fica dentro dela, e um pool de
 * uma conexão só não trava. Prazos: espera pela trava até 20 s; a transação dura até 70 s, mais que o pedido do token inteiro
 * (40 s, `PRAZO_DO_PEDIDO_DE_TOKEN_MS`). Falha da trava ou da transação vira erro de autenticação com frase clara, sem detalhe
 * interno do banco.
 */

import { prisma } from '@/lib/db';
import { ErroDeAutenticacao, type ArmazemDeToken, type OperacoesDoArmazem } from '../ifood/auth';
import { ErroDeCofre } from './cofre';

const ESPERA_PELA_TRAVA_MS = 20_000;
const TEMPO_DA_TRANSACAO_MS = 70_000;

type ClienteDoToken = Pick<typeof prisma, 'integracaoToken'>;

function operacoesDe(db: ClienteDoToken): OperacoesDoArmazem {
  return {
    async ler(appId) {
      const t = await db.integracaoToken.findUnique({ where: { appId }, select: { tokenCifrado: true, emitidoEm: true, expiraEm: true } });
      return t ?? null;
    },
    async gravar(appId, t) {
      await db.integracaoToken.upsert({ where: { appId }, create: { appId, ...t }, update: t });
    },
    async apagar(appId) {
      await db.integracaoToken.deleteMany({ where: { appId } });
    },
  };
}

export const armazemDoBanco: ArmazemDeToken = {
  ...operacoesDe(prisma),
  async comTrava(appId, f) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT set_config('lock_timeout', ${String(ESPERA_PELA_TRAVA_MS)}, true) AS "espera"`;
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`integracao-token:${appId}`}, 0))::text AS "trava"`;
          return f(operacoesDe(tx as unknown as ClienteDoToken));
        },
        { timeout: TEMPO_DA_TRANSACAO_MS, maxWait: 10_000 },
      );
    } catch (e) {
      if (e instanceof ErroDeAutenticacao || e instanceof ErroDeCofre) throw e;
      throw new ErroDeAutenticacao('A trava do token no banco não respondeu a tempo (outra renovação em andamento ou banco lento). Tente de novo.');
    }
  },
};
