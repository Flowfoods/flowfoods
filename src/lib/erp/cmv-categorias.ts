/**
 * CMV gerencial por categoria (I.2a, decisões 270 a 283) — a leitura com banco. O CMV do DRE aberto em categorias, PELAS COMPRAS:
 * cada item de nota lançada cai numa categoria só (a de HOJE do insumo, em todas as parcelas), e a soma das categorias é a linha
 * `cmv` do DRE, ao centavo. A DRE não muda: este painel é leitura.
 *
 * A mesma transação lê o DRE (`dreDoPeriodoNaTx`) e as compras por categoria, então o total e a soma saem do MESMO instante.
 * As consultas são agrupadas por loja e categoria (o número delas é o mesmo com 1 ou com 50 lojas).
 *
 *  - período em curso ou encerrado ainda aberto: ao vivo. Encerrado sem o real aberto por categoria: as categorias pelas compras e a linha
 *    "Variação do estoque, ainda não aberta por categoria", para o total nunca divergir do DRE em silêncio;
 *  - período FECHADO: só a fotografia v4 (`entrada.categorias`), com o nome e o id da categoria da época; as fotografias antigas
 *    (v1 a v3) dizem "não apurado por categoria (fechado antes da I.2)" e nunca são recalculadas;
 *  - quem vê: `dre.ver` na loja (a rede, só com a rede inteira); o gerente de uma loja recebe só a dela, também no fechado.
 */

import { CHAVE_DO_SISTEMA } from './categoria-campos';
import { valeDaLoja, type CmvDoDre } from './cmv-campos';
import { realPorCategoria, type PedidoDoReal } from './cmv-categorias-real';
import {
  categoriasLidasDaFotografia,
  categoriasParaGravar,
  CHAVE_DOS_PREPARADOS,
  montarEvolucao,
  montarPainelDeCategorias,
  type CategoriaDoPainel,
  type CategoriasGravadas,
  type EvolucaoDeCategorias,
  type LojaNoPainel,
  type PainelDeCategorias,
} from './cmv-categorias-campos';
import { somarDias } from './contagem-campos';
import { hojeNoRio } from './compra-campos';
import { dreDoPeriodoNaTx, recusaDoDre, type DreDoPeriodo, type PedidoDoEscopo } from './dre';
import type { LinhaDoDre } from './dre-campos';
import type { ComparacaoComMeta } from './dre-metas-campos';
import { faixasDaVersao, FAIXAS_DO_FAROL } from './farol-campos';
import type { FarolDaLinha } from './farol-dre-campos';
import { conjuntosVigentes, categoriasQueNaoUsa, metasDaLoja } from './metas-categorias';
import { alcancaLoja, type Alcance } from './permissoes';
import type { Periodo } from './periodo-campos';
import type { ClienteDoParceiro } from './tenant';

// ================================================================ as leituras

/** As categorias da casa (todas, na ordem dela). */
export async function categoriasDoPainel(tx: ClienteDoParceiro): Promise<CategoriaDoPainel[]> {
  return tx.categoriaInsumo.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, chave: true, nome: true, ordem: true, ativa: true, sistema: true } });
}

/**
 * As compras LANÇADAS de cada loja pela categoria de HOJE do insumo: o mesmo filtro e a mesma soma de `comprasPorLoja` (valor
 * mais frete rateado, pela data da nota), só que agrupada também por categoria. Item de nota sem insumo (linha importada ainda não
 * casada) ou de insumo sem categoria cai em "sem categoria" (chave nula): nada some, a soma continua sendo a do DRE. Insumo PRÉ-PREPARO
 * (tipo de hoje) vai à chave `CHAVE_DOS_PREPARADOS`, a linha própria dos pré-preparos.
 */
export async function comprasPorLojaECategoria(tx: ClienteDoParceiro, ids: readonly string[], de: string, ate: string): Promise<Map<string, Map<string | null, number>>> {
  const out = new Map<string, Map<string | null, number>>();
  if (ids.length === 0 || ate < de) return out;
  const linhas = await tx.sql<{ lojaId: string; categoriaId: string | null; preparo: boolean; centavos: bigint }>`
    SELECT n."lojaId", i."categoriaId", coalesce(i."tipo" = 'PRE_PREPARO', false) AS "preparo", sum(it."valorTotalCentavos" + it."freteRateadoCentavos")::bigint AS "centavos"
    FROM "NotaEntrada" n
    JOIN "NotaEntradaItem" it ON it."parceiroId" = n."parceiroId" AND it."notaId" = n."id"
    LEFT JOIN "Insumo" i ON i."parceiroId" = it."parceiroId" AND i."id" = it."insumoId"
    WHERE n."parceiroId" = ${tx.parceiroId} AND n."lojaId" = ANY(${[...ids]}::text[])
      AND n."status" = 'LANCADA' AND n."entradaEm" >= ${de}::date AND n."entradaEm" <= ${ate}::date
    GROUP BY n."lojaId", i."categoriaId", coalesce(i."tipo" = 'PRE_PREPARO', false)`;
  for (const l of linhas) {
    if (!out.has(l.lojaId)) out.set(l.lojaId, new Map());
    // Insumo pré-preparo vai à linha própria (I.2b), qualquer que seja a categoria dele.
    out.get(l.lojaId)!.set(l.preparo ? CHAVE_DOS_PREPARADOS : l.categoriaId, Number(l.centavos));
  }
  return out;
}

/** Quantos insumos diferentes compraram em "Outros / a classificar" ou sem categoria no recorte (o "Classificar N insumos"). */
export async function insumosAClassificar(tx: ClienteDoParceiro, ids: readonly string[], de: string, ate: string, outrosId: string | null): Promise<number> {
  if (ids.length === 0 || ate < de) return 0;
  const [r] = await tx.sql<{ n: number }>`
    SELECT count(DISTINCT it."insumoId")::int AS "n"
    FROM "NotaEntrada" n
    JOIN "NotaEntradaItem" it ON it."parceiroId" = n."parceiroId" AND it."notaId" = n."id"
    JOIN "Insumo" i ON i."parceiroId" = it."parceiroId" AND i."id" = it."insumoId"
    WHERE n."parceiroId" = ${tx.parceiroId} AND n."lojaId" = ANY(${[...ids]}::text[])
      AND n."status" = 'LANCADA' AND n."entradaEm" >= ${de}::date AND n."entradaEm" <= ${ate}::date
      AND (i."categoriaId" IS NULL OR i."categoriaId" = ${outrosId ?? ''})`;
  return r?.n ?? 0;
}

/**
 * Tudo o que a conta de cada loja precisa, lido em consultas que não crescem com o número de lojas. Com o `cmv` do DRE (I.2b), a loja
 * cujo CMV é o real tenta abrir por categoria (retrato por insumo nos dois estoques); a que não consegue fica pelas compras e diz por quê.
 */
async function lerAsLojas(tx: ClienteDoParceiro, lojas: readonly { id: string; nome: string }[], periodo: Pick<Periodo, 'inicio' | 'fim'>, ate: string | null, receitaDe: (id: string) => number, cmv: CmvDoDre | null): Promise<LojaNoPainel[]> {
  const ids = lojas.map((l) => l.id);
  const [compras, vigentes, naoUsa] = await Promise.all([
    ate ? comprasPorLojaECategoria(tx, ids, periodo.inicio, ate) : Promise.resolve(new Map<string, Map<string | null, number>>()),
    conjuntosVigentes(tx, ids, periodo.inicio),
    categoriasQueNaoUsa(tx, ids),
  ]);
  const doCmv = new Map((cmv?.lojas ?? []).map((l) => [l.lojaId, l]));
  const pedidos: PedidoDoReal[] = [];
  for (const l of lojas) {
    const r = doCmv.get(l.id)?.real;
    if (r) {
      pedidos.push({ lojaId: l.id, inicio: periodo.inicio, fim: periodo.fim, realCentavos: r.centavos, fechamentoId: r.fechamentoId, fechamentoAnteriorId: r.fechamentoAnteriorId ?? null, aberturaId: r.aberturaId, inicialDe: r.inicialDe });
    }
  }
  const abertos = await realPorCategoria(tx, pedidos);
  return lojas.map((l) => {
    const m = metasDaLoja(vigentes, l.id);
    const aberto = abertos.get(`${l.id}|${periodo.inicio}`);
    const vale = doCmv.get(l.id) ? valeDaLoja(doCmv.get(l.id)!) : null;
    return {
      lojaId: l.id,
      nome: l.nome,
      receitaBrutaCentavos: receitaDe(l.id),
      compras: compras.get(l.id) ?? new Map(),
      real: aberto?.aberto ? aberto.real : null,
      cmvCentavos: vale?.centavos ?? null,
      motivoSemRealPorCategoria: aberto && !aberto.aberto ? aberto.motivo : null,
      naoUsa: naoUsa.get(l.id) ?? new Set(),
      metas: m.metas,
      metaVemDe: m.origem,
    };
  });
}

/**
 * O que o fechamento grava em `entrada.categorias` (fotografia v5): por loja, as compras por categoria no período inteiro, o real aberto
 * por categoria (quando a loja tem o retrato nos dois estoques), a meta efetiva da época e o uso. Lido na transação do fechamento, sob a trava exclusiva do período: é a mesma conta do painel ao vivo.
 */
export async function categoriasParaFotografia(tx: ClienteDoParceiro, lojas: readonly { id: string; nome: string }[], periodo: Periodo, cmv: CmvDoDre): Promise<CategoriasGravadas> {
  const categorias = await categoriasDoPainel(tx);
  const doPainel = await lerAsLojas(tx, lojas, periodo, periodo.fim, () => 0, cmv);
  return categoriasParaGravar(categorias, doPainel);
}

/** As categorias da fotografia, só das lojas que a pessoa alcança (a consulta já extrai do JSON apenas essas lojas). */
export async function lerCategoriasDaFotografia(tx: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, fotografiaId: string): Promise<unknown> {
  const todas = alcance.lojas === 'todas';
  const ids = todas ? [] : [...alcance.lojas];
  const [r] = await tx.sql<{ cat: unknown }>`
    SELECT CASE WHEN jsonb_typeof(f."entrada"->'categorias') = 'object' AND jsonb_typeof(f."entrada"->'categorias'->'lojas') = 'object' THEN
      jsonb_build_object(
        'versao', f."entrada"->'categorias'->'versao',
        'lojas', COALESCE((SELECT jsonb_object_agg(e."key", e."value") FROM jsonb_each(f."entrada"->'categorias'->'lojas') e WHERE (${todas} OR e."key" = ANY(${ids}::text[]))), '{}'::jsonb))
      ELSE NULL END AS "cat"
    FROM "DreFotografia" f WHERE f."parceiroId" = ${tx.parceiroId} AND f."id" = ${fotografiaId}`;
  return r?.cat ?? null;
}

// ================================================================ o painel

export interface TotalDoPainel {
  /** A linha `cmv` do DRE do escopo: o total que a soma fecha. */
  linha: LinhaDoDre;
  meta: ComparacaoComMeta | null;
  farol: FarolDaLinha | null;
}

export interface CmvPorCategoria {
  d: DreDoPeriodo;
  total: TotalDoPainel;
  /** Nulo quando o período foi fechado antes da I.2: o total aparece, as categorias não. */
  painel: PainelDeCategorias | null;
  antigo: boolean;
  /** Quantas lojas entram na conta (com receita ou com compra). */
  lojasIncluidas: number;
}

/**
 * O painel de CMV por categoria de um período e escopo. Sem `dre.ver` (ou a rede sem a rede inteira, ou loja fora do alcance): null.
 * `data` é qualquer dia dentro do período; `hoje` decide o que é em curso.
 */
export async function cmvPorCategoria(cliente: ClienteDoParceiro, alcance: Alcance, pedido: PedidoDoEscopo, data: string, hoje = hojeNoRio()): Promise<CmvPorCategoria | null> {
  if (recusaDoDre(alcance, pedido)) return null;
  if (pedido.tipo === 'loja' && !alcancaLoja(alcance, pedido.lojaId)) return null;
  return cliente.transacao((tx) => cmvPorCategoriaNaTx(tx, alcance, pedido, data, hoje), { timeout: 20_000 });
}

/** O mesmo painel dentro de uma transação já aberta (a evolução lê vários períodos na mesma). */
export async function cmvPorCategoriaNaTx(tx: ClienteDoParceiro, alcance: Alcance, pedido: PedidoDoEscopo, data: string, hoje: string): Promise<CmvPorCategoria | null> {
  if (recusaDoDre(alcance, pedido)) return null;
  if (pedido.tipo === 'loja' && !alcancaLoja(alcance, pedido.lojaId)) return null;
  const d = await dreDoPeriodoNaTx(tx, alcance, pedido, data, hoje);
  if (!d) return null;
  const linha = d.resultado.linhas.find((l) => l.tipo === 'cmv')!;
  const total: TotalDoPainel = { linha, meta: d.metas[linha.chave] ?? null, farol: d.farol.porLinha[linha.chave] ?? null };
  const receitaDe = (id: string) => (d.escopo.tipo === 'loja' ? d.resultado.receitaBrutaCentavos : (d.porLoja?.find((p) => p.loja.id === id)?.receitaBrutaCentavos ?? 0));
  const cabecalho = { d, total };
  const nomeDe = (id: string) => d.lojasDoEscopo.find((l) => l.id === id)?.nome ?? '';
  const montar = (categorias: CategoriaDoPainel[], lojas: LojaNoPainel[], nInsumos: number | null) => {
    const faixas = d.fechamento ? faixasDaVersao(d.farol.versaoDasFaixas) : FAIXAS_DO_FAROL;
    // Só entra na conta a loja que vendeu ou comprou: a parada não pesa nem conta como "sem meta".
    const doCmv = new Map(d.cmvDasLojas.lojas.map((c) => [c.lojaId, c]));
    const enriquecidas = lojas.map((l) => {
      const c = doCmv.get(l.lojaId);
      const vale = c ? valeDaLoja(c) : null;
      // Fotografia v4 (sem o real por categoria): a loja cujo DRE é o real fica pelas compras, e a variação explica a diferença.
      const motivo = l.motivoSemRealPorCategoria ?? (!l.real && c?.real ? 'o fechamento é de antes do real por categoria' : null);
      return { ...l, cmvCentavos: l.cmvCentavos !== undefined ? l.cmvCentavos : (vale?.centavos ?? null), motivoSemRealPorCategoria: motivo };
    });
    const incluidas = enriquecidas.filter((l) => l.receitaBrutaCentavos > 0 || l.compras.size > 0 || l.real || l.cmvCentavos != null);
    const painel = montarPainelDeCategorias({
      categorias,
      lojas: incluidas,
      totalCentavos: linha.valorCentavos,
      receitaBrutaCentavos: d.resultado.receitaBrutaCentavos,
      notaDoCmv: linha.nota,
      semContarDoCmv: linha.semContar,
      motivoGeral: d.farol.motivoGeral,
      faixas,
      encerrado: d.encerrado,
      insumosAClassificar: nInsumos,
    });
    return { ...cabecalho, painel, antigo: false, lojasIncluidas: incluidas.length } satisfies CmvPorCategoria;
  };

  // ---- fechado: só a fotografia
  if (d.fechamento) {
    if (d.fechamento.versaoDaConta < 4) return { ...cabecalho, painel: null, antigo: true, lojasIncluidas: 0 };
    const lidas = await lerCategoriasDaFotografia(tx, pedido.tipo === 'loja' ? { lojas: [pedido.lojaId] } : alcance, d.fechamento.fotografiaId);
    const lida = categoriasLidasDaFotografia(lidas, receitaDe);
    if (!lida || lida.lojas.length === 0) return { ...cabecalho, painel: null, antigo: true, lojasIncluidas: 0 };
    return montar(lida.categorias, lida.lojas, null);
  }

  // ---- ao vivo
  const categorias = await categoriasDoPainel(tx);
  const lojas = await lerAsLojas(tx, d.lojasDoEscopo.map((l) => ({ id: l.id, nome: nomeDe(l.id) })), d.periodo, d.ate, receitaDe, d.cmvDasLojas);
  const outros = categorias.find((c) => c.chave === CHAVE_DO_SISTEMA)?.id ?? null;
  const aClassificar = d.ate ? await insumosAClassificar(tx, d.lojasDoEscopo.map((l) => l.id), d.periodo.inicio, d.ate, outros) : 0;
  return montar(categorias, lojas, aClassificar);
}

/**
 * A evolução dos últimos períodos (até 6, o pedido e os 5 anteriores) por categoria: realizado, meta e desvio de cada um, na mesma
 * transação. Cada período vem do mesmo painel de cima (o fechado, da fotografia como está; o aberto, ao vivo), então o número de um
 * período aqui é o do painel dele. O número de consultas é o de cada período, nunca o de lojas. Para quando o ERP ainda não existia.
 */
export async function evolucaoDeCategorias(cliente: ClienteDoParceiro, alcance: Alcance, pedido: PedidoDoEscopo, data: string, hoje = hojeNoRio(), quantos = 6): Promise<EvolucaoDeCategorias | null> {
  if (recusaDoDre(alcance, pedido)) return null;
  if (pedido.tipo === 'loja' && !alcancaLoja(alcance, pedido.lojaId)) return null;
  return cliente.transacao(
    async (tx) => {
      const lidos: CmvPorCategoria[] = [];
      let dia = data;
      for (let i = 0; i < quantos; i++) {
        const r = await cmvPorCategoriaNaTx(tx, alcance, pedido, dia, hoje);
        if (!r) return i === 0 ? null : montarEvolucao(lidos.map(paraAEvolucao));
        lidos.push(r);
        if (!r.d.anterior) break;
        dia = somarDias(r.d.periodo.inicio, -1);
      }
      return montarEvolucao(lidos.map(paraAEvolucao));
    },
    { timeout: 30_000 },
  );
}

function paraAEvolucao(r: CmvPorCategoria) {
  const { d, total, painel } = r;
  return {
    inicio: d.periodo.inicio,
    nome: d.periodo.nome,
    situacao: d.status === 'FECHADO' ? ('fechado' as const) : d.emCurso ? ('em-curso' as const) : ('encerrado' as const),
    antigo: r.antigo,
    semFaturamento: d.resultado.semFaturamento,
    totalCentavos: total.linha.valorCentavos,
    totalBp: total.linha.percentualBp,
    metaTotalBp: total.meta?.metaBp ?? null,
    desvioTotalBp: total.meta?.desvioBp ?? null,
    painel,
  };
}
