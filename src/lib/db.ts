import { PrismaClient } from '@prisma/client';
import { ErroDeTenant, ehModeloDeTenant, RELACOES_DE_TENANT } from '@/lib/erp/modelos';

/**
 * Cliente Prisma do portal (leads, portal do cliente, admin).
 *
 * TRAVADO para o ERP: qualquer operação num modelo de tenant
 * (`MODELOS_DE_TENANT`) estoura em runtime, inclusive dentro de
 * `$transaction` interativa, e o ParceiroFlow não pode ser lido/gravado pelas
 * relações de tenant (incluir `insumos` ou filtrar por `erpLojas`, por exemplo).
 * Dado de parceiro só por `doParceiro()` (`src/lib/erp/tenant.ts`), que usa
 * um PrismaClient base próprio.
 *
 * Em dev o Next recarrega o módulo a cada edição; sem o cache no globalThis
 * cada reload abriria um pool novo e o Postgres esgotaria as conexões em poucos
 * minutos de trabalho.
 */

const RELACOES = new Set<string>(RELACOES_DE_TENANT);

/** Procura, em qualquer profundidade dos args, uma CHAVE que seja relação de tenant. */
function citaRelacaoDeTenant(valor: unknown): boolean {
  if (!valor || typeof valor !== 'object' || valor instanceof Date) return false;
  if (Array.isArray(valor)) return valor.some(citaRelacaoDeTenant);
  return Object.entries(valor).some(([k, v]) => RELACOES.has(k) || citaRelacaoDeTenant(v));
}

/** Exportado para o teste com banco aplicar a mesma trava a outro cliente. */
export function travarTenant(base: PrismaClient) {
  return base.$extends({
    name: 'portal-sem-tenant',
    query: {
      $allModels: {
        $allOperations({ model, args, query }) {
          if (ehModeloDeTenant(model)) {
            throw new ErroDeTenant(`${model} só se acessa por doParceiro(), nunca pelo prisma do portal.`);
          }
          if (model === 'ParceiroFlow' && citaRelacaoDeTenant(args)) {
            throw new ErroDeTenant('relação de tenant do ParceiroFlow só se acessa por doParceiro().');
          }
          return query(args);
        },
      },
    },
  });
}

type PrismaDoPortal = ReturnType<typeof travarTenant>;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaDoPortal };

export const prisma: PrismaDoPortal =
  globalForPrisma.prisma ??
  travarTenant(
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    }),
  );

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
