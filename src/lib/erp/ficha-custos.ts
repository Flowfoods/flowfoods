/**
 * Custo em cascata com banco (1.3): lê as fichas por nível (as pedidas, os
 * pré-preparos que elas usam, os que esses usam...), uma consulta por nível
 * (`id in [...]`), no máximo `PROFUNDIDADE_MAXIMA`. A lista de 50 fichas com
 * pré-preparos custa as mesmas ≤ 6 idas ao banco que uma ficha só: nada de uma
 * consulta por item. A conta é a pura (`ficha-cascata.ts`), com memória: cada
 * ficha é calculada uma vez por leitura.
 *
 * Tudo pelo portão: pré-preparo de outro parceiro não é lido (e o banco nem
 * deixa um item apontar para ele: FK composta).
 */

import type { ClienteDoParceiro } from './tenant';
import { cascataDeCusto, PROFUNDIDADE_MAXIMA, type FichaDaCascata } from './ficha-cascata';
import type { TipoFicha } from './ficha-campos';
import type { Unidade } from './unidades';
import { anexarUltimasCompras } from './compras-custo';

export const SELECAO_DO_INSUMO = {
  id: true,
  nome: true,
  unidade: true,
  ativo: true,
  conteudoMilesimos: true,
  precoEmbalagemCentavos: true,
  taxaEntregaCentavos: true,
} as const;

/** O que a cascata lê de cada item (também serve à lista e ao detalhe). */
export const SELECAO_DO_ITEM = {
  id: true,
  quantidadeMilesimos: true,
  fatorCorrecaoMilesimos: true,
  insumoId: true,
  subfichaId: true,
  insumo: { select: SELECAO_DO_INSUMO },
} as const;

const SELECAO_DA_CASCATA = {
  id: true,
  nome: true,
  tipo: true,
  ativa: true,
  rendimentoMilesimos: true,
  unidadeRendimento: true,
  itens: { orderBy: { ordem: 'asc' as const }, select: SELECAO_DO_ITEM },
} as const;

/** Ficha lida para a cascata: a conta + o que a tela diz do pré-preparo (rende em quê, ativo). */
export interface FichaLida extends FichaDaCascata {
  tipo: TipoFicha;
  ativa: boolean;
  unidadeRendimento: Unidade;
}

/**
 * As fichas pedidas e tudo o que elas usam, até o fundo. `jaLidas`: fichas que
 * quem chama já tem (com os itens), para não ler de novo.
 */
export async function lerCascata(
  tx: ClienteDoParceiro,
  ids: readonly string[],
  jaLidas: readonly FichaLida[] = [],
): Promise<Map<string, FichaLida>> {
  const mapa = new Map<string, FichaLida>(jaLidas.map((f) => [f.id, f]));
  const pendentes = (fichas: Iterable<FichaDaCascata>) =>
    Array.from(new Set(Array.from(fichas).flatMap((f) => f.itens.map((i) => i.subfichaId).filter((x): x is string => !!x && !mapa.has(x)))));
  let faltam = Array.from(new Set([...ids.filter((id) => !mapa.has(id)), ...pendentes(mapa.values())]));
  // Raízes + até PROFUNDIDADE_MAXIMA níveis abaixo (o grafo gravado nunca passa disso).
  for (let nivel = 0; nivel <= PROFUNDIDADE_MAXIMA && faltam.length > 0; nivel++) {
    const lidas = await tx.fichaTecnica.findMany({ where: { id: { in: faltam } }, select: SELECAO_DA_CASCATA });
    for (const f of lidas) mapa.set(f.id, f);
    faltam = pendentes(lidas);
  }
  // 1.5: o custo de cada insumo é o da última compra (uma consulta para a leitura inteira).
  const insumos = Array.from(mapa.values()).flatMap((f) => f.itens.map((i) => i.insumo).filter((x): x is NonNullable<typeof x> => !!x));
  if (insumos.length > 0) await anexarUltimasCompras(tx, insumos as (typeof insumos[number] & { id: string })[]);
  return mapa;
}

/** Leitura + calculadora com memória, prontas para usar numa tela. */
export async function custosEmCascata(tx: ClienteDoParceiro, ids: readonly string[], jaLidas: readonly FichaLida[] = []) {
  const fichas = await lerCascata(tx, ids, jaLidas);
  return { fichas, ...cascataDeCusto(fichas) };
}
