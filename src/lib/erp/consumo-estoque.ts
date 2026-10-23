/**
 * Consumo e conciliação de estoque (L.4) — a leitura com banco. UM motor serve à tela, aos movimentos de cada número, à planilha e à
 * impressão: o mesmo recorte (lojas do acesso, período no relógio do Rio, insumo, categoria, atenção) vira o mesmo trecho de SQL,
 * então tela, total, exportação e impressão nunca discordam.
 *
 * - SÓ LÊ. Nenhum INSERT/UPDATE/DELETE: a baixa de insumo é da requisição, nunca da geração do relatório (teste conta as linhas).
 * - A fonte é o livro (`MovimentoEstoque`): quantidade em milésimos e dinheiro em centavos, com sinal, como o livro gravou. A
 *   classificação de cada movimento numa coluna é UMA só, aqui no SQL (`BUCKET`): um movimento nunca cai em duas colunas.
 * - Saldo inicial = soma do livro até o início do primeiro dia; final = até o fim do último. A ponte (inicial + movimentos = final)
 *   é conferida por uma segunda soma direta, e o livro é conferido com `SaldoEstoque` (a cópia de consulta).
 * - Quem vê: `estoque.ver`, por loja. R$ só para quem tem `compras.ver` em TODAS as lojas do recorte; sem isso o valor nem sai do
 *   banco para a tela. Loja pedida fora do acesso NUNCA amplia: o relatório sai vazio.
 * - Todas as leituras de uma tela acontecem numa transação de UMA fotografia (REPEATABLE READ).
 * - O SQL é fixo (só parâmetros); os trechos compartilhados são `Prisma.sql` montados aqui e conferidos pelo mesmo guarda do portão.
 */

import { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { conferirSqlDoParceiro, ErroDeRelatorio } from './tenant';
import { filtroDeLojas, pode, type Alcance } from './permissoes';
import { idsDeInsumoPelaBusca } from './busca';
import { FUSO_OPERACIONAL, somarDias } from './compras-relatorio-campos';
import type { Unidade } from './unidades';
import {
  BUCKETS_DA_COLUNA,
  LISTA_DE_BUCKETS,
  conferirPonte,
  lacunasDaLinha,
  type BucketId,
  type ColunaDeLink,
  type FiltrosDoConsumo,
  type Lacuna,
  type Soma,
  type SomasPorBucket,
} from './consumo-estoque-campos';

const BUCKETS_CONHECIDOS = new Set<string>(LISTA_DE_BUCKETS);

function guardado(f: Prisma.Sql): Prisma.Sql {
  conferirSqlDoParceiro(f.strings);
  return f;
}

/** O recorte já resolvido contra o acesso: o que o SQL recebe. */
export interface RecorteDoConsumo {
  parceiroId: string;
  lojas: string[];
  de: string;
  ate: string;
  /** O dia seguinte ao último: o fim aberto do intervalo [início, fim). */
  fim: string;
  /** null = qualquer insumo; lista (inclusive vazia) = só estes. */
  insumoIds: string[] | null;
  categoriaId: string | null;
  so: FiltrosDoConsumo['so'];
  /** Pode ver R$ em todas as lojas do recorte? Se não, o valor nem é lido para a tela. */
  verValores: boolean;
}

export interface OpcoesDoConsumo {
  lojas: { id: string; nome: string; ativa: boolean }[];
  categorias: { id: string; nome: string }[];
  listaDeInsumos: { id: string; nome: string }[];
  insumosTruncados: boolean;
}

// ------------------------------------------------------------------- o SQL

const INICIO = (r: RecorteDoConsumo) => guardado(Prisma.sql`((${r.de}::timestamp AT TIME ZONE ${FUSO_OPERACIONAL}::text) AT TIME ZONE 'UTC')`);
const FIM = (r: RecorteDoConsumo) => guardado(Prisma.sql`((${r.fim}::timestamp AT TIME ZONE ${FUSO_OPERACIONAL}::text) AT TIME ZONE 'UTC')`);

/** A versão de uma entrada de nota, lida da chave `compra:<nota>:<versão>:<ordem>` do movimento `a`; nula se a chave é de outro jeito. */
const VERSAO = (a: string) => `(CASE WHEN ${a}."chaveIdempotencia" ~ '^compra:[^:]+:[0-9]+:[0-9]+$' THEN split_part(${a}."chaveIdempotencia", ':', 3)::bigint END)`;

/**
 * Em que caixa cai o movimento `m` (com o original `o` se ele é estorno, a nota `n`, as versões da nota `nv` e `rp."doLote"`, se a
 * requisição é de um lote). A MESMA regra em toda consulta; a tela só rotula (`BUCKETS`). A ordem das regras importa: devolução e
 * relançamento da requisição vêm ANTES do "uso". Texto fixo, sem dado de fora.
 */
const BUCKET = `(CASE
      WHEN m."tipo" = 'ABERTURA' AND m."estornoDeId" IS NULL THEN 'abertura'
      WHEN m."tipo" = 'ENTRADA_COMPRA' AND m."estornoDeId" IS NULL THEN
        CASE WHEN ${VERSAO('m')} IS NULL OR nv."mn" IS NULL OR ${VERSAO('m')} <= nv."mn" THEN 'compra' ELSE 'nota_corrigida' END
      WHEN m."tipo" = 'ENTRADA_COMPRA' THEN
        CASE WHEN n."status"::text = 'CANCELADA' AND (${VERSAO('o')} IS NULL OR nv."mx" IS NULL OR ${VERSAO('o')} >= nv."mx") THEN 'nota_cancelada' ELSE 'nota_corrigida' END
      WHEN m."tipo" = 'PRODUCAO_ENTRADA' THEN CASE WHEN m."estornoDeId" IS NULL THEN 'producao' ELSE 'lote_estornado' END
      WHEN m."tipo" = 'REQUISICAO' THEN
        CASE WHEN m."estornoDeId" IS NOT NULL OR m."chaveIdempotencia" LIKE 'devolucao:%'
             THEN CASE WHEN rp."doLote" THEN 'devolucao_producao' ELSE 'devolucao_setor' END
             ELSE CASE WHEN rp."doLote" THEN 'uso_producao' ELSE 'uso_setor' END END
      WHEN m."tipo" = 'PRODUCAO_CONSUMO' AND m."estornoDeId" IS NULL THEN 'uso_producao'
      WHEN m."tipo" = 'PERDA' AND m."estornoDeId" IS NULL THEN 'perda'
      WHEN m."tipo" = 'CONTAGEM' AND m."estornoDeId" IS NULL THEN CASE WHEN m."quantidadeMilesimos" > 0 THEN 'contagem_sobra' ELSE 'contagem_falta' END
      WHEN m."tipo" = 'AJUSTE' AND m."estornoDeId" IS NULL THEN 'ajuste'
      ELSE 'estorno_outro'
    END)`;

/** Movimento sem nada que diga de onde veio: nenhum documento e (para perda e ajuste) nem motivo escrito. */
const SEM_ORIGEM = `(m."notaId" IS NULL AND m."notaItemId" IS NULL AND m."requisicaoItemId" IS NULL AND m."contagemItemId" IS NULL AND m."ordemProducaoId" IS NULL
      AND NOT (m."tipo"::text IN ('AJUSTE', 'PERDA') AND COALESCE(btrim(m."motivo"), '') <> ''))`;

conferirSqlDoParceiro([BUCKET, SEM_ORIGEM]);

interface OpcoesDaFonte {
  /** Só os movimentos do período (as somas por caixa); sem isso vêm todos (os saldos precisam do histórico). */
  soPeriodo?: boolean;
  /** Só estes pares (loja, insumo): a página que está na tela. */
  pares?: { lojaIds: string[]; insumoIds: string[] } | null;
}

/** Os movimentos do recorte, um por linha do livro, já com a caixa, o antes/depois do período e o que falta a cada consulta. */
export function fonteDoConsumo(r: RecorteDoConsumo, o: OpcoesDaFonte = {}): Prisma.Sql {
  const ids = r.insumoIds;
  const pares = o.pares ?? null;
  return guardado(Prisma.sql`
    SELECT
      m."id", m."lojaId", m."insumoId", m."tipo"::text AS "tipo", m."quantidadeMilesimos" AS "q",
      (CASE WHEN ${r.verValores}::boolean THEN m."valorCentavos" ELSE 0 END) AS "v",
      m."saldoAntesMilesimos" AS "antesDoMov", m."saldoDepoisMilesimos" AS "depois", m."ocorridoEm", m."criadoEm", m."unidadeSnapshot"::text AS "unidade",
      m."insumoNomeSnapshot", m."motivo", m."notaId", m."requisicaoItemId", m."contagemItemId", m."ordemProducaoId",
      (m."estornoDeId" IS NOT NULL) AS "estorno",
      (m."ocorridoEm" < ${INICIO(r)}) AS "antes",
      (m."ocorridoEm" < ${FIM(r)}) AS "ate",
      ${Prisma.raw(SEM_ORIGEM)} AS "semOrigem",
      ${Prisma.raw(BUCKET)} AS "bucket"
    FROM "MovimentoEstoque" m
    LEFT JOIN "MovimentoEstoque" o ON o."parceiroId" = m."parceiroId" AND o."id" = m."estornoDeId"
    LEFT JOIN "NotaEntrada" n ON n."parceiroId" = m."parceiroId" AND n."id" = m."notaId"
    LEFT JOIN LATERAL (
      SELECT MIN(x."ver") AS "mn", MAX(x."ver") AS "mx" FROM (
        SELECT (CASE WHEN e."chaveIdempotencia" ~ '^compra:[^:]+:[0-9]+:[0-9]+$' THEN split_part(e."chaveIdempotencia", ':', 3)::bigint END) AS "ver"
        FROM "MovimentoEstoque" e
        WHERE m."tipo" = 'ENTRADA_COMPRA' AND e."parceiroId" = m."parceiroId" AND e."notaId" = m."notaId" AND e."tipo" = 'ENTRADA_COMPRA' AND e."estornoDeId" IS NULL
      ) x
    ) nv ON TRUE
    LEFT JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM "RequisicaoItem" ri
        JOIN "OrdemProducao" op ON op."parceiroId" = ri."parceiroId" AND op."requisicaoId" = ri."requisicaoId"
        WHERE m."tipo" = 'REQUISICAO' AND ri."parceiroId" = m."parceiroId" AND ri."id" = m."requisicaoItemId"
      ) AS "doLote"
    ) rp ON TRUE
    WHERE m."parceiroId" = ${r.parceiroId}::text
      AND m."lojaId" = ANY(${r.lojas}::text[])
      AND (${ids}::text[] IS NULL OR m."insumoId" = ANY(${ids}::text[]))
      AND (NOT ${o.soPeriodo ?? false}::boolean OR (m."ocorridoEm" >= ${INICIO(r)} AND m."ocorridoEm" < ${FIM(r)}))
      AND (${pares ? pares.lojaIds : null}::text[] IS NULL OR EXISTS (
        SELECT 1 FROM unnest(${pares ? pares.lojaIds : null}::text[], ${pares ? pares.insumoIds : null}::text[]) AS p("l", "i")
        WHERE p."l" = m."lojaId" AND p."i" = m."insumoId"))`);
}

/** Uma linha por par (loja, insumo) do recorte, com os saldos e os contadores de lacuna. Tem de vir depois de `mov` na mesma consulta. */
function paresDoConsumo(r: RecorteDoConsumo): Prisma.Sql {
  return guardado(Prisma.sql`
    par AS (
      SELECT mv."lojaId", mv."insumoId",
        COALESCE(sum(mv."q") FILTER (WHERE mv."antes"), 0)::float8 AS "iq",
        COALESCE(sum(mv."v") FILTER (WHERE mv."antes"), 0)::float8 AS "iv",
        COALESCE(sum(mv."q") FILTER (WHERE mv."ate"), 0)::float8 AS "fq",
        COALESCE(sum(mv."v") FILTER (WHERE mv."ate"), 0)::float8 AS "fv",
        COALESCE(sum(mv."q"), 0)::float8 AS "totalq",
        (count(*) FILTER (WHERE NOT mv."antes" AND mv."ate"))::float8 AS "nDentro",
        (min(mv."depois") FILTER (WHERE NOT mv."antes" AND mv."ate"))::float8 AS "minSaldo",
        (count(*) FILTER (WHERE NOT mv."antes" AND mv."ate" AND mv."semOrigem"))::float8 AS "semOrigem",
        (count(*) FILTER (WHERE NOT mv."antes" AND mv."ate" AND mv."q" <> 0 AND mv."v" = 0))::float8 AS "semValor",
        (count(DISTINCT mv."unidade"))::float8 AS "unidades",
        min(mv."unidade") AS "unidade"
      FROM mov mv GROUP BY mv."lojaId", mv."insumoId"
    ),
    cont AS (
      SELECT c."lojaId", ci."insumoId",
        ((max(c."fechadaEm") AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO_OPERACIONAL}::text)::date AS "ultima",
        bool_or(c."fechadaEm" >= ${INICIO(r)}) AS "noPeriodo"
      FROM "ContagemItem" ci
      JOIN "Contagem" c ON c."parceiroId" = ci."parceiroId" AND c."id" = ci."contagemId"
      WHERE ci."parceiroId" = ${r.parceiroId}::text AND c."lojaId" = ANY(${r.lojas}::text[])
        AND c."status"::text = 'FECHADA' AND c."desfecho"::text IN ('APLICADA', 'APLICADA_SOZINHA')
        AND ci."contadoMilesimos" IS NOT NULL AND c."fechadaEm" < ${FIM(r)}
      GROUP BY c."lojaId", ci."insumoId"
    ),
    sel AS (
      SELECT p.*, l."nome" AS "loja", i."nome" AS "insumo", i."ativo", COALESCE(s."quantidadeMilesimos", 0)::float8 AS "guardado",
             ct."ultima", COALESCE(ct."noPeriodo", false) AS "contadoNoPeriodo",
             (p."fq" < 0 OR COALESCE(p."minSaldo", 0) < 0 OR p."semOrigem" > 0 OR COALESCE(s."quantidadeMilesimos", 0) <> p."totalq" OR p."unidades" > 1) AS "dura"
      FROM par p
      JOIN "Loja" l ON l."parceiroId" = ${r.parceiroId}::text AND l."id" = p."lojaId"
      JOIN "Insumo" i ON i."parceiroId" = ${r.parceiroId}::text AND i."id" = p."insumoId"
      LEFT JOIN "SaldoEstoque" s ON s."parceiroId" = ${r.parceiroId}::text AND s."lojaId" = p."lojaId" AND s."insumoId" = p."insumoId"
      LEFT JOIN cont ct ON ct."lojaId" = p."lojaId" AND ct."insumoId" = p."insumoId"
      WHERE (p."iq" <> 0 OR p."fq" <> 0 OR p."nDentro" > 0)
        AND (${r.categoriaId}::text IS NULL OR i."categoriaId" = ${r.categoriaId}::text)
    ),
    selecionados AS (
      SELECT * FROM sel x
      WHERE (${r.so}::text <> 'atencao' OR x."dura")
        AND (${r.so}::text <> 'semcontagem' OR (x."nDentro" > 0 AND NOT x."contadoNoPeriodo"))
    )`);
}

// ------------------------------------------------------------ as consultas

export interface LinhaDoConsumo {
  lojaId: string;
  loja: string;
  insumoId: string;
  insumo: string;
  unidade: Unidade;
  ativo: boolean;
  inicial: { q: number; v: number };
  final: { q: number; v: number };
  somas: SomasPorBucket;
  movimentosNoPeriodo: number;
  minSaldo: number | null;
  semOrigem: number;
  semValor: number;
  unidades: number;
  saldoGuardado: number;
  totalDoLivro: number;
  ultimaContagemEm: string | null;
  contadoNoPeriodo: boolean;
  /** inicial + movimentos = final (segunda soma direta, no livro). */
  confere: boolean;
  diferencaMilesimos: number;
  lacunas: Lacuna[];
}

const DIA = (d: Date | string | null) => (d === null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
const semValor = (r: RecorteDoConsumo, n: number) => (r.verValores ? n : 0);

interface ParLido {
  lojaId: string; insumoId: string; loja: string; insumo: string; ativo: boolean; unidade: string | null;
  iq: number; iv: number; fq: number; fv: number; totalq: number; nDentro: number; minSaldo: number | null;
  semOrigem: number; semValor: number; unidades: number; guardado: number; ultima: string | Date | null; contadoNoPeriodo: boolean; dura: boolean;
}

interface BucketLido {
  lojaId: string; insumoId: string; bucket: string; n: number; q: number; v: number;
}

function montarLinha(r: RecorteDoConsumo, p: ParLido, buckets: BucketLido[]): LinhaDoConsumo {
  const somas: SomasPorBucket = {};
  for (const b of buckets) {
    if (b.lojaId !== p.lojaId || b.insumoId !== p.insumoId || !BUCKETS_CONHECIDOS.has(b.bucket)) continue;
    const s = (somas[b.bucket as BucketId] ??= { n: 0, q: 0, v: 0 });
    s.n += b.n;
    s.q += b.q;
    s.v += r.verValores ? b.v : 0;
  }
  const unidade = (p.unidade ?? 'UN') as Unidade;
  const c = conferirPonte(p.iq, somas, p.fq);
  const base = {
    lojaId: p.lojaId,
    loja: p.loja,
    insumoId: p.insumoId,
    insumo: p.insumo,
    unidade,
    ativo: p.ativo,
    inicial: { q: p.iq, v: r.verValores ? p.iv : 0 },
    final: { q: p.fq, v: r.verValores ? p.fv : 0 },
    somas,
    movimentosNoPeriodo: p.nDentro,
    minSaldo: p.minSaldo,
    semOrigem: p.semOrigem,
    semValor: semValor(r, p.semValor),
    unidades: p.unidades,
    saldoGuardado: p.guardado,
    totalDoLivro: p.totalq,
    ultimaContagemEm: DIA(p.ultima),
    contadoNoPeriodo: p.contadoNoPeriodo,
    confere: c.fecha,
    diferencaMilesimos: c.diferencaMilesimos,
  };
  return {
    ...base,
    lacunas: lacunasDaLinha({
      unidade,
      finalMilesimos: p.fq,
      minSaldoMilesimos: p.minSaldo,
      movimentosNoPeriodo: p.nDentro,
      semOrigem: p.semOrigem,
      semValor: base.semValor,
      unidades: p.unidades,
      saldoGuardadoMilesimos: p.guardado,
      totalDoLivroMilesimos: p.totalq,
      contadoNoPeriodo: p.contadoNoPeriodo,
      ultimaContagemEm: base.ultimaContagemEm,
      verValores: r.verValores,
      finalCentavos: base.final.v,
    }),
  };
}

export interface ResumoDaUnidade {
  unidade: Unidade;
  /** Quantos insumos × lojas tem nesta unidade. */
  linhas: number;
  inicial: { q: number; v: number };
  final: { q: number; v: number };
  somas: SomasPorBucket;
  /** Soma das diferenças de ponte das linhas (zero quando tudo confere). */
  diferencaMilesimos: number;
}

export interface ResumoDoConsumo {
  linhas: number;
  comLacunaDura: number;
  semContagem: number;
  semValor: number;
  movimentosSemOrigem: number;
  unidades: ResumoDaUnidade[];
}

const ORDEM_DA_UNIDADE: Record<string, number> = { KG: 0, L: 1, UN: 2 };

export interface LeituraDoConsumo {
  /** O resumo de TUDO o que está no recorte (não só da página). */
  resumo: ResumoDoConsumo;
  linhas: LinhaDoConsumo[];
  /** Quantos insumos × lojas o recorte tem (todas as páginas). */
  total: number;
  numeroDaPagina: number;
  paginas: number;
  /** Só na leitura sem página: havia mais linhas que o teto (a lista foi cortada nele). */
  passouDoTeto: boolean;
}

/**
 * A leitura do relatório, numa consulta só: o livro é lido e classificado UMA vez (`mov`, materializado) e dela saem o resumo de tudo
 * o que está no recorte (por unidade, a ponte inteira, os contadores de lacuna), as linhas da página pedida (ou todas, até o teto) e
 * as caixas dessas linhas. Antes eram três leituras do livro por tela; a conta de cada número é a mesma de antes.
 * Pedida além da última página, cai na última. `janela.teto` lê sem página (planilha e impressão).
 */
export async function lerConsumo(tx: ClienteDoParceiro, r: RecorteDoConsumo, janela: { pagina: number; porPagina: number } | { teto: number }): Promise<LeituraDoConsumo> {
  const semPagina = 'teto' in janela;
  const limite = semPagina ? janela.teto + 1 : janela.porPagina;
  const pedida = semPagina ? 1 : janela.pagina;
  const lidos = await tx.sql<{ tipo: string; unidade: string | null; chave: string | null; n: number; q: number; v: number; extra: number; dados: Record<string, unknown> | null }>`
    WITH mov AS MATERIALIZED (${fonteDoConsumo(r)}),
    ${paresDoConsumo(r)},
    pag AS (
      SELECT s.*, row_number() OVER (ORDER BY s."loja", s."insumo", s."lojaId", s."insumoId")::float8 AS "ord",
             LEAST(GREATEST(1, ${pedida}::int), GREATEST(1, CEIL((count(*) OVER ())::float8 / ${limite}::int)::int)) AS "numero"
      FROM selecionados s
    ),
    pagina AS (
      SELECT * FROM pag WHERE "ord" > ("numero" - 1) * ${limite}::int AND "ord" <= "numero" * ${limite}::int
    )
    SELECT 'saldo'::text AS "tipo", s."unidade", NULL::text AS "chave", count(*)::float8 AS "n",
           sum(s."iq")::float8 AS "q", sum(s."iv")::float8 AS "v", 0::float8 AS "extra", NULL::jsonb AS "dados"
    FROM selecionados s GROUP BY s."unidade"
    UNION ALL
    SELECT 'final'::text, s."unidade", NULL::text, count(*)::float8, sum(s."fq")::float8, sum(s."fv")::float8, 0::float8, NULL::jsonb
    FROM selecionados s
    GROUP BY s."unidade"
    UNION ALL
    SELECT 'bucket'::text, s."unidade", mv."bucket", count(*)::float8, sum(mv."q")::float8, sum(mv."v")::float8, 0::float8, NULL::jsonb
    FROM mov mv JOIN selecionados s ON s."lojaId" = mv."lojaId" AND s."insumoId" = mv."insumoId"
    WHERE NOT mv."antes" AND mv."ate"
    GROUP BY s."unidade", mv."bucket"
    UNION ALL
    SELECT 'geral'::text, NULL::text, NULL::text, count(*)::float8, 0::float8, 0::float8, 0::float8, NULL::jsonb FROM selecionados
    UNION ALL
    SELECT 'dura'::text, NULL::text, NULL::text, (count(*) FILTER (WHERE s."dura"))::float8, 0::float8, 0::float8, 0::float8, NULL::jsonb FROM selecionados s
    UNION ALL
    SELECT 'semcontagem'::text, NULL::text, NULL::text, (count(*) FILTER (WHERE s."nDentro" > 0 AND NOT s."contadoNoPeriodo"))::float8, 0::float8, 0::float8, 0::float8, NULL::jsonb FROM selecionados s
    UNION ALL
    SELECT 'semvalor'::text, NULL::text, NULL::text, COALESCE(sum(s."semValor"), 0)::float8, 0::float8, 0::float8, 0::float8, NULL::jsonb FROM selecionados s
    UNION ALL
    SELECT 'semorigem'::text, NULL::text, NULL::text, COALESCE(sum(s."semOrigem"), 0)::float8, 0::float8, 0::float8, 0::float8, NULL::jsonb FROM selecionados s
    UNION ALL
    SELECT 'par'::text, NULL::text, NULL::text, 0::float8, 0::float8, 0::float8, p."ord",
           jsonb_build_object(
             'lojaId', p."lojaId", 'insumoId', p."insumoId", 'loja', p."loja", 'insumo', p."insumo", 'ativo', p."ativo", 'unidade', p."unidade",
             'iq', p."iq", 'iv', p."iv", 'fq', p."fq", 'fv', p."fv", 'totalq', p."totalq", 'nDentro', p."nDentro", 'minSaldo', p."minSaldo",
             'semOrigem', p."semOrigem", 'semValor', p."semValor", 'unidades', p."unidades", 'guardado', p."guardado", 'ultima', p."ultima",
             'contadoNoPeriodo', p."contadoNoPeriodo", 'dura', p."dura")
    FROM pagina p
    UNION ALL
    SELECT 'caixa'::text, NULL::text, NULL::text, count(*)::float8, sum(mv."q")::float8, sum(mv."v")::float8, 0::float8,
           jsonb_build_object('lojaId', mv."lojaId", 'insumoId', mv."insumoId", 'bucket', mv."bucket")
    FROM mov mv JOIN pagina p ON p."lojaId" = mv."lojaId" AND p."insumoId" = mv."insumoId"
    WHERE NOT mv."antes" AND mv."ate"
    GROUP BY mv."lojaId", mv."insumoId", mv."bucket"`;
  const porUnidade = new Map<string, ResumoDaUnidade>();
  const da = (u: string | null) => {
    const k = u ?? 'UN';
    let x = porUnidade.get(k);
    if (!x) {
      x = { unidade: k as Unidade, linhas: 0, inicial: { q: 0, v: 0 }, final: { q: 0, v: 0 }, somas: {}, diferencaMilesimos: 0 };
      porUnidade.set(k, x);
    }
    return x;
  };
  let linhas = 0;
  let comLacunaDura = 0;
  let semContagem = 0;
  let semVal = 0;
  let semOrigem = 0;
  const pares: { ord: number; par: ParLido }[] = [];
  const caixas: BucketLido[] = [];
  for (const l of lidos) {
    if (l.tipo === 'saldo') {
      const u = da(l.unidade);
      u.linhas = l.n;
      u.inicial = { q: l.q, v: r.verValores ? l.v : 0 };
    } else if (l.tipo === 'final') {
      const u = da(l.unidade);
      u.final = { q: l.q, v: r.verValores ? l.v : 0 };
    } else if (l.tipo === 'bucket' && l.chave && BUCKETS_CONHECIDOS.has(l.chave)) {
      const s: Soma = (da(l.unidade).somas[l.chave as BucketId] ??= { n: 0, q: 0, v: 0 });
      s.n += l.n;
      s.q += l.q;
      s.v += r.verValores ? l.v : 0;
    } else if (l.tipo === 'geral') linhas = l.n;
    else if (l.tipo === 'dura') comLacunaDura = l.n;
    else if (l.tipo === 'semcontagem') semContagem = l.n;
    else if (l.tipo === 'semvalor') semVal = l.n;
    else if (l.tipo === 'semorigem') semOrigem = l.n;
    else if (l.tipo === 'par' && l.dados) pares.push({ ord: l.extra, par: l.dados as unknown as ParLido });
    else if (l.tipo === 'caixa' && l.dados) caixas.push({ ...(l.dados as { lojaId: string; insumoId: string; bucket: string }), n: l.n, q: l.q, v: l.v });
  }
  // A ponte da unidade: o final lido por soma direta no livro contra o inicial mais a soma das caixas (nenhum movimento fica sem caixa).
  for (const u of Array.from(porUnidade.values())) u.diferencaMilesimos = u.final.q - (u.inicial.q + LISTA_DE_BUCKETS.reduce((t, b) => t + (u.somas[b]?.q ?? 0), 0));
  const resumo: ResumoDoConsumo = {
    linhas,
    comLacunaDura,
    semContagem,
    semValor: semValor(r, semVal),
    movimentosSemOrigem: semOrigem,
    unidades: Array.from(porUnidade.values()).sort((a, b) => (ORDEM_DA_UNIDADE[a.unidade] ?? 9) - (ORDEM_DA_UNIDADE[b.unidade] ?? 9)),
  };
  const doBanco = pares.sort((a, b) => a.ord - b.ord).map((x) => montarLinha(r, x.par, caixas));
  const paginas = semPagina ? 1 : Math.max(1, Math.ceil(linhas / limite));
  return {
    resumo,
    linhas: semPagina ? doBanco.slice(0, janela.teto) : doBanco,
    total: linhas,
    numeroDaPagina: Math.min(Math.max(1, pedida), paginas),
    paginas,
    passouDoTeto: semPagina && doBanco.length > janela.teto,
  };
}

// ---------------------------------------------------------- os movimentos

export interface MovimentoDoConsumo {
  id: string;
  lojaId: string;
  loja: string;
  insumoId: string;
  insumo: string;
  unidade: Unidade;
  tipo: string;
  bucket: BucketId;
  estorno: boolean;
  quantidadeMilesimos: number;
  valorCentavos: number;
  antesMilesimos: number;
  depoisMilesimos: number;
  /** O instante em que o movimento entrou no livro (ISO, UTC). */
  ocorridoEm: string;
  motivo: string | null;
  semOrigem: boolean;
  notaId: string | null;
  requisicaoId: string | null;
  requisicaoNumero: number | null;
  /** Contagem que gerou o movimento e se foi a abertura. */
  contagemId: string | null;
  contagemTipo: string | null;
  contagemTitulo: string | null;
  ordemProducaoId: string | null;
  codigoLote: string | null;
}

/** Os movimentos que um número abre: os baldes da coluna (ou só um balde), ou todos os que formam o saldo inicial / final. */
function filtroDoLink(col: ColunaDeLink, bucket: BucketId | ''): Prisma.Sql {
  if (col === 'inicial') return Prisma.sql`mv."antes"`;
  if (col === 'final') return Prisma.sql`mv."ate"`;
  const baldes: string[] = bucket && BUCKETS_DA_COLUNA[col].includes(bucket) ? [bucket] : BUCKETS_DA_COLUNA[col];
  return Prisma.sql`(NOT mv."antes" AND mv."ate" AND mv."bucket" = ANY(${baldes}::text[]))`;
}

/** Os movimentos que formam um número (a coluna aberta), do mais novo ao mais velho, paginados no banco; com o total e a soma. */
export async function movimentosDoConsumo(tx: ClienteDoParceiro, r: RecorteDoConsumo, col: ColunaDeLink, pagina: { numero: number; porPagina: number } | null, teto: number, bucket: BucketId | '' = '') {
  const limite = pagina ? pagina.porPagina : teto + 1;
  const deslocamento = pagina ? (pagina.numero - 1) * pagina.porPagina : 0;
  // "Só o que pede atenção" e "só sem contagem" também valem para os movimentos: a lista é a dos insumos que o resumo contou.
  const restrito = r.so !== '';
  const cte = restrito ? Prisma.sql`WITH mov AS MATERIALIZED (${fonteDoConsumo(r)}), ${paresDoConsumo(r)}` : Prisma.sql`WITH mov AS (${fonteDoConsumo(r)})`;
  const juntar = restrito ? Prisma.sql`JOIN selecionados s ON s."lojaId" = mv."lojaId" AND s."insumoId" = mv."insumoId"` : Prisma.empty;
  const consulta = Prisma.sql`
    ${cte}
    SELECT mv."id", mv."lojaId", l."nome" AS "loja", mv."insumoId", COALESCE(i."nome", mv."insumoNomeSnapshot") AS "insumo", mv."unidade", mv."tipo", mv."bucket", mv."estorno",
           mv."q", mv."v", mv."antesDoMov", mv."depois", mv."ocorridoEm", mv."motivo", mv."semOrigem", mv."notaId",
           ri."requisicaoId", rq."numero" AS "requisicaoNumero", ci."contagemId", ct."tipo"::text AS "contagemTipo", ct."titulo" AS "contagemTitulo",
           COALESCE(mv."ordemProducaoId", opr."id") AS "ordemProducaoId", COALESCE(op."codigoLote", opr."codigoLote") AS "codigoLote",
           count(*) OVER ()::float8 AS "quantos", (sum(mv."q") OVER ())::float8 AS "somaq", (sum(mv."v") OVER ())::float8 AS "somav",
           (min(mv."unidade") OVER ()) AS "uMin", (max(mv."unidade") OVER ()) AS "uMax"
    FROM mov mv
    ${juntar}
    JOIN "Loja" l ON l."parceiroId" = ${r.parceiroId}::text AND l."id" = mv."lojaId"
    JOIN "Insumo" i ON i."parceiroId" = ${r.parceiroId}::text AND i."id" = mv."insumoId"
    LEFT JOIN "RequisicaoItem" ri ON ri."parceiroId" = ${r.parceiroId}::text AND ri."id" = mv."requisicaoItemId"
    LEFT JOIN "Requisicao" rq ON rq."parceiroId" = ${r.parceiroId}::text AND rq."id" = ri."requisicaoId"
    LEFT JOIN "ContagemItem" ci ON ci."parceiroId" = ${r.parceiroId}::text AND ci."id" = mv."contagemItemId"
    LEFT JOIN "Contagem" ct ON ct."parceiroId" = ${r.parceiroId}::text AND ct."id" = ci."contagemId"
    LEFT JOIN "OrdemProducao" op ON op."parceiroId" = ${r.parceiroId}::text AND op."id" = mv."ordemProducaoId"
    LEFT JOIN "OrdemProducao" opr ON opr."parceiroId" = ${r.parceiroId}::text AND opr."requisicaoId" = ri."requisicaoId"
    WHERE (${r.categoriaId}::text IS NULL OR i."categoriaId" = ${r.categoriaId}::text)
      AND ${filtroDoLink(col, bucket)}
    ORDER BY mv."ocorridoEm" DESC, mv."criadoEm" DESC, mv."id" DESC
    LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  const lidos = await tx.sql<{
    id: string; lojaId: string; loja: string; insumoId: string; insumo: string; unidade: string; tipo: string; bucket: string; estorno: boolean;
    q: number; v: number; antesDoMov: number; depois: number; ocorridoEm: Date; motivo: string | null; semOrigem: boolean;
    notaId: string | null; requisicaoId: string | null; requisicaoNumero: number | null; contagemId: string | null; contagemTipo: string | null; contagemTitulo: string | null;
    ordemProducaoId: string | null; codigoLote: string | null; quantos: number; somaq: number; somav: number; uMin: string; uMax: string;
  }>`${consulta}`;
  const movimentos = (pagina ? lidos : lidos.slice(0, teto)).map(
    (m): MovimentoDoConsumo => ({
      id: m.id,
      lojaId: m.lojaId,
      loja: m.loja,
      insumoId: m.insumoId,
      insumo: m.insumo,
      unidade: m.unidade as Unidade,
      tipo: m.tipo,
      bucket: (BUCKETS_CONHECIDOS.has(m.bucket) ? m.bucket : 'estorno_outro') as BucketId,
      estorno: m.estorno,
      quantidadeMilesimos: m.q,
      valorCentavos: r.verValores ? m.v : 0,
      antesMilesimos: m.antesDoMov,
      depoisMilesimos: m.depois,
      ocorridoEm: m.ocorridoEm.toISOString(),
      motivo: m.motivo,
      semOrigem: m.semOrigem,
      notaId: m.notaId,
      requisicaoId: m.requisicaoId,
      requisicaoNumero: m.requisicaoNumero,
      contagemId: m.contagemId,
      contagemTipo: m.contagemTipo,
      contagemTitulo: m.contagemTitulo,
      ordemProducaoId: m.ordemProducaoId,
      codigoLote: m.codigoLote,
    }),
  );
  const um = lidos[0] && lidos[0].uMin === lidos[0].uMax ? (lidos[0].uMin as Unidade) : null;
  return {
    movimentos,
    total: lidos[0]?.quantos ?? 0,
    /** A soma só quer dizer alguma coisa com UMA unidade (kg e L não se somam): nula se misturou. */
    unidadeUnica: um,
    somaMilesimos: lidos[0]?.somaq ?? 0,
    somaCentavos: r.verValores ? (lidos[0]?.somav ?? 0) : 0,
    passouDoTeto: !pagina && lidos.length > teto,
  };
}

// -------------------------------------------------------------- avisos de fora do livro

/** Notas fiscais (XML) que ainda aguardam conferência nas lojas escolhidas: NÃO são entrada de estoque e ficam fora. */
export async function documentosAguardandoDoConsumo(tx: ClienteDoParceiro, lojas: string[]): Promise<number> {
  const [t] = await tx.sql<{ n: number }>`
    SELECT count(*)::float8 AS "n" FROM "DocumentoFiscal"
    WHERE "parceiroId" = ${tx.parceiroId}::text AND "situacao" = 'AGUARDANDO_CONFERENCIA'::"SituacaoDocumentoFiscal" AND "lojaId" = ANY(${lojas}::text[])`;
  return t?.n ?? 0;
}

/** Contagens abertas (começaram e não foram aplicadas) nas lojas escolhidas: o que se contou ainda não entrou no livro. */
export async function contagensEmAndamento(tx: ClienteDoParceiro, lojas: string[]): Promise<number> {
  const [t] = await tx.sql<{ n: number }>`
    SELECT count(*)::float8 AS "n" FROM "Contagem"
    WHERE "parceiroId" = ${tx.parceiroId}::text AND "lojaId" = ANY(${lojas}::text[]) AND "status"::text = 'ABERTA' AND "tipo"::text <> 'ABERTURA'`;
  return t?.n ?? 0;
}

/** Lojas do recorte que ainda não concluíram a abertura do estoque (sem abertura não há saldo nem movimento). */
export async function lojasSemEstoqueAberto(tx: ClienteDoParceiro, lojas: { id: string; nome: string }[]): Promise<string[]> {
  if (lojas.length === 0) return [];
  const abertas = await tx.sql<{ lojaId: string }>`
    SELECT DISTINCT "lojaId" FROM "Contagem"
    WHERE "parceiroId" = ${tx.parceiroId}::text AND "lojaId" = ANY(${lojas.map((l) => l.id)}::text[]) AND "tipo"::text = 'ABERTURA' AND "status"::text = 'FECHADA'`;
  const ok = new Set(abertas.map((a) => a.lojaId));
  return lojas.filter((l) => !ok.has(l.id)).map((l) => l.nome);
}

// -------------------------------------------------------------- o recorte

const LIMITE_DE_INSUMOS_NA_LISTA = 1000;

/** Resolve o que a pessoa pediu contra o que ela pode ver. Sem `estoque.ver` em nenhuma loja, ou sem nenhuma loja, não há recorte. */
export async function resolverRecorteDoConsumo(tx: ClienteDoParceiro, alcance: Alcance, f: FiltrosDoConsumo) {
  const doAcesso = await tx.loja.findMany({ where: { id: filtroDeLojas(alcance) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, ativa: true } });
  const lojasDoAcesso = doAcesso.filter((l) => pode(alcance, 'estoque.ver', { lojaId: l.id }));
  if (lojasDoAcesso.length === 0) return { recorte: null as RecorteDoConsumo | null, lojasDoAcesso, motivo: 'sem-permissao' as const };
  const permitidas = new Set(lojasDoAcesso.map((l) => l.id));
  // Loja pedida fora do acesso nunca amplia o relatório: sobra só o que ela pode ver e, se não sobra nada, o relatório sai vazio.
  const lojas = f.lojaIds.length ? f.lojaIds.filter((l) => permitidas.has(l)) : lojasDoAcesso.map((l) => l.id);
  if (lojas.length === 0 || f.periodoInvalido) return { recorte: null, lojasDoAcesso, motivo: f.periodoInvalido ? ('periodo' as const) : ('sem-loja' as const) };
  let insumoIds: string[] | null = null;
  if (f.insumoId) insumoIds = [f.insumoId];
  else if (f.q) insumoIds = (await idsDeInsumoPelaBusca(tx, f.q)) ?? null;
  const recorte: RecorteDoConsumo = {
    parceiroId: tx.parceiroId,
    lojas,
    de: f.de,
    ate: f.ate,
    fim: somarDias(f.ate, 1),
    insumoIds,
    categoriaId: f.categoriaId || null,
    so: f.so,
    verValores: lojas.every((id) => pode(alcance, 'compras.ver', { lojaId: id })),
  };
  return { recorte, lojasDoAcesso, motivo: null };
}

/** Os seletores dos filtros: só o que a pessoa pode ver (lojas do acesso; insumos que têm movimento nelas). */
export async function opcoesDoConsumo(tx: ClienteDoParceiro, lojasDoAcesso: OpcoesDoConsumo['lojas'], f: Pick<FiltrosDoConsumo, 'q'>): Promise<OpcoesDoConsumo> {
  const lojaIds = lojasDoAcesso.map((l) => l.id);
  const ids = f.q ? await idsDeInsumoPelaBusca(tx, f.q) : null;
  const categorias = await tx.categoriaInsumo.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true } });
  const insumos = await tx.sql<{ id: string; nome: string }>`
    SELECT i."id", i."nome" FROM "Insumo" i
    WHERE i."parceiroId" = ${tx.parceiroId}::text
      AND (${ids}::text[] IS NULL OR i."id" = ANY(${ids}::text[]))
      AND EXISTS (SELECT 1 FROM "SaldoEstoque" s WHERE s."parceiroId" = i."parceiroId" AND s."insumoId" = i."id" AND s."lojaId" = ANY(${lojaIds}::text[]))
    ORDER BY i."nome", i."id"
    LIMIT ${LIMITE_DE_INSUMOS_NA_LISTA + 1}::int`;
  return {
    lojas: lojasDoAcesso,
    categorias,
    listaDeInsumos: insumos.slice(0, LIMITE_DE_INSUMOS_NA_LISTA),
    insumosTruncados: insumos.length > LIMITE_DE_INSUMOS_NA_LISTA,
  };
}

// ------------------------------------------------------- o relatório da tela

/** O relatório não coube agora (grande demais ou servidor ocupado): a frase para a pessoa, no lugar dos números. */
export interface RelatorioQueNaoCaiu {
  motivo: 'tempo' | 'ocupado';
  titulo: string;
  texto: string;
}

const queNaoCaiu = (e: ErroDeRelatorio): RelatorioQueNaoCaiu => ({ motivo: e.motivo, titulo: e.titulo, texto: e.texto });

export interface ConsumoDaTela {
  motivoVazio: 'sem-permissao' | 'sem-loja' | 'periodo' | 'demorou' | null;
  /** Só com `motivoVazio: 'demorou'`. */
  demorou: RelatorioQueNaoCaiu | null;
  opcoes: OpcoesDoConsumo;
  lojasUsadas: { id: string; nome: string }[];
  verValores: boolean;
  resumo: ResumoDoConsumo | null;
  pagina: { linhas: LinhaDoConsumo[]; total: number } | null;
  aguardando: number;
  contagensEmAndamento: number;
  lojasSemEstoque: string[];
  numeroDaPagina: number;
  paginas: number;
}

const SEM_OPCOES: OpcoesDoConsumo = { lojas: [], categorias: [], listaDeInsumos: [], insumosTruncados: false };

const semNumeros = (motivo: ConsumoDaTela['motivoVazio'], opcoes: OpcoesDoConsumo): ConsumoDaTela => ({
  motivoVazio: motivo,
  demorou: null,
  opcoes,
  lojasUsadas: [],
  verValores: false,
  resumo: null,
  pagina: null,
  aguardando: 0,
  contagensEmAndamento: 0,
  lojasSemEstoque: [],
  numeroDaPagina: 1,
  paginas: 1,
});

/** Tudo o que a tela principal precisa, numa fotografia só do banco (transação de relatório: somente leitura, com teto de tempo). */
export async function consumoDaTela(cliente: ClienteDoParceiro, alcance: Alcance, f: FiltrosDoConsumo): Promise<ConsumoDaTela> {
  try {
    return await cliente.transacao(
      async (tx) => {
        const { recorte, lojasDoAcesso, motivo } = await resolverRecorteDoConsumo(tx, alcance, f);
        const opcoes = motivo === 'sem-permissao' ? SEM_OPCOES : await opcoesDoConsumo(tx, lojasDoAcesso, f);
        if (!recorte) return semNumeros(motivo, opcoes);
        const lojasUsadas = lojasDoAcesso.filter((l) => recorte.lojas.includes(l.id));
        // O livro é lido UMA vez: o resumo, a página e as caixas dela saem da mesma consulta (a página pedida além da última cai na última).
        const lido = await lerConsumo(tx, recorte, { pagina: f.pagina, porPagina: f.porPagina });
        return {
          ...semNumeros(null, opcoes),
          lojasUsadas,
          verValores: recorte.verValores,
          resumo: lido.resumo,
          pagina: { linhas: lido.linhas, total: lido.total },
          aguardando: await documentosAguardandoDoConsumo(tx, recorte.lojas),
          contagensEmAndamento: await contagensEmAndamento(tx, recorte.lojas),
          lojasSemEstoque: await lojasSemEstoqueAberto(tx, lojasUsadas),
          numeroDaPagina: lido.numeroDaPagina,
          paginas: lido.paginas,
        };
      },
      { repetivel: true, relatorio: {} },
    );
  } catch (e) {
    if (!(e instanceof ErroDeRelatorio)) throw e;
    // Não coube: a tela sai com os filtros (uma leitura leve, fora da vaga do relatório) e a frase, sem 500.
    const opcoes = await cliente.transacao(async (tx) => {
      const { lojasDoAcesso, motivo } = await resolverRecorteDoConsumo(tx, alcance, f);
      return motivo === 'sem-permissao' ? SEM_OPCOES : opcoesDoConsumo(tx, lojasDoAcesso, f);
    });
    return { ...semNumeros('demorou', opcoes), demorou: queNaoCaiu(e) };
  }
}

export type ConsumoCompleto =
  | { motivoVazio: 'sem-permissao' | 'sem-loja' | 'periodo' | null; demorou: null; recorte: null; lojasUsadas: { id: string; nome: string }[]; resumo: null; linhas: null; aguardando: number; contagensEmAndamento: number; lojasSemEstoque: string[] }
  | { motivoVazio: 'demorou'; demorou: RelatorioQueNaoCaiu; recorte: null; lojasUsadas: { id: string; nome: string }[]; resumo: null; linhas: null; aguardando: number; contagensEmAndamento: number; lojasSemEstoque: string[] }
  | { motivoVazio: null; demorou: null; recorte: RecorteDoConsumo; lojasUsadas: { id: string; nome: string }[]; resumo: ResumoDoConsumo; linhas: Pick<LeituraDoConsumo, 'linhas' | 'total' | 'passouDoTeto'>; aguardando: number; contagensEmAndamento: number; lojasSemEstoque: string[] };

/** Tudo para a planilha e a impressão: o resumo e as linhas inteiras (sem página), até o teto. */
export async function consumoCompleto(cliente: ClienteDoParceiro, alcance: Alcance, f: FiltrosDoConsumo, teto: number): Promise<ConsumoCompleto> {
  const nada = () => ({ recorte: null, lojasUsadas: [] as { id: string; nome: string }[], resumo: null, linhas: null, aguardando: 0, contagensEmAndamento: 0, lojasSemEstoque: [] as string[] });
  try {
    return await cliente.transacao(
      async (tx): Promise<ConsumoCompleto> => {
        const { recorte, lojasDoAcesso, motivo } = await resolverRecorteDoConsumo(tx, alcance, f);
        if (!recorte) return { ...nada(), motivoVazio: motivo, demorou: null };
        const lojasUsadas = lojasDoAcesso.filter((l) => recorte.lojas.includes(l.id));
        const lido = await lerConsumo(tx, recorte, { teto });
        return {
          motivoVazio: null,
          demorou: null,
          recorte,
          lojasUsadas,
          resumo: lido.resumo,
          linhas: { linhas: lido.linhas, total: lido.total, passouDoTeto: lido.passouDoTeto },
          aguardando: await documentosAguardandoDoConsumo(tx, recorte.lojas),
          contagensEmAndamento: await contagensEmAndamento(tx, recorte.lojas),
          lojasSemEstoque: await lojasSemEstoqueAberto(tx, lojasUsadas),
        };
      },
      { repetivel: true, relatorio: {} },
    );
  } catch (e) {
    if (!(e instanceof ErroDeRelatorio)) throw e;
    return { ...nada(), motivoVazio: 'demorou', demorou: queNaoCaiu(e) };
  }
}

export interface MovimentosDaTela {
  motivoVazio: 'sem-permissao' | 'sem-loja' | 'periodo' | 'demorou' | null;
  /** Só com `motivoVazio: 'demorou'`. */
  demorou: RelatorioQueNaoCaiu | null;
  opcoes: OpcoesDoConsumo;
  lojasUsadas: { id: string; nome: string }[];
  verValores: boolean;
  lista: Awaited<ReturnType<typeof movimentosDoConsumo>> | null;
  numeroDaPagina: number;
  paginas: number;
}

/** Os movimentos que formam um número do relatório (a coluna `f.col`), para a tela "Movimentos". */
export async function movimentosDaTela(cliente: ClienteDoParceiro, alcance: Alcance, f: FiltrosDoConsumo): Promise<MovimentosDaTela> {
  try {
    return await cliente.transacao(
      async (tx) => {
        const { recorte, lojasDoAcesso, motivo } = await resolverRecorteDoConsumo(tx, alcance, f);
        const opcoes = motivo === 'sem-permissao' ? SEM_OPCOES : await opcoesDoConsumo(tx, lojasDoAcesso, f);
        const vazio: MovimentosDaTela = { motivoVazio: motivo, demorou: null, opcoes, lojasUsadas: [], verValores: false, lista: null, numeroDaPagina: 1, paginas: 1 };
        if (!recorte || !f.col) return vazio;
        const primeira = await movimentosDoConsumo(tx, recorte, f.col, { numero: 1, porPagina: f.porPagina }, 0, f.bucket);
        const paginas = Math.max(1, Math.ceil(primeira.total / f.porPagina));
        const numero = Math.min(Math.max(1, f.pagina), paginas);
        const lista = numero === 1 ? primeira : await movimentosDoConsumo(tx, recorte, f.col, { numero, porPagina: f.porPagina }, 0, f.bucket);
        return { ...vazio, motivoVazio: null, lojasUsadas: lojasDoAcesso.filter((l) => recorte.lojas.includes(l.id)), verValores: recorte.verValores, lista, numeroDaPagina: numero, paginas };
      },
      { repetivel: true, relatorio: {} },
    );
  } catch (e) {
    if (!(e instanceof ErroDeRelatorio)) throw e;
    const opcoes = await cliente.transacao(async (tx) => {
      const { lojasDoAcesso, motivo } = await resolverRecorteDoConsumo(tx, alcance, f);
      return motivo === 'sem-permissao' ? SEM_OPCOES : opcoesDoConsumo(tx, lojasDoAcesso, f);
    });
    return { motivoVazio: 'demorou', demorou: queNaoCaiu(e), opcoes, lojasUsadas: [], verValores: false, lista: null, numeroDaPagina: 1, paginas: 1 };
  }
}
