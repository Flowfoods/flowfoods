import type { ClienteDoParceiro } from './tenant';

/** Lê a última versão sob a mesma trava dos writers: nem relógio anterior nem outra escrita na TX reutilizam token. */
export async function proximaVersaoDaFicha(tx: ClienteDoParceiro, id: string): Promise<Date> {
  const [atual] = await tx.sql<{ atualizadoEm: Date }>`
    SELECT "atualizadoEm" FROM "FichaTecnica"
    WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} FOR NO KEY UPDATE`;
  if (!atual) throw new Error('Ficha não encontrada ao avançar a versão.');
  return new Date(Math.max(Date.now(), atual.atualizadoEm.getTime() + 1));
}
