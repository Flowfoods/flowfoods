/**
 * Reorganização de 24/10/2026 — "Onde é usado": as fichas técnicas que levam
 * o insumo (na receita) e os pratos que o usam como embalagem de um canal.
 *
 * É a continuidade da jornada insumo → ficha: antes de mudar um cadastro
 * compartilhado, a pessoa vê o alcance da mudança e abre a ficha com um toque.
 * Só leitura, dentro do cliente do parceiro (o portão e a RLS): nunca mostra
 * ficha de outro parceiro. Sem custo nem preço: quantidade e canal não são
 * dado financeiro, então a cozinha também lê (quem decide se o painel aparece
 * é a permissão de ver fichas, conferida na página).
 */

import type { CanalVenda, FichaTipo, UnidadeBase } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';

/** Teto de linhas lidas por consulta: insumo muito usado mostra as primeiras e diz quantas são no total. */
export const TETO_DE_USOS = 200;

export interface UsoDoInsumo {
  fichaId: string;
  nome: string;
  tipo: FichaTipo;
  ativa: boolean;
  /** Quantidade líquida na receita (na unidade do insumo); null = não está na receita, só na embalagem. */
  naReceitaMilesimos: number | null;
  /** Canais em que o insumo é embalagem do prato (ordem fixa: loja, delivery, iFood). */
  embalagemEm: CanalVenda[];
}

export interface OndeEUsado {
  usos: UsoDoInsumo[];
  /** Fichas distintas que usam o insumo (pode passar do que foi listado). */
  total: number;
  /** A lista foi cortada no teto. */
  cortada: boolean;
  unidade: UnidadeBase;
}

const ORDEM: CanalVenda[] = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'];

/** Junta as duas origens por ficha. Puro (testável sem banco). */
export function juntarUsos(
  receita: { fichaId: string; nome: string; tipo: FichaTipo; ativa: boolean; quantidadeMilesimos: number }[],
  embalagem: { fichaId: string; nome: string; tipo: FichaTipo; ativa: boolean; canal: CanalVenda }[],
): UsoDoInsumo[] {
  const porFicha = new Map<string, UsoDoInsumo>();
  const pegar = (r: { fichaId: string; nome: string; tipo: FichaTipo; ativa: boolean }) => {
    let u = porFicha.get(r.fichaId);
    if (!u) {
      u = { fichaId: r.fichaId, nome: r.nome, tipo: r.tipo, ativa: r.ativa, naReceitaMilesimos: null, embalagemEm: [] };
      porFicha.set(r.fichaId, u);
    }
    return u;
  };
  // A mesma ficha pode ter o insumo em mais de uma linha (raro, mas a ficha aceita): soma.
  for (const r of receita) {
    const u = pegar(r);
    u.naReceitaMilesimos = (u.naReceitaMilesimos ?? 0) + r.quantidadeMilesimos;
  }
  for (const e of embalagem) {
    const u = pegar(e);
    if (!u.embalagemEm.includes(e.canal)) u.embalagemEm.push(e.canal);
  }
  for (const u of porFicha.values()) u.embalagemEm.sort((a, b) => ORDEM.indexOf(a) - ORDEM.indexOf(b));
  // Ativas primeiro; dentro de cada grupo, pelo nome (pt-BR, sem diferenciar acento de caixa).
  return Array.from(porFicha.values()).sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

export async function ondeOInsumoEUsado(tx: ClienteDoParceiro, insumoId: string, unidade: UnidadeBase): Promise<OndeEUsado> {
  const [linhas, embalagens, total] = await Promise.all([
    tx.fichaItem.findMany({
      where: { insumoId },
      select: { quantidadeMilesimos: true, ficha: { select: { id: true, nome: true, tipo: true, ativa: true } } },
      orderBy: { fichaId: 'asc' },
      take: TETO_DE_USOS,
    }),
    tx.produtoEmbalagem.findMany({
      where: { insumoId },
      select: { canal: true, produto: { select: { ficha: { select: { id: true, nome: true, tipo: true, ativa: true } } } } },
      orderBy: { produtoId: 'asc' },
      take: TETO_DE_USOS,
    }),
    tx.sql<{ n: number }>`
      SELECT count(*)::int AS "n" FROM (
        SELECT "fichaId" FROM "FichaItem" WHERE "parceiroId" = ${tx.parceiroId} AND "insumoId" = ${insumoId}
        UNION
        SELECT p."fichaId" FROM "ProdutoEmbalagem" e
          JOIN "ProdutoVenda" p ON p."parceiroId" = e."parceiroId" AND p."id" = e."produtoId"
          WHERE e."parceiroId" = ${tx.parceiroId} AND e."insumoId" = ${insumoId}
      ) f`,
  ]);
  const usos = juntarUsos(
    linhas.map((l) => ({ fichaId: l.ficha.id, nome: l.ficha.nome, tipo: l.ficha.tipo, ativa: l.ficha.ativa, quantidadeMilesimos: l.quantidadeMilesimos })),
    embalagens.map((e) => ({ fichaId: e.produto.ficha.id, nome: e.produto.ficha.nome, tipo: e.produto.ficha.tipo, ativa: e.produto.ficha.ativa, canal: e.canal })),
  );
  const n = total[0]?.n ?? usos.length;
  return { usos, total: Math.max(n, usos.length), cortada: linhas.length >= TETO_DE_USOS || embalagens.length >= TETO_DE_USOS, unidade };
}
