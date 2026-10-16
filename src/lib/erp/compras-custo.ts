/**
 * Custo pelo ÚLTIMO PREÇO de compra (1.5) — a leitura com banco.
 *
 * O custo de referência do insumo é o da nota LANÇADA mais recente que o
 * comprou (data da nota; mesma data, a lançada por último): Σ(valor + frete
 * rateado) ÷ Σ quantidade dos itens dele naquela nota. Sem nota, vale o preço
 * cadastrado (embalagem padrão, 1.1). Nada disso é gravado (decisões 53 e 57):
 * lançar, editar ou cancelar uma nota muda o custo na próxima leitura, e a
 * cascata das fichas acompanha porque ela pergunta `custoDoInsumo`.
 *
 * Uma consulta por leitura (`DISTINCT ON` no Postgres), pelo `cliente.sql` do
 * portão: debaixo da RLS, nota de outro parceiro não aparece nem se o SQL
 * esquecesse o filtro.
 */

import type { ClienteDoParceiro } from './tenant';
import { custoDaCompra } from './compra-campos';
import { compararCustos, type CustoExato } from './unidades';

export interface UltimaCompra {
  notaId: string;
  numero: string | null;
  serie: string;
  /** Data da nota ("2026-10-14"). */
  entradaEm: string;
  lancadaEm: Date;
  lojaId: string;
  fornecedor: string | null;
  valorCentavos: number;
  freteCentavos: number;
  quantidadeMilesimos: number;
  custo: CustoExato;
}

type Linha = {
  insumoId: string;
  notaId: string;
  numero: string | null;
  serie: string;
  entradaEm: Date;
  lancadaEm: Date;
  lojaId: string;
  fornecedor: string | null;
  valor: string;
  frete: string;
  quantidade: string;
};

const ID = /^[a-z0-9]{1,64}$/i;

/**
 * A última compra lançada de cada insumo pedido. `semNota`: ignora esta nota
 * (a prévia da edição compara com o mundo sem ela).
 */
export async function ultimasCompras(
  tx: ClienteDoParceiro,
  insumoIds: readonly string[],
  opcoes: { semNota?: string } = {},
): Promise<Map<string, UltimaCompra>> {
  const ids = Array.from(new Set(insumoIds.filter((x) => typeof x === 'string' && ID.test(x))));
  if (ids.length === 0) return new Map();
  const sem = opcoes.semNota ?? '';
  const linhas = await tx.sql<Linha>`
    SELECT DISTINCT ON (i."insumoId")
      i."insumoId", n."id" AS "notaId", n."numero", n."serie", n."entradaEm", n."lancadaEm", n."lojaId",
      n."fornecedorNomeSnapshot" AS "fornecedor",
      (SUM(i."valorTotalCentavos") OVER w)::text AS "valor",
      (SUM(i."freteRateadoCentavos") OVER w)::text AS "frete",
      (SUM(i."quantidadeMilesimos") OVER w)::text AS "quantidade"
    FROM "NotaEntradaItem" i
    JOIN "NotaEntrada" n ON n."parceiroId" = i."parceiroId" AND n."id" = i."notaId"
    WHERE i."parceiroId" = ${tx.parceiroId}
      AND i."insumoId" = ANY(${ids}::text[])
      AND n."status" = 'LANCADA'
      AND n."id" <> ${sem}
    WINDOW w AS (PARTITION BY i."notaId", i."insumoId")
    ORDER BY i."insumoId", n."entradaEm" DESC, n."lancadaEm" DESC, n."id" DESC`;
  const mapa = new Map<string, UltimaCompra>();
  for (const l of linhas) {
    const valor = Number(l.valor);
    const frete = Number(l.frete);
    const quantidade = Number(l.quantidade);
    const custo = custoDaCompra([{ valorCentavos: valor, freteRateadoCentavos: frete, quantidadeMilesimos: quantidade }]);
    if (!custo) continue;
    mapa.set(l.insumoId, {
      notaId: l.notaId,
      numero: l.numero,
      serie: l.serie,
      entradaEm: l.entradaEm.toISOString().slice(0, 10),
      lancadaEm: l.lancadaEm,
      lojaId: l.lojaId,
      fornecedor: l.fornecedor,
      valorCentavos: valor,
      freteCentavos: frete,
      quantidadeMilesimos: quantidade,
      custo,
    });
  }
  return mapa;
}

/** O que a cascata e as telas leem do insumo: o custo pela última compra, quando há. */
export interface ComUltimaCompra {
  id: string;
  ultimaCompra?: CustoExato | null;
}

/**
 * Anexa `ultimaCompra` (o custo exato da última nota) em cada objeto de
 * insumo, numa consulta só. Muda os próprios objetos: quem já os tem em mãos
 * (a cascata lida, a página da lista) passa a calcular pelo último preço.
 */
export async function anexarUltimasCompras<T extends ComUltimaCompra>(tx: ClienteDoParceiro, lista: readonly T[]): Promise<Map<string, UltimaCompra>> {
  const mapa = await ultimasCompras(
    tx,
    lista.map((i) => i.id),
  );
  for (const i of lista) i.ultimaCompra = mapa.get(i.id)?.custo ?? null;
  return mapa;
}

/** Uma compra do insumo, para o histórico de preços do detalhe. */
export interface CompraDoInsumo {
  notaId: string;
  rotulo: string;
  entradaEm: string;
  lojaId: string;
  lojaNome: string;
  fornecedorId: string | null;
  fornecedor: string | null;
  cancelada: boolean;
  /** "Caixa · 5 kg" (a primeira linha do insumo na nota) e quantas linhas foram. */
  embalagem: string;
  quantidadeMilesimos: number;
  valorCentavos: number;
  freteCentavos: number;
  custo: CustoExato | null;
}

/**
 * As últimas compras do insumo (lançadas e canceladas, a mais nova primeiro)
 * e o último preço de cada fornecedor entre as lançadas, do mais barato ao
 * mais caro (Notion Core: comparar preço por fornecedor a partir do histórico).
 */
export async function comprasDoInsumo(tx: ClienteDoParceiro, insumoId: string, limite = 30) {
  const itens = await tx.notaEntradaItem.findMany({
    where: { insumoId, nota: { status: { in: ['LANCADA', 'CANCELADA'] } } },
    orderBy: [{ nota: { entradaEm: 'desc' } }, { nota: { lancadaEm: 'desc' } }, { notaId: 'desc' }, { ordem: 'asc' }],
    take: limite * 2,
    select: {
      notaId: true,
      embalagemSnapshot: true,
      quantidadeMilesimos: true,
      valorTotalCentavos: true,
      freteRateadoCentavos: true,
      nota: {
        select: {
          numero: true,
          serie: true,
          entradaEm: true,
          status: true,
          lojaId: true,
          fornecedorId: true,
          fornecedorNomeSnapshot: true,
          loja: { select: { nome: true } },
        },
      },
    },
  });
  const porNota = new Map<string, CompraDoInsumo>();
  for (const i of itens) {
    const ja = porNota.get(i.notaId);
    if (ja) {
      ja.quantidadeMilesimos += i.quantidadeMilesimos;
      ja.valorCentavos += i.valorTotalCentavos;
      ja.freteCentavos += i.freteRateadoCentavos;
      ja.custo = custoDaCompra([{ valorCentavos: ja.valorCentavos, freteRateadoCentavos: ja.freteCentavos, quantidadeMilesimos: ja.quantidadeMilesimos }]);
      continue;
    }
    if (porNota.size >= limite) continue;
    porNota.set(i.notaId, {
      notaId: i.notaId,
      rotulo: `${i.nota.numero ?? 's/n'}${i.nota.serie ? `-${i.nota.serie}` : ''}`,
      entradaEm: i.nota.entradaEm.toISOString().slice(0, 10),
      lojaId: i.nota.lojaId,
      lojaNome: i.nota.loja.nome,
      fornecedorId: i.nota.fornecedorId,
      fornecedor: i.nota.fornecedorNomeSnapshot,
      cancelada: i.nota.status === 'CANCELADA',
      embalagem: i.embalagemSnapshot ?? '',
      quantidadeMilesimos: i.quantidadeMilesimos,
      valorCentavos: i.valorTotalCentavos,
      freteCentavos: i.freteRateadoCentavos,
      custo: custoDaCompra([{ valorCentavos: i.valorTotalCentavos, freteRateadoCentavos: i.freteRateadoCentavos, quantidadeMilesimos: i.quantidadeMilesimos }]),
    });
  }
  const compras = Array.from(porNota.values());
  // Último preço de cada fornecedor (a lista já vem da mais nova para a mais velha).
  const porFornecedor = new Map<string, CompraDoInsumo>();
  for (const c of compras) if (!c.cancelada && c.custo && !porFornecedor.has(c.fornecedorId ?? c.fornecedor ?? '?')) porFornecedor.set(c.fornecedorId ?? c.fornecedor ?? '?', c);
  const fornecedores = Array.from(porFornecedor.values()).sort((a, b) => compararCustos(a.custo!, b.custo!));
  return { compras, fornecedores };
}
