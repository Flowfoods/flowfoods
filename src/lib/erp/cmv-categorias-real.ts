/**
 * O CMV REAL por categoria (I.2b, decisões 286 a 289) — a leitura com banco. A mesma conta da 2.3, aberta por insumo:
 *
 *   real da categoria = estoque inicial + entradas de compra do livro − estoque final
 *
 *  - o estoque FINAL de uma categoria é o retrato do fechamento (`ContagemRetratoItem`, por insumo) corrigido pelo MESMO corte do real
 *    do DRE (`cortesDosFechamentos`, decisão 162): o que entrou depois do retrato e é do período soma, o que o retrato já trazia do
 *    período seguinte sai. O corte é uma conta só, aberta por categoria; a soma das categorias é o corte inteiro;
 *  - o estoque INICIAL é o final do período anterior (retrato do fechamento anterior com o corte dele) ou, no primeiro período, a
 *    abertura: o retrato dela ou, para a abertura de antes da I.2a, os movimentos `ABERTURA` por insumo, SÓ se somarem o valor total
 *    da contagem ao centavo (senão a loja fica pelas compras: nunca se inventa);
 *  - a categoria é a de HOJE do insumo em todas as parcelas (decisão 270). Insumo PRÉ-PREPARO (tipo de hoje) vai à linha própria:
 *    estoque, entradas e saídas dele não entram em categoria nenhuma;
 *  - a loja só abre por categoria quando os DOIS retratos existem e a soma de todas as categorias (com sem categoria e pré-preparos)
 *    é o real do DRE dela, ao centavo. Qualquer divergência vira "não abriu", com o motivo, e a diferença vai para a variação.
 *
 * As consultas são agrupadas (o número delas é o mesmo com 1 ou com 50 lojas e com 1 ou 6 períodos): os retratos, os movimentos da
 * abertura antiga, o corte e as entradas do livro, todos de uma vez para todos os pedidos.
 */

import { cortesDosFechamentos } from './cmv';
import { realDoMontante, type MontantesDoEstoque, type RealDaLoja } from './cmv-categorias-campos';
import type { ClienteDoParceiro } from './tenant';

const numero = (v: unknown) => Number(v ?? 0);

/** Uma loja num período, com o que o real do DRE dela já sabe. */
export interface PedidoDoReal {
  lojaId: string;
  inicio: string;
  fim: string;
  /** O CMV real da loja no DRE: a soma das categorias tem de fechar nele. */
  realCentavos: number;
  fechamentoId: string;
  /** Nulo quando o estoque inicial veio da abertura. */
  fechamentoAnteriorId: string | null;
  aberturaId: string | null;
  inicialDe: 'fechamento' | 'abertura';
}

export type RealAberto = { aberto: true; real: RealDaLoja } | { aberto: false; motivo: string };

export const chaveDoPedido = (p: { lojaId: string; inicio: string }) => `${p.lojaId}|${p.inicio}`;

/** Chave interna de um insumo no mapa de estoque: categoria (c:<id>), sem categoria (s) ou pré-preparo (p). */
const chaveInterna = (categoriaId: string | null, preparo: boolean) => (preparo ? 'p' : categoriaId === null ? 's' : `c:${categoriaId}`);
const categoriaDaChave = (k: string): string | null => (k === 's' ? null : k.slice(2));

type Estoque = Map<string, number>;
const somar = (m: Estoque, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

interface Retratos {
  /** contagemId → valor por chave interna. Só as contagens com retrato válido (soma = valor total). */
  valores: Map<string, Estoque>;
  /** contagemId → por que não vale (ausente do mapa de valores). */
  invalidos: Map<string, string>;
}

/** Os retratos por insumo de uma lista de contagens (fechamentos e aberturas), somados por categoria; a abertura antiga lê o livro. */
async function lerRetratos(tx: ClienteDoParceiro, contagemIds: readonly string[], aberturaIds: ReadonlySet<string>): Promise<Retratos> {
  const valores = new Map<string, Estoque>();
  const invalidos = new Map<string, string>();
  if (contagemIds.length === 0) return { valores, invalidos };
  const contagens = await tx.contagem.findMany({ where: { id: { in: [...contagemIds] } }, select: { id: true, retratoGravadoEm: true, valorTotalCentavos: true } });
  const comRetrato = contagens.filter((c) => c.retratoGravadoEm !== null).map((c) => c.id);
  const antigas = contagens.filter((c) => c.retratoGravadoEm === null && aberturaIds.has(c.id)).map((c) => c.id);

  if (comRetrato.length > 0) {
    const linhas = await tx.sql<{ contagemId: string; categoriaId: string | null; preparo: boolean; centavos: bigint }>`
      SELECT r."contagemId", ins."categoriaId", (ins."tipo" = 'PRE_PREPARO') AS "preparo", coalesce(sum(r."valorCentavos"), 0)::bigint AS "centavos"
      FROM "ContagemRetratoItem" r
      JOIN "Insumo" ins ON ins."parceiroId" = r."parceiroId" AND ins."id" = r."insumoId"
      WHERE r."parceiroId" = ${tx.parceiroId} AND r."contagemId" = ANY(${comRetrato}::text[])
      GROUP BY r."contagemId", ins."categoriaId", (ins."tipo" = 'PRE_PREPARO')`;
    for (const l of linhas) {
      if (!valores.has(l.contagemId)) valores.set(l.contagemId, new Map());
      somar(valores.get(l.contagemId)!, chaveInterna(l.categoriaId, l.preparo), numero(l.centavos));
    }
  }
  if (antigas.length > 0) {
    // A abertura de antes do retrato por insumo: os movimentos ABERTURA dela, um por insumo contado (o valor é o que a contagem fotografou).
    const linhas = await tx.sql<{ contagemId: string; categoriaId: string | null; preparo: boolean; centavos: bigint }>`
      SELECT ci."contagemId", ins."categoriaId", (ins."tipo" = 'PRE_PREPARO') AS "preparo", coalesce(sum(m."valorCentavos"), 0)::bigint AS "centavos"
      FROM "MovimentoEstoque" m
      JOIN "ContagemItem" ci ON ci."parceiroId" = m."parceiroId" AND ci."id" = m."contagemItemId"
      JOIN "Insumo" ins ON ins."parceiroId" = m."parceiroId" AND ins."id" = m."insumoId"
      WHERE m."parceiroId" = ${tx.parceiroId} AND m."tipo" = 'ABERTURA' AND ci."contagemId" = ANY(${antigas}::text[])
      GROUP BY ci."contagemId", ins."categoriaId", (ins."tipo" = 'PRE_PREPARO')`;
    for (const l of linhas) {
      if (!valores.has(l.contagemId)) valores.set(l.contagemId, new Map());
      somar(valores.get(l.contagemId)!, chaveInterna(l.categoriaId, l.preparo), numero(l.centavos));
    }
  }
  // A soma tem de ser o valor total que a contagem fotografou, ao centavo; senão, não vale (e diz por quê).
  for (const c of contagens) {
    const soma = Array.from(valores.get(c.id)?.values() ?? []).reduce((s, v) => s + v, 0);
    if (c.retratoGravadoEm === null && !aberturaIds.has(c.id)) invalidos.set(c.id, 'sem-retrato');
    else if (c.valorTotalCentavos === null || soma !== c.valorTotalCentavos) {
      invalidos.set(c.id, c.retratoGravadoEm === null ? (aberturaIds.has(c.id) ? 'abertura-nao-fecha' : 'sem-retrato') : 'retrato-nao-fecha');
      valores.delete(c.id);
    } else if (!valores.has(c.id)) valores.set(c.id, new Map()); // retrato de zero insumos com saldo: estoque zerado, que vale
  }
  for (const id of contagemIds) if (!valores.has(id) && !invalidos.has(id)) invalidos.set(id, 'sem-retrato');
  return { valores, invalidos };
}

const MOTIVOS: Record<string, { final: string; inicial: string }> = {
  'sem-retrato': { final: 'o fechamento de estoque é de antes do retrato por insumo', inicial: 'o estoque inicial é de antes do retrato por insumo' },
  'abertura-nao-fecha': { final: 'a abertura do estoque não fecha com o livro', inicial: 'a abertura do estoque não fecha com o livro' },
  'retrato-nao-fecha': { final: 'o retrato por insumo não fecha com o valor do fechamento', inicial: 'o retrato por insumo do estoque inicial não fecha com o valor do fechamento' },
};

/**
 * O real aberto por categoria de cada pedido (loja × período encerrado com o real no DRE). Pedido sem os dois retratos, ou cuja soma
 * não fecha no real do DRE, volta `aberto: false` com o motivo. Nada é gravado.
 */
export async function realPorCategoria(tx: ClienteDoParceiro, pedidos: readonly PedidoDoReal[]): Promise<Map<string, RealAberto>> {
  const saida = new Map<string, RealAberto>();
  if (pedidos.length === 0) return saida;

  const aberturas = new Set(pedidos.filter((p) => p.inicialDe === 'abertura' && p.aberturaId).map((p) => p.aberturaId!));
  const fechamentos = Array.from(new Set(pedidos.flatMap((p) => [p.fechamentoId, ...(p.fechamentoAnteriorId ? [p.fechamentoAnteriorId] : [])])));
  const retratos = await lerRetratos(tx, [...fechamentos, ...aberturas], aberturas);

  // O corte do estoque final (decisão 162), aberto por categoria: o mesmo SQL do real do DRE.
  const cortes = new Map<string, Estoque>();
  for (const c of await cortesDosFechamentos(tx, fechamentos)) {
    if (!cortes.has(c.fechamentoId)) cortes.set(c.fechamentoId, new Map());
    somar(cortes.get(c.fechamentoId)!, chaveInterna(c.categoriaId, c.preparo), c.depois - c.antes);
  }
  const estoqueFinalDe = (fechamentoId: string): Estoque | null => {
    const retrato = retratos.valores.get(fechamentoId);
    if (!retrato) return null;
    const out: Estoque = new Map(retrato);
    for (const [k, v] of cortes.get(fechamentoId) ?? []) somar(out, k, v);
    return out;
  };

  // As entradas de compra do livro de cada loja e período (a data da nota decide o período), por categoria.
  const entradas = new Map<string, Estoque>();
  const linhas = await tx.sql<{ lojaId: string; inicio: string; categoriaId: string | null; preparo: boolean; centavos: bigint }>`
    SELECT p."lojaId", p."inicio"::text AS "inicio", ins."categoriaId", (ins."tipo" = 'PRE_PREPARO') AS "preparo", sum(m."valorCentavos")::bigint AS "centavos"
    FROM unnest(${pedidos.map((p) => p.lojaId)}::text[], ${pedidos.map((p) => p.inicio)}::date[], ${pedidos.map((p) => p.fim)}::date[]) AS p("lojaId", "inicio", "fim")
    JOIN "NotaEntrada" n ON n."parceiroId" = ${tx.parceiroId} AND n."entradaEm" >= p."inicio" AND n."entradaEm" <= p."fim"
    JOIN "MovimentoEstoque" m ON m."parceiroId" = n."parceiroId" AND m."notaId" = n."id" AND m."lojaId" = p."lojaId" AND m."tipo" = 'ENTRADA_COMPRA'
    JOIN "Insumo" ins ON ins."parceiroId" = m."parceiroId" AND ins."id" = m."insumoId"
    GROUP BY p."lojaId", p."inicio", ins."categoriaId", (ins."tipo" = 'PRE_PREPARO')`;
  for (const l of linhas) {
    const k = chaveDoPedido(l);
    if (!entradas.has(k)) entradas.set(k, new Map());
    somar(entradas.get(k)!, chaveInterna(l.categoriaId, l.preparo), numero(l.centavos));
  }

  for (const p of pedidos) {
    const final = estoqueFinalDe(p.fechamentoId);
    if (!final) {
      saida.set(chaveDoPedido(p), { aberto: false, motivo: MOTIVOS[retratos.invalidos.get(p.fechamentoId) ?? 'sem-retrato'].final });
      continue;
    }
    const inicial = p.inicialDe === 'fechamento' && p.fechamentoAnteriorId ? estoqueFinalDe(p.fechamentoAnteriorId) : p.aberturaId ? (retratos.valores.get(p.aberturaId) ?? null) : null;
    if (!inicial) {
      const id = p.inicialDe === 'fechamento' ? p.fechamentoAnteriorId : p.aberturaId;
      saida.set(chaveDoPedido(p), { aberto: false, motivo: MOTIVOS[(id && retratos.invalidos.get(id)) || 'sem-retrato'].inicial });
      continue;
    }
    const doLivro = entradas.get(chaveDoPedido(p)) ?? new Map<string, number>();
    const chaves = new Set([...final.keys(), ...inicial.keys(), ...doLivro.keys()]);
    const categorias = new Map<string | null, MontantesDoEstoque>();
    let preparos: MontantesDoEstoque = { inicial: 0, entradas: 0, final: 0 };
    for (const k of chaves) {
      const m: MontantesDoEstoque = { inicial: inicial.get(k) ?? 0, entradas: doLivro.get(k) ?? 0, final: final.get(k) ?? 0 };
      if (k === 'p') preparos = m;
      else categorias.set(categoriaDaChave(k), m);
    }
    const soma = Array.from(categorias.values()).reduce((s, m) => s + realDoMontante(m), 0) + realDoMontante(preparos);
    // A soma das categorias é o real do DRE ao centavo; se não for, não se mostra número que não fecha.
    if (soma !== p.realCentavos) {
      saida.set(chaveDoPedido(p), { aberto: false, motivo: 'a soma por categoria não fecha com o CMV real do DRE' });
      continue;
    }
    saida.set(chaveDoPedido(p), { aberto: true, real: { categorias, preparos } });
  }
  return saida;
}
