/**
 * Quem está na lista de Visita e Instagram: canal sem WhatsApp, fora quem pediu para sair e quem é do Bibi.
 * Uma régua só para a tela Visitas e para o número de Leads que leva até ela (decisão 472): antes o card de Leads
 * contava também quem pediu para sair, e o número não batia com a lista ao abrir.
 */

import type { Prisma } from '@prisma/client';

export const NA_LISTA_DE_VISITA = {
  canal: { in: ['VISITA', 'INSTAGRAM'] },
  status: { notIn: ['OPT_OUT', 'CONFLITO'] },
} satisfies Prisma.LeadWhereInput;
