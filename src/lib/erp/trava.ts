/**
 * Trava por chave até o fim da transação (`pg_advisory_xact_lock`). A MESMA
 * para quem precisa esperar o outro: login, equipe, e o pedido de acesso (a
 * ativação em `credenciais.ts` e a recusa em `pedidos.ts` travam
 * `erp-pedido:<id>`). Ordem fixa entre chaves de tipos diferentes, em quem usa
 * mais de uma: sem deadlock.
 */

import type { Prisma } from '@prisma/client';

export async function travar(tx: Prisma.TransactionClient, chave: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))::text AS "trava"`;
}
