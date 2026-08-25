/**
 * Chaves de deduplicação.
 *
 * O outbox tem `dedupKey` UNIQUE no banco. A unicidade mora no Postgres, não
 * aqui: worker reiniciado no meio de um lote, webhook repetido pela Evolution e
 * dois cliques em "Aprovar" são todos normais, e em todos a segunda tentativa
 * precisa bater numa constraint, não na boa vontade do código.
 */

import type { DateTime } from 'luxon';
import { TIMEZONE } from './regras';
import type { Toque } from './regras';

/**
 * `leadId:toque:data`. A data é o dia em America/Sao_Paulo — o mesmo fuso da
 * contagem de teto, senão o "mesmo dia" do dedup discordaria do "mesmo dia" do
 * DailyCounter depois das 21h.
 */
export function dedupKeyEnvio(leadId: string, toque: Toque, quando: DateTime): string {
  const dia = quando.setZone(TIMEZONE).toFormat('yyyy-LL-dd');
  return `${leadId}:${toque}:${dia}`;
}

/** Idempotência do webhook: um `evolutionMessageId` é processado uma vez só. */
export function dedupKeyWebhook(evolutionMessageId: string, evento: string): string {
  return `wh:${evento}:${evolutionMessageId}`;
}
