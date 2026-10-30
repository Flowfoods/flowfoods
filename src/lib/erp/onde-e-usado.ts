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

import type { CanalVenda, FichaTipo, Prisma, UnidadeBase } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';

/** Teto de fichas distintas exibidas; os usos de cada ficha apresentada vêm completos. */
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
  // Linhas repetidas do legado também entram inteiras, sem alterar a receita.
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

export async function ondeOInsumoEUsado(cliente: ClienteDoParceiro, insumoId: string, unidade: UnidadeBase): Promise<OndeEUsado> {
  // O teto é de fichas, não das linhas que compõem uma ficha. A mesma leitura
  // mantém seleção, total e usos coerentes se um vínculo mudar durante a consulta.
  return cliente.transacao(async (tx) => {
    const where: Prisma.FichaTecnicaWhereInput = {
      OR: [{ itens: { some: { insumoId } } }, { produtos: { some: { embalagens: { some: { insumoId } } } } }],
    };
    const [fichas, total] = await Promise.all([
      tx.fichaTecnica.findMany({
        where,
        select: { id: true, nome: true, tipo: true, ativa: true },
        orderBy: [{ ativa: 'desc' }, { nome: 'asc' }, { id: 'asc' }],
        take: TETO_DE_USOS,
      }),
      tx.fichaTecnica.count({ where }),
    ]);
    if (fichas.length === 0) return { usos: [], total, cortada: false, unidade };

    const ids = fichas.map((f) => f.id);
    const [receita, embalagem] = await Promise.all([
      tx.fichaItem.groupBy({
        by: ['fichaId'],
        where: { insumoId, fichaId: { in: ids } },
        _sum: { quantidadeMilesimos: true },
      }),
      // Um registro por ficha/canal, mesmo se vários produtos da ficha
      // usam a embalagem. O portão/RLS e a chave composta preservam o parceiro.
      tx.sql<{ fichaId: string; canal: CanalVenda }>`
        SELECT DISTINCT p."fichaId", e."canal"
        FROM "ProdutoEmbalagem" e
        JOIN "ProdutoVenda" p ON p."parceiroId" = e."parceiroId" AND p."id" = e."produtoId"
        WHERE e."parceiroId" = ${tx.parceiroId} AND e."insumoId" = ${insumoId}
          AND p."fichaId" = ANY(${ids}::text[])`,
    ]);
    const quantidades = new Map(receita.map((r) => [r.fichaId, r._sum.quantidadeMilesimos]));
    const porFicha = new Map(fichas.map((f) => [f.id, f]));
    const usos = juntarUsos(
      fichas.flatMap((f) => {
        const quantidadeMilesimos = quantidades.get(f.id);
        return quantidadeMilesimos === null || quantidadeMilesimos === undefined ? [] : [{ fichaId: f.id, nome: f.nome, tipo: f.tipo, ativa: f.ativa, quantidadeMilesimos }];
      }),
      embalagem.flatMap((e) => {
        const f = porFicha.get(e.fichaId);
        return f ? [{ fichaId: f.id, nome: f.nome, tipo: f.tipo, ativa: f.ativa, canal: e.canal }] : [];
      }),
    );
    return { usos, total, cortada: total > fichas.length, unidade };
  }, { repetivel: true });
}
