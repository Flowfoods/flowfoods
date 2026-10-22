/**
 * O retrato do estoque POR INSUMO (I.2a, decisão 280) — gravado na MESMA transação que conclui uma abertura ou um fechamento de
 * estoque, junto com o total que a contagem já fotografava (`valorTotalCentavos`). Uma linha por insumo com saldo: a quantidade, o
 * valor pelo custo de referência da hora (nulo = insumo sem preço) e a categoria e o tipo DA HORA. A soma dos valores é o total
 * da contagem, ao centavo: o gatilho do banco só deixa a contagem registrar `retratoGravadoEm` se a soma bater.
 *
 * Por que já na I.2a, mesmo sem tela: cada fechamento que passa sem o retrato por insumo atrasa o CMV real por categoria (I.2b)
 * em um período. Contagem de antes do deploy fica sem retrato (`retratoGravadoEm` nulo) e NÃO é reconstruída: o preço da época
 * não existe, e reconstruir seria inventar.
 */

import type { InsumoTipo } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';

export interface ItemDoRetrato {
  insumoId: string;
  /** Milésimos da unidade base; sempre maior que zero (insumo sem saldo não entra). */
  quantidadeMilesimos: number;
  /** Nulo = sem preço (a tela diz "sem preço", nunca R$ 0,00). */
  valorCentavos: number | null;
}

/** A soma dos valores do retrato, que tem de ser o total fotografado da contagem. */
export const somaDoRetrato = (itens: readonly ItemDoRetrato[]) => itens.reduce((s, i) => s + (i.valorCentavos ?? 0), 0);

const LOTE = 500;

/**
 * Grava o retrato da contagem (ainda ABERTA: o gatilho só aceita linha nova enquanto a contagem está sendo concluída) e devolve
 * quantas linhas entraram. Confere a soma antes de gravar: se não for o total, nada vai para o banco (é defeito de quem chama).
 */
export async function gravarRetrato(tx: ClienteDoParceiro, contagemId: string, itens: readonly ItemDoRetrato[], valorTotalCentavos: number): Promise<number> {
  if (somaDoRetrato(itens) !== valorTotalCentavos) {
    throw new Error(`[erp] a soma do retrato por insumo (${somaDoRetrato(itens)}) não é o valor total da contagem (${valorTotalCentavos}).`);
  }
  if (itens.length === 0) return 0;
  // A categoria e o tipo de agora de cada insumo: é a "da hora" (a contagem está sendo concluída agora).
  const ids = itens.map((i) => i.insumoId);
  const insumos = new Map<string, { categoriaId: string | null; tipo: InsumoTipo }>();
  for (let i = 0; i < ids.length; i += 2000) {
    const lidos = await tx.insumo.findMany({ where: { id: { in: ids.slice(i, i + 2000) } }, select: { id: true, categoriaId: true, tipo: true } });
    for (const l of lidos) insumos.set(l.id, { categoriaId: l.categoriaId, tipo: l.tipo });
  }
  for (let i = 0; i < itens.length; i += LOTE) {
    await tx.contagemRetratoItem.createMany({
      data: itens.slice(i, i + LOTE).map((it) => {
        const ins = insumos.get(it.insumoId);
        if (!ins) throw new Error('[erp] insumo do retrato não encontrado.');
        return { parceiroId: tx.parceiroId, contagemId, insumoId: it.insumoId, categoriaIdNaHora: ins.categoriaId, tipoNaHora: ins.tipo, quantidadeMilesimos: it.quantidadeMilesimos, valorCentavos: it.valorCentavos };
      }),
    });
  }
  return itens.length;
}
