/**
 * A trava compartilhada entre o faturamento (2.1) e o fechamento do período
 * do DRE (2.2). Fechar um período é do DRE; o faturamento só OBEDECE: toda
 * escrita de faturamento (lançar, corrigir, remover, importar) pega a trava
 * COMPARTILHADA do parceiro e recusa data dentro de `PeriodoApuracao` FECHADO.
 * A 2.2, ao fechar, pega a MESMA chave em modo EXCLUSIVO (`travarParaFechar`):
 * ou a escrita de faturamento termina antes do fechamento (e entra nele), ou
 * espera o fechamento terminar (e é recusada). Não existe janela de corrida.
 *
 * Decisão 132. As duas travas vivem até o fim da transação (`pg_advisory_xact_lock*`), então
 * têm de ser pegas DENTRO de `cliente.transacao`, antes de ler o período.
 */

import { formatarData } from './compra-campos';
import type { ClienteDoParceiro } from './tenant';

const chave = (parceiroId: string) => `erp-faturamento:${parceiroId}`;

/** Escrita de faturamento: várias ao mesmo tempo, mas nenhuma durante um fechamento. */
export async function travarParaEscreverFaturamento(tx: ClienteDoParceiro): Promise<void> {
  await tx.sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${chave(tx.parceiroId)}, 0))::text AS "trava"`;
}

/** Fechamento do período (2.2): espera as escritas em curso e segura as novas. */
export async function travarParaFechar(tx: ClienteDoParceiro): Promise<void> {
  await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${chave(tx.parceiroId)}, 0))::text AS "trava"`;
}

export const fraseDoPeriodoFechado = (nome: string) => `O período ${nome} já foi fechado no DRE: não dá para lançar, corrigir nem remover nele.`;

/**
 * Das datas ("aaaa-mm-dd"), as que caem num período FECHADO, com o nome dele.
 * Uma consulta só, qualquer que seja o número de datas.
 */
export async function datasEmPeriodoFechado(tx: ClienteDoParceiro, datas: readonly string[]): Promise<Map<string, string>> {
  const fechadas = new Map<string, string>();
  if (datas.length === 0) return fechadas;
  const ordenadas = [...datas].sort();
  const periodos = await tx.periodoApuracao.findMany({
    where: {
      status: 'FECHADO',
      inicio: { lte: new Date(`${ordenadas[ordenadas.length - 1]}T00:00:00.000Z`) },
      fim: { gte: new Date(`${ordenadas[0]}T00:00:00.000Z`) },
    },
    select: { nome: true, inicio: true, fim: true },
  });
  for (const d of datas) {
    const p = periodos.find((x) => x.inicio.toISOString().slice(0, 10) <= d && x.fim.toISOString().slice(0, 10) >= d);
    if (p) fechadas.set(d, p.nome || `${formatarData(p.inicio)} a ${formatarData(p.fim)}`);
  }
  return fechadas;
}
