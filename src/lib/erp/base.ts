/**
 * PrismaClient base do ERP, SEM a trava do portal. Só dois módulos importam
 * isto (o teste-guarda reprova qualquer outro):
 *
 * - `tenant.ts` — o portão de tenant (`doParceiro`), que amarra o parceiro;
 * - `credenciais.ts` — o acesso das pessoas (login, link, rosto, sessão), que
 *   vive fora do tenant porque é lido antes de saber o parceiro.
 *
 * Um pool por processo, aberto só quando alguém usa o ERP (lazy). Cache no
 * globalThis pelo mesmo motivo de `db.ts`: o reload do Next em dev abriria um
 * pool novo a cada edição.
 */

import { PrismaClient } from '@prisma/client';

const globalDoErp = globalThis as unknown as { prismaDoTenant?: PrismaClient };

export function baseDoErp(): PrismaClient {
  if (globalDoErp.prismaDoTenant) return globalDoErp.prismaDoTenant;
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  globalDoErp.prismaDoTenant = base;
  return base;
}
