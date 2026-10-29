/**
 * Central de Integrações (INT-1.3) — o armazém do token no banco (tabela global `IntegracaoToken`, só o serviço lê). A trava
 * entre processos é do Postgres (advisory lock na transação), pelo id do app: dois processos renovando ao mesmo tempo fazem um
 * pedido só ao iFood (o segundo relê o que o primeiro gravou).
 */

import { prisma } from '@/lib/db';
import type { ArmazemDeToken } from '../ifood/auth';

/** Tempo máximo da transação que segura a trava: cobre o pedido do token ao iFood (20 s) com folga. */
const TEMPO_DA_TRAVA_MS = 45_000;

export const armazemDoBanco: ArmazemDeToken = {
  async ler(appId) {
    const t = await prisma.integracaoToken.findUnique({ where: { appId }, select: { tokenCifrado: true, emitidoEm: true, expiraEm: true } });
    return t ?? null;
  },
  async gravar(appId, t) {
    await prisma.integracaoToken.upsert({ where: { appId }, create: { appId, ...t }, update: t });
  },
  async apagar(appId) {
    await prisma.integracaoToken.deleteMany({ where: { appId } });
  },
  comTrava(appId, f) {
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`integracao-token:${appId}`}, 0))::text AS "trava"`;
        return f();
      },
      { timeout: TEMPO_DA_TRAVA_MS, maxWait: TEMPO_DA_TRAVA_MS },
    );
  },
};
