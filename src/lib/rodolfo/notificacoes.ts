/**
 * Notificações do nível 1 no sino do shell: só contagem REAL que já existia
 * numa tela (Hoje → "Respostas sem classificar"). Sem fonte, sem sino aceso.
 */

import { prisma } from '@/lib/db';

/** Respostas recebidas que a IA ainda não classificou (as mesmas de Hoje e do Inbox). */
export function contarRespostasSemClassificar(): Promise<number> {
  return prisma.message.count({ where: { direction: 'IN', classificacao: { is: null } } });
}
