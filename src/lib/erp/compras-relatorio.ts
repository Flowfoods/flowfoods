/**
 * Relatórios de compras (L.2) — a leitura com banco. Um motor só serve ao histórico de um insumo, às compras do período, à
 * planilha e à impressão: o mesmo recorte (lojas do acesso, situação, data usada, fornecedor, insumo, categoria) vira o mesmo
 * trecho de SQL, então tela, total, exportação e impressão nunca discordam.
 *
 * - Tudo se soma NO BANCO (GROUP BY, LIMIT/OFFSET): nenhuma nota é carregada em memória para somar.
 * - A fonte são os itens das notas LANÇADAS (`NotaEntrada` + `NotaEntradaItem`) com os valores gravados no lançamento
 *   (snapshot de unidade, embalagem, quantidade, valor, frete rateado): mudar o cadastro depois não reescreve compra antiga.
 *   Nota cancelada nunca soma (aparece à parte, rotulada) e o documento fiscal que só aguarda conferência nem é lido como compra.
 * - Quem vê: `compras.ver`, só nas lojas do acesso. Loja pedida fora do acesso NUNCA amplia: o relatório sai vazio.
 * - Todas as leituras de uma tela acontecem numa transação de UMA fotografia (REPEATABLE READ): soma das linhas = resumo, mesmo se
 *   alguém lança uma nota no meio.
 * - O SQL é fixo (só parâmetros); os trechos compartilhados são `Prisma.sql` montados aqui e conferidos pelo mesmo guarda do portão.
 */

import { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { conferirSqlDoParceiro } from './tenant';
import { filtroDeLojas, type Alcance } from './permissoes';
import { lojasComCompras } from './compras-custo';
import { idsDeInsumoPelaBusca } from './busca';
import { numeroDaNota } from './compra-campos';
import {
  FUSO_OPERACIONAL,
  recorteDeUmInsumo,
  somarDias,
  type AgruparPor,
  type BaseDeData,
  type FiltrosDoRelatorio,
  type MotivoSemBase,
  type TotalPorUnidade,
} from './compras-relatorio-campos';
import type { Unidade } from './unidades';

const MOTIVOS = new Set<string>(['insumo', 'unidade', 'conversao', 'valor']);

/** O recorte já resolvido contra o acesso: o que o SQL recebe. */
export interface Recorte {
  parceiroId: string;
  lojas: string[];
  status: 'LANCADA' | 'CANCELADA';
  base: BaseDeData;
  de: string;
  ate: string;
  /** O dia seguinte ao último: o fim aberto do intervalo [início, fim) do lançamento. */
  fim: string;
  fornecedorId: string | null;
  /** null = qualquer insumo; lista (inclusive vazia) = só estes. */
  insumoIds: string[] | null;
  categoriaId: string | null;
  agrupar: AgruparPor;
  grupo: string | null;
  unidade: string | null;
  soSemBase: boolean;
}

export interface Opcoes {
  lojas: { id: string; nome: string; ativa: boolean }[];
  fornecedores: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  listaDeInsumos: { id: string; nome: string }[];
  /** Há mais insumos com compra do que a lista oferece: refine pela busca. */
  insumosTruncados: boolean;
}

// ------------------------------------------------------------------- o SQL

function guardado(f: Prisma.Sql): Prisma.Sql {
  conferirSqlDoParceiro(f.strings);
  return f;
}

/** O dia da compra pela base escolhida (uma coluna `date`): a MESMA conta em filtro, grupo por dia, total e exportação. */
const DIA = (base: BaseDeData) =>
  guardado(Prisma.sql`CASE ${base}::text
      WHEN 'entrada' THEN n."entradaEm"
      WHEN 'emissao' THEN n."emitidaEm"
      ELSE ((n."lancadaEm" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO_OPERACIONAL}::text)::date
    END`);

/** Os itens do recorte, uma linha por item de nota, com tudo o que as consultas de baixo precisam. */
function fonte(r: Recorte): Prisma.Sql {
  const ids = r.insumoIds;
  return guardado(Prisma.sql`
    SELECT
      n."id" AS "notaId", n."lojaId", n."fornecedorId", n."entradaEm", n."emitidaEm", n."lancadaEm", n."numero", n."serie",
      n."chaveAcesso", n."descontoCentavos" AS "descontoDaNota", n."fornecedorNomeSnapshot", n."motivoCancelamento",
      i."id" AS "itemId", i."ordem", i."insumoId", i."insumoNomeSnapshot", i."embalagemSnapshot", i."embalagensMilesimos",
      i."conteudoMilesimos", i."quantidadeMilesimos", i."valorTotalCentavos" AS "valor", i."freteRateadoCentavos" AS "frete",
      i."unidadeSnapshot"::text AS "unidade",
      ins."nome" AS "insumoNome", forn."nome" AS "fornecedorNome",
      ${DIA(r.base)} AS "dia",
      CASE
        WHEN i."insumoId" IS NULL THEN 'insumo'
        WHEN i."unidadeSnapshot" IS NULL THEN 'unidade'
        WHEN ABS(i."quantidadeMilesimos" - ROUND(i."embalagensMilesimos"::numeric * i."conteudoMilesimos" / 1000)) > 1 THEN 'conversao'
        WHEN i."valorTotalCentavos" <= 0 THEN 'valor'
      END AS "motivo"
    FROM "NotaEntradaItem" i
    JOIN "NotaEntrada" n ON n."parceiroId" = i."parceiroId" AND n."id" = i."notaId"
    LEFT JOIN "Insumo" ins ON ins."parceiroId" = i."parceiroId" AND ins."id" = i."insumoId"
    LEFT JOIN "Fornecedor" forn ON forn."parceiroId" = n."parceiroId" AND forn."id" = n."fornecedorId"
    WHERE i."parceiroId" = ${r.parceiroId}::text
      AND n."status" = ${r.status}::text::"NotaStatus"
      AND n."lojaId" = ANY(${r.lojas}::text[])
      AND (
        (${r.base}::text = 'entrada' AND n."entradaEm" >= ${r.de}::date AND n."entradaEm" <= ${r.ate}::date)
        OR (${r.base}::text = 'emissao' AND n."emitidaEm" >= ${r.de}::date AND n."emitidaEm" <= ${r.ate}::date)
        OR (${r.base}::text = 'lancamento'
            AND n."lancadaEm" >= ((${r.de}::timestamp AT TIME ZONE ${FUSO_OPERACIONAL}::text) AT TIME ZONE 'UTC')
            AND n."lancadaEm" < ((${r.fim}::timestamp AT TIME ZONE ${FUSO_OPERACIONAL}::text) AT TIME ZONE 'UTC'))
      )
      AND (${r.fornecedorId}::text IS NULL OR n."fornecedorId" = ${r.fornecedorId}::text)
      AND (${ids}::text[] IS NULL OR i."insumoId" = ANY(${ids}::text[]))
      AND (${r.categoriaId}::text IS NULL OR ins."categoriaId" = ${r.categoriaId}::text)`);
}

/** A chave do grupo de uma linha de `f`: id do insumo, id do fornecedor ou o dia. "-" = sem insumo / sem fornecedor. */
const CHAVE = (agrupar: AgruparPor) =>
  guardado(Prisma.sql`(CASE ${agrupar}::text
      WHEN 'insumo' THEN COALESCE(f."insumoId", '-')
      WHEN 'fornecedor' THEN COALESCE(f."fornecedorId", '-')
      ELSE to_char(f."dia", 'YYYY-MM-DD')
    END)`);

/** Abrir o grupo, a unidade ou só o que ficou sem base: o filtro extra das linhas (e do total delas). */
function extra(r: Recorte): Prisma.Sql {
  return guardado(Prisma.sql`
    (${r.grupo}::text IS NULL OR ${CHAVE(r.agrupar)} = ${r.grupo}::text)
    AND (${r.unidade}::text IS NULL OR (f."unidade" IS NULL AND ${r.unidade}::text = 'sem') OR f."unidade" = ${r.unidade}::text)
    AND (NOT ${r.soSemBase}::boolean OR f."motivo" IS NOT NULL)`);
}

const SOMAS = guardado(Prisma.sql`
  count(*)::float8 AS "linhas",
  COALESCE(sum(f."quantidadeMilesimos"), 0)::float8 AS "quantidade",
  COALESCE(sum(f."valor"), 0)::float8 AS "valor",
  COALESCE(sum(f."frete"), 0)::float8 AS "frete",
  (count(*) FILTER (WHERE f."motivo" IS NULL))::float8 AS "cLinhas",
  COALESCE(sum(f."quantidadeMilesimos") FILTER (WHERE f."motivo" IS NULL), 0)::float8 AS "cQuantidade",
  COALESCE(sum(f."valor") FILTER (WHERE f."motivo" IS NULL), 0)::float8 AS "cValor",
  COALESCE(sum(f."frete") FILTER (WHERE f."motivo" IS NULL), 0)::float8 AS "cFrete"`);

interface Somas {
  linhas: number;
  quantidade: number;
  valor: number;
  frete: number;
  cLinhas: number;
  cQuantidade: number;
  cValor: number;
  cFrete: number;
}

const paraTotal = (unidade: string | null, s: Somas): TotalPorUnidade => ({
  unidade: unidade as Unidade | null,
  linhas: s.linhas,
  quantidadeMilesimos: s.quantidade,
  valorCentavos: s.valor,
  freteCentavos: s.frete,
  comparavel: { linhas: s.cLinhas, quantidadeMilesimos: s.cQuantidade, valorCentavos: s.cValor, freteCentavos: s.cFrete },
});

// ------------------------------------------------------------ as consultas

export interface TotaisDoRecorte {
  linhas: number;
  notas: number;
  valorCentavos: number;
  freteCentavos: number;
  /** valor dos itens + frete atribuído: o que a compra custou entregue. */
  totalCentavos: number;
  unidades: TotalPorUnidade[];
  /** Linhas fora do preço médio, por motivo. */
  semBase: Partial<Record<MotivoSemBase, number>>;
  /** Notas do recorte com desconto na nota (hoje sempre 0; se um dia houver, o relatório avisa). */
  notasComDesconto: number;
}

/** O resumo de TUDO o que está no recorte (sem o filtro de grupo): quantidade por unidade, dinheiro, notas e o que ficou sem base. */
export async function totaisDoRecorte(tx: ClienteDoParceiro, r: Recorte): Promise<TotaisDoRecorte> {
  const sem = { ...r, grupo: null, unidade: null, soSemBase: false };
  const porUnidade = await tx.sql<{ unidade: string | null } & Somas>`
    WITH f AS (${fonte(sem)})
    SELECT f."unidade", ${SOMAS} FROM f GROUP BY f."unidade"`;
  const [geral] = await tx.sql<{ notas: number; descontos: number }>`
    WITH f AS (${fonte(sem)})
    SELECT count(DISTINCT f."notaId")::float8 AS "notas",
           count(DISTINCT f."notaId") FILTER (WHERE f."descontoDaNota" > 0)::float8 AS "descontos"
    FROM f`;
  const motivos = await tx.sql<{ motivo: string; linhas: number }>`
    WITH f AS (${fonte(sem)})
    SELECT f."motivo", count(*)::float8 AS "linhas" FROM f WHERE f."motivo" IS NOT NULL GROUP BY f."motivo"`;
  const unidades = porUnidade
    .map((u) => paraTotal(u.unidade, u))
    .sort((a, b) => ordemDaUnidade(a.unidade) - ordemDaUnidade(b.unidade));
  const valor = unidades.reduce((s, u) => s + u.valorCentavos, 0);
  const frete = unidades.reduce((s, u) => s + u.freteCentavos, 0);
  const semBase: Partial<Record<MotivoSemBase, number>> = {};
  for (const m of motivos) if (MOTIVOS.has(m.motivo)) semBase[m.motivo as MotivoSemBase] = m.linhas;
  return {
    linhas: unidades.reduce((s, u) => s + u.linhas, 0),
    notas: geral?.notas ?? 0,
    valorCentavos: valor,
    freteCentavos: frete,
    totalCentavos: valor + frete,
    unidades,
    semBase,
    notasComDesconto: geral?.descontos ?? 0,
  };
}

const ordemDaUnidade = (u: string | null) => ({ KG: 0, L: 1, UN: 2 })[u ?? ''] ?? 3;

export interface LinhaDeGrupo {
  /** Id do insumo, id do fornecedor ou o dia ("2026-10-14"); "-" = sem insumo / sem fornecedor. */
  chave: string;
  rotulo: string;
  notas: number;
  total: TotalPorUnidade;
}

/** Os grupos (por insumo, fornecedor ou dia) do recorte, um por unidade, paginados no banco. `pagina` nulo = todos (planilha e impressão). */
export async function gruposDoRecorte(tx: ClienteDoParceiro, r: Recorte, pagina: { numero: number; porPagina: number } | null) {
  const sem = { ...r, grupo: null, unidade: null, soSemBase: false };
  const limite = pagina ? pagina.porPagina : TETO_DE_GRUPOS + 1;
  const deslocamento = pagina ? (pagina.numero - 1) * pagina.porPagina : 0;
  const linhas = await tx.sql<{ chave: string; rotulo: string; unidade: string | null; notas: number; quantosGrupos: number } & Somas>`
    WITH f AS (${fonte(sem)}),
    g AS (
      SELECT ${CHAVE(r.agrupar)} AS "chave",
             MIN(CASE ${r.agrupar}::text
                   WHEN 'insumo' THEN COALESCE(f."insumoNome", f."insumoNomeSnapshot", 'Sem insumo identificado')
                   WHEN 'fornecedor' THEN COALESCE(f."fornecedorNome", f."fornecedorNomeSnapshot", 'Sem fornecedor')
                   ELSE to_char(f."dia", 'DD/MM/YYYY')
                 END) AS "rotulo",
             f."unidade",
             count(DISTINCT f."notaId")::float8 AS "notas",
             ${SOMAS}
      FROM f GROUP BY 1, f."unidade"
    )
    SELECT g.*, count(*) OVER ()::float8 AS "quantosGrupos"
    FROM g
    ORDER BY
      CASE WHEN ${r.agrupar}::text = 'dia' THEN g."chave" END DESC NULLS LAST,
      CASE WHEN ${r.agrupar}::text <> 'dia' THEN g."valor" + g."frete" END DESC NULLS LAST,
      g."rotulo" ASC, g."chave" ASC, g."unidade" ASC NULLS LAST
    LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  const grupos = linhas.map((l): LinhaDeGrupo => ({ chave: l.chave, rotulo: l.rotulo, notas: l.notas, total: paraTotal(l.unidade, l) }));
  return {
    grupos: pagina ? grupos : grupos.slice(0, TETO_DE_GRUPOS),
    total: linhas[0]?.quantosGrupos ?? 0,
    passouDoTeto: !pagina && linhas.length > TETO_DE_GRUPOS,
  };
}

/** O teto de grupos que a planilha e a impressão levam (acima disso a tela manda reduzir o recorte; nunca corta calada). */
export const TETO_DE_GRUPOS = 20_000;

export interface LinhaDeCompra {
  notaId: string;
  itemId: string;
  lojaId: string;
  loja: string;
  fornecedorId: string | null;
  fornecedor: string;
  numero: string | null;
  serie: string;
  rotuloDaNota: string;
  chaveAcesso: string | null;
  /** A data pela base escolhida ("2026-10-14"). */
  data: string;
  entradaEm: string;
  emitidaEm: string | null;
  /** O instante do lançamento (ISO, UTC). */
  lancadaEm: string | null;
  insumoId: string | null;
  insumo: string;
  embalagem: string;
  embalagensMilesimos: number;
  conteudoMilesimos: number;
  quantidadeMilesimos: number;
  unidade: Unidade | null;
  valorCentavos: number;
  freteCentavos: number;
  totalCentavos: number;
  descontoDaNotaCentavos: number;
  motivoSemBase: MotivoSemBase | null;
  documentoId: string | null;
  cancelada: boolean;
  motivoCancelamento: string | null;
}

const iso = (d: Date | string | null) => (d === null ? null : typeof d === 'string' ? d : d.toISOString());

/**
 * As linhas das compras do recorte (e do grupo/unidade aberto), da mais nova para a mais velha, com o total delas na mesma consulta.
 * `pagina` nulo = todas (planilha e impressão), até `teto`.
 */
export async function linhasDoRecorte(tx: ClienteDoParceiro, r: Recorte, pagina: { numero: number; porPagina: number } | null, teto = TETO_DA_PLANILHA_BANCO) {
  const limite = pagina ? pagina.porPagina : teto + 1;
  const deslocamento = pagina ? (pagina.numero - 1) * pagina.porPagina : 0;
  const lidas = await tx.sql<{
    notaId: string; itemId: string; lojaId: string; loja: string; fornecedorId: string | null; fornecedorNome: string | null; fornecedorNomeSnapshot: string | null;
    numero: string | null; serie: string; chaveAcesso: string | null; dia: Date; entradaEm: Date; emitidaEm: Date | null; lancadaEm: Date | null;
    insumoId: string | null; insumoNome: string | null; insumoNomeSnapshot: string | null; embalagemSnapshot: string | null;
    embalagensMilesimos: number; conteudoMilesimos: number; quantidadeMilesimos: number; unidade: string | null; valor: number; frete: number;
    descontoDaNota: number; motivo: string | null; documentoId: string | null; motivoCancelamento: string | null; quantas: number;
  }>`
    WITH f AS (${fonte(r)})
    SELECT f."notaId", f."itemId", f."lojaId", l."nome" AS "loja", f."fornecedorId", f."fornecedorNome", f."fornecedorNomeSnapshot",
           f."numero", f."serie", f."chaveAcesso", f."dia", f."entradaEm", f."emitidaEm", f."lancadaEm",
           f."insumoId", f."insumoNome", f."insumoNomeSnapshot", f."embalagemSnapshot", f."embalagensMilesimos", f."conteudoMilesimos",
           f."quantidadeMilesimos", f."unidade", f."valor", f."frete", f."descontoDaNota", f."motivo", f."motivoCancelamento",
           d."id" AS "documentoId", count(*) OVER ()::float8 AS "quantas"
    FROM f
    JOIN "Loja" l ON l."parceiroId" = ${r.parceiroId}::text AND l."id" = f."lojaId"
    LEFT JOIN "DocumentoFiscal" d ON d."parceiroId" = ${r.parceiroId}::text AND d."notaEntradaId" = f."notaId"
    WHERE ${extra(r)}
    ORDER BY f."dia" DESC, f."notaId" DESC, f."ordem" ASC, f."itemId" ASC
    LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  const linhas = lidas.map((l): LinhaDeCompra => ({
    notaId: l.notaId,
    itemId: l.itemId,
    lojaId: l.lojaId,
    loja: l.loja,
    fornecedorId: l.fornecedorId,
    // O nome como a nota guardou (histórico); o cadastro de hoje só entra se a nota não guardou.
    fornecedor: l.fornecedorNomeSnapshot ?? l.fornecedorNome ?? 'Sem fornecedor',
    numero: l.numero,
    serie: l.serie,
    rotuloDaNota: numeroDaNota(l),
    chaveAcesso: l.chaveAcesso,
    data: l.dia.toISOString().slice(0, 10),
    entradaEm: l.entradaEm.toISOString().slice(0, 10),
    emitidaEm: l.emitidaEm ? l.emitidaEm.toISOString().slice(0, 10) : null,
    lancadaEm: iso(l.lancadaEm),
    insumoId: l.insumoId,
    // O nome como a nota guardou (histórico); o cadastro de hoje só entra se a nota não guardou.
    insumo: l.insumoNomeSnapshot ?? l.insumoNome ?? 'Sem insumo identificado',
    embalagem: l.embalagemSnapshot ?? '',
    embalagensMilesimos: l.embalagensMilesimos,
    conteudoMilesimos: l.conteudoMilesimos,
    quantidadeMilesimos: l.quantidadeMilesimos,
    unidade: l.unidade as Unidade | null,
    valorCentavos: l.valor,
    freteCentavos: l.frete,
    totalCentavos: l.valor + l.frete,
    descontoDaNotaCentavos: l.descontoDaNota,
    motivoSemBase: l.motivo && MOTIVOS.has(l.motivo) ? (l.motivo as MotivoSemBase) : null,
    documentoId: l.documentoId,
    cancelada: r.status === 'CANCELADA',
    motivoCancelamento: l.motivoCancelamento,
  }));
  return { linhas: pagina ? linhas : linhas.slice(0, teto), total: lidas[0]?.quantas ?? 0, passouDoTeto: !pagina && lidas.length > teto };
}

const TETO_DA_PLANILHA_BANCO = 50_000;

/** O resumo só das linhas abertas (grupo / unidade / sem base): o cabeçalho delas confere com a tabela. */
export async function totalDasLinhasAbertas(tx: ClienteDoParceiro, r: Recorte): Promise<{ linhas: number; notas: number; valorCentavos: number; freteCentavos: number }> {
  const [t] = await tx.sql<{ linhas: number; notas: number; valor: number; frete: number }>`
    WITH f AS (${fonte(r)})
    SELECT count(*)::float8 AS "linhas", count(DISTINCT f."notaId")::float8 AS "notas",
           COALESCE(sum(f."valor"), 0)::float8 AS "valor", COALESCE(sum(f."frete"), 0)::float8 AS "frete"
    FROM f WHERE ${extra(r)}`;
  return { linhas: t?.linhas ?? 0, notas: t?.notas ?? 0, valorCentavos: t?.valor ?? 0, freteCentavos: t?.frete ?? 0 };
}

/** As notas canceladas que cairiam neste mesmo recorte: separadas, nunca somadas ao total. */
export async function canceladasDoRecorte(tx: ClienteDoParceiro, r: Recorte) {
  const c = { ...r, status: 'CANCELADA' as const, grupo: null, unidade: null, soSemBase: false };
  const [t] = await tx.sql<{ linhas: number; notas: number; valor: number; frete: number }>`
    WITH f AS (${fonte(c)})
    SELECT count(*)::float8 AS "linhas", count(DISTINCT f."notaId")::float8 AS "notas",
           COALESCE(sum(f."valor"), 0)::float8 AS "valor", COALESCE(sum(f."frete"), 0)::float8 AS "frete"
    FROM f`;
  return { linhas: t?.linhas ?? 0, notas: t?.notas ?? 0, valorCentavos: t?.valor ?? 0, freteCentavos: t?.frete ?? 0 };
}

/** Base "emissão": quantas notas lançadas do mesmo recorte (pela data de entrada) ficaram de fora por não terem emissão. */
export async function semEmissaoNoRecorte(tx: ClienteDoParceiro, r: Recorte): Promise<number> {
  const ids = r.insumoIds;
  const [t] = await tx.sql<{ notas: number }>`
    SELECT count(*)::float8 AS "notas"
    FROM "NotaEntrada" n
    WHERE n."parceiroId" = ${r.parceiroId}::text
      AND n."status" = 'LANCADA'::"NotaStatus"
      AND n."lojaId" = ANY(${r.lojas}::text[])
      AND n."emitidaEm" IS NULL
      AND n."entradaEm" >= ${r.de}::date AND n."entradaEm" <= ${r.ate}::date
      AND (${r.fornecedorId}::text IS NULL OR n."fornecedorId" = ${r.fornecedorId}::text)
      AND EXISTS (
        SELECT 1 FROM "NotaEntradaItem" i LEFT JOIN "Insumo" ins ON ins."parceiroId" = i."parceiroId" AND ins."id" = i."insumoId"
        WHERE i."parceiroId" = n."parceiroId" AND i."notaId" = n."id"
          AND (${ids}::text[] IS NULL OR i."insumoId" = ANY(${ids}::text[]))
          AND (${r.categoriaId}::text IS NULL OR ins."categoriaId" = ${r.categoriaId}::text)
      )`;
  return t?.notas ?? 0;
}

/** Notas fiscais (XML) que ainda aguardam conferência nas lojas escolhidas: NÃO são compra e não entram em nada. */
export async function documentosAguardando(tx: ClienteDoParceiro, lojas: string[]): Promise<number> {
  const [t] = await tx.sql<{ n: number }>`
    SELECT count(*)::float8 AS "n" FROM "DocumentoFiscal"
    WHERE "parceiroId" = ${tx.parceiroId}::text AND "situacao" = 'AGUARDANDO_CONFERENCIA'::"SituacaoDocumentoFiscal" AND "lojaId" = ANY(${lojas}::text[])`;
  return t?.n ?? 0;
}

// -------------------------------------------------------------- o recorte

const LIMITE_DE_INSUMOS_NA_LISTA = 1000;

/** Resolve o que a pessoa pediu contra o que ela pode ver. Sem acesso a compras, ou sem nenhuma loja, não há recorte. */
export async function resolverRecorte(tx: ClienteDoParceiro, alcance: Alcance, f: FiltrosDoRelatorio) {
  const doAcesso = lojasComCompras(alcance);
  if (doAcesso === null) return { recorte: null as Recorte | null, lojasDoAcesso: [] as { id: string; nome: string; ativa: boolean }[], motivo: 'sem-permissao' as const };
  const lojasDoAcesso = await tx.loja.findMany({ where: { id: filtroDeLojas(alcance) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, ativa: true } });
  const permitidas = new Set(lojasDoAcesso.map((l) => l.id));
  // Loja pedida fora do acesso nunca amplia o relatório: sobra só o que ele pode ver e, se não sobra nada, o relatório sai vazio.
  const lojas = f.lojaIds.length ? f.lojaIds.filter((l) => permitidas.has(l)) : lojasDoAcesso.map((l) => l.id);
  if (lojas.length === 0 || f.periodoInvalido) {
    return { recorte: null, lojasDoAcesso, motivo: f.periodoInvalido ? ('periodo' as const) : ('sem-loja' as const) };
  }
  let insumoIds: string[] | null = null;
  if (f.insumoId) insumoIds = [f.insumoId];
  else if (f.q) insumoIds = (await idsDeInsumoPelaBusca(tx, f.q)) ?? null;
  const recorte: Recorte = {
    parceiroId: tx.parceiroId,
    lojas,
    status: f.situacao === 'canceladas' ? 'CANCELADA' : 'LANCADA',
    base: f.base,
    de: f.de,
    ate: f.ate,
    fim: somarDias(f.ate, 1),
    fornecedorId: f.fornecedorId || null,
    insumoIds,
    categoriaId: f.categoriaId || null,
    agrupar: f.agrupar,
    grupo: f.grupo || null,
    unidade: f.unidade || null,
    soSemBase: f.so === 'sembase',
  };
  return { recorte, lojasDoAcesso, motivo: null };
}

/** Os seletores dos filtros: só o que a pessoa pode ver (lojas do acesso; insumos que têm compra nelas). */
export async function opcoesDoRelatorio(tx: ClienteDoParceiro, lojasDoAcesso: Opcoes['lojas'], f: Pick<FiltrosDoRelatorio, 'q'>): Promise<Opcoes> {
  const lojaIds = lojasDoAcesso.map((l) => l.id);
  const ids = f.q ? await idsDeInsumoPelaBusca(tx, f.q) : null;
  const fornecedores = await tx.fornecedor.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } });
  const categorias = await tx.categoriaInsumo.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true } });
  const insumos = await tx.sql<{ id: string; nome: string }>`
      SELECT DISTINCT ins."id", ins."nome"
      FROM "NotaEntradaItem" i
      JOIN "NotaEntrada" n ON n."parceiroId" = i."parceiroId" AND n."id" = i."notaId"
      JOIN "Insumo" ins ON ins."parceiroId" = i."parceiroId" AND ins."id" = i."insumoId"
      WHERE i."parceiroId" = ${tx.parceiroId}::text AND n."lojaId" = ANY(${lojaIds}::text[])
        AND (${ids}::text[] IS NULL OR ins."id" = ANY(${ids}::text[]))
      ORDER BY ins."nome", ins."id"
      LIMIT ${LIMITE_DE_INSUMOS_NA_LISTA + 1}::int`;
  return {
    lojas: lojasDoAcesso,
    fornecedores,
    categorias,
    listaDeInsumos: insumos.slice(0, LIMITE_DE_INSUMOS_NA_LISTA),
    insumosTruncados: insumos.length > LIMITE_DE_INSUMOS_NA_LISTA,
  };
}

// ------------------------------------------------------- o relatório da tela

export interface RelatorioDaTela {
  /** Por que não há números: sem permissão, sem loja no acesso, período torto. */
  motivoVazio: 'sem-permissao' | 'sem-loja' | 'periodo' | null;
  opcoes: Opcoes;
  /** As lojas que entraram no recorte (nome para mostrar). */
  lojasUsadas: { id: string; nome: string }[];
  totais: TotaisDoRecorte | null;
  /** Visão 2 resumo: os grupos. Visão 1: os fornecedores (sempre). */
  grupos: Awaited<ReturnType<typeof gruposDoRecorte>> | null;
  fornecedores: Awaited<ReturnType<typeof gruposDoRecorte>> | null;
  linhas: Awaited<ReturnType<typeof linhasDoRecorte>> | null;
  abertas: Awaited<ReturnType<typeof totalDasLinhasAbertas>> | null;
  canceladas: Awaited<ReturnType<typeof canceladasDoRecorte>> | null;
  semEmissao: number | null;
  aguardando: number;
  /** Um insumo só no recorte: o preço médio quer dizer alguma coisa. */
  umInsumo: boolean;
  pagina: number;
  paginas: number;
}

const SEM_OPCOES: Opcoes = { lojas: [], fornecedores: [], categorias: [], listaDeInsumos: [], insumosTruncados: false };

/**
 * Tudo o que uma tela de relatório precisa, numa fotografia só do banco. `modo`: o histórico de um insumo mostra sempre as
 * linhas e a tabela por fornecedor; as compras do período mostram os grupos ou, com `ver=linhas`, as linhas.
 */
export async function relatorioDaTela(cliente: ClienteDoParceiro, alcance: Alcance, f: FiltrosDoRelatorio, modo: 'insumo' | 'periodo'): Promise<RelatorioDaTela> {
  return cliente.transacao(
    async (tx) => {
      const { recorte, lojasDoAcesso, motivo } = await resolverRecorte(tx, alcance, f);
      const opcoes = motivo === 'sem-permissao' ? SEM_OPCOES : await opcoesDoRelatorio(tx, lojasDoAcesso, f);
      const vazio: RelatorioDaTela = {
        motivoVazio: motivo,
        opcoes,
        lojasUsadas: [],
        totais: null,
        grupos: null,
        fornecedores: null,
        linhas: null,
        abertas: null,
        canceladas: null,
        semEmissao: null,
        aguardando: 0,
        umInsumo: false,
        pagina: 1,
        paginas: 1,
      };
      if (!recorte) return vazio;
      // Histórico de um insumo sem insumo escolhido: nada a mostrar ainda (a tela convida a escolher).
      if (modo === 'insumo' && !f.insumoId) return { ...vazio, motivoVazio: null, lojasUsadas: lojasDoAcesso.filter((l) => recorte.lojas.includes(l.id)) };
      const verLinhas = modo === 'insumo' || f.ver === 'linhas';
      const totais = await totaisDoRecorte(tx, recorte);
      const abertas = verLinhas ? await totalDasLinhasAbertas(tx, recorte) : null;
      // O total vem ANTES de pedir a página: a pedida além da última cai na última (e o rodapé diz "Página 3 de 3", não "1 de 1").
      const primeiraDosGrupos = verLinhas ? null : await gruposDoRecorte(tx, recorte, { numero: 1, porPagina: f.porPagina });
      const quantos = verLinhas ? (abertas?.linhas ?? 0) : (primeiraDosGrupos?.total ?? 0);
      const paginas = Math.max(1, Math.ceil(quantos / f.porPagina));
      const pagina = Math.min(Math.max(1, f.pagina), paginas);
      const pagFinal = { numero: pagina, porPagina: f.porPagina };
      const grupos = primeiraDosGrupos && pagina > 1 ? await gruposDoRecorte(tx, recorte, pagFinal) : primeiraDosGrupos;
      const gruposFinal = grupos;
      const linhas = verLinhas ? await linhasDoRecorte(tx, recorte, pagFinal) : null;
      const fornecedores = modo === 'insumo' ? await gruposDoRecorte(tx, { ...recorte, agrupar: 'fornecedor' }, null) : null;
      const canceladas = f.situacao === 'lancadas' ? await canceladasDoRecorte(tx, recorte) : null;
      return {
        ...vazio,
        lojasUsadas: lojasDoAcesso.filter((l) => recorte.lojas.includes(l.id)),
        totais,
        grupos: gruposFinal,
        fornecedores,
        linhas,
        abertas,
        canceladas,
        semEmissao: f.base === 'emissao' && f.situacao === 'lancadas' ? await semEmissaoNoRecorte(tx, recorte) : null,
        aguardando: await documentosAguardando(tx, recorte.lojas),
        umInsumo: recorteDeUmInsumo(f) || (recorte.insumoIds?.length === 1),
        pagina,
        paginas,
      };
    },
    { repetivel: true, timeout: 30_000 },
  );
}

/** Tudo para a planilha e a impressão: o resumo, os grupos e as linhas, sem página, até o teto de cada um. */
export async function relatorioCompleto(cliente: ClienteDoParceiro, alcance: Alcance, f: FiltrosDoRelatorio, tetoDeLinhas: number) {
  return cliente.transacao(
    async (tx) => {
      const { recorte, lojasDoAcesso, motivo } = await resolverRecorte(tx, alcance, f);
      if (!recorte) return { motivoVazio: motivo, recorte: null, lojasUsadas: [] as { id: string; nome: string }[], totais: null, grupos: null, linhas: null, canceladas: null, semEmissao: null };
      // Em fila, na mesma fotografia (a transação tem uma conexão só).
      const totais = await totaisDoRecorte(tx, recorte);
      const grupos = await gruposDoRecorte(tx, recorte, null);
      const linhas = await linhasDoRecorte(tx, recorte, null, tetoDeLinhas);
      const canceladas = f.situacao === 'lancadas' ? await canceladasDoRecorte(tx, recorte) : null;
      return {
        motivoVazio: null,
        recorte,
        lojasUsadas: lojasDoAcesso.filter((l) => recorte.lojas.includes(l.id)),
        totais,
        grupos,
        linhas,
        canceladas,
        semEmissao: f.base === 'emissao' && f.situacao === 'lancadas' ? await semEmissaoNoRecorte(tx, recorte) : null,
      };
    },
    { repetivel: true, timeout: 60_000 },
  );
}
