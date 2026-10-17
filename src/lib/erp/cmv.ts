/**
 * Os dois CMVs (2.3) — a leitura com banco. Chamada SÓ por `entradaDoDre` (a leitura única do DRE): o DRE ao
 * vivo e a fotografia do fechamento leem o CMV pelo mesmo caminho, como já leem a receita e a despesa.
 *
 * Tudo vem em consultas AGRUPADAS por loja (o número de consultas é o mesmo com 1 ou com 50 lojas):
 *  1. as notas LANÇADAS do recorte, pela data da nota (`entradaEm`) → o CMV de compra;
 *  2. as entradas de compra que o livro registrou das notas do período → as compras do real;
 *  3. a abertura do estoque de cada loja;
 *  4. os fechamentos de estoque APLICADOS do período e do anterior;
 *  5. o corte do estoque final de cada fechamento (decisão 162), somado no banco.
 *
 * O corte é a regra da análise: o retrato do fechamento (um instante) vale para o período dele, menos o que
 * ele já trazia de depois do fim, mais o que entrou depois dele e ainda é do período. Competência de um
 * movimento = a data da nota (compra, e o estorno dela) ou o dia do Rio em que entrou no livro (o resto).
 * Os ajustes do próprio fechamento não entram em nenhum dos dois lados.
 *
 * Premissa: a data da nota nunca é depois do dia em que ela é lançada (`compra-campos`), então todo
 * movimento do lado "até o retrato, do período seguinte" aconteceu a partir do dia anterior ao fim do período.
 */

import { hojeNoRio } from './compra-campos';
import { apurarReal, type AberturaDeEstoque, type CmvDaLoja, type CmvDoDre, type FechoDeEstoque } from './cmv-campos';
import { janelaDoFechamento, somarDias } from './contagem-campos';
import type { Periodo } from './periodo-campos';
import { periodoDe } from './periodos';
import type { ClienteDoParceiro } from './tenant';

const dataDoBanco = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const numero = (v: unknown) => Number(v ?? 0);

export interface LojaParaOCmv {
  id: string;
  nome: string;
}

/** Os tipos de movimento: listá-los todos deixa o banco usar o índice por (loja, tipo, instante). */
const TIPOS_DE_MOVIMENTO = ['ABERTURA', 'ENTRADA_COMPRA', 'REQUISICAO', 'PRODUCAO_ENTRADA', 'PRODUCAO_CONSUMO', 'AJUSTE', 'CONTAGEM', 'PERDA'];

/**
 * O CMV de cada loja no recorte [periodo.inicio, ate]. `ate` é o último dia apurado (ontem, no período em
 * curso; o último dia, no encerrado); nulo = nenhum dia apurado (sem compra, sem real).
 */
export async function cmvDasLojas(
  tx: ClienteDoParceiro,
  lojas: readonly LojaParaOCmv[],
  periodo: Periodo,
  ate: string | null,
  hoje: string,
  anterior: Periodo | null,
): Promise<CmvDoDre> {
  const encerrado = periodo.fim < hoje;
  const parcial = !encerrado;
  if (lojas.length === 0) return { lojas: [], parcial };
  const ids = lojas.map((l) => l.id);

  // ---- 1. o CMV de compra: notas lançadas, pela data da nota
  const compras = new Map<string, number>();
  if (ate) {
    const linhas = await tx.sql<{ lojaId: string; centavos: bigint }>`
      SELECT n."lojaId", sum(i."valorTotalCentavos" + i."freteRateadoCentavos")::bigint AS "centavos"
      FROM "NotaEntrada" n
      JOIN "NotaEntradaItem" i ON i."parceiroId" = n."parceiroId" AND i."notaId" = n."id"
      WHERE n."parceiroId" = ${tx.parceiroId} AND n."lojaId" = ANY(${ids}::text[])
        AND n."status" = 'LANCADA' AND n."entradaEm" >= ${periodo.inicio}::date AND n."entradaEm" <= ${ate}::date
      GROUP BY n."lojaId"`;
    for (const l of linhas) compras.set(l.lojaId, numero(l.centavos));
  }

  // ---- 2 a 5: só o período encerrado tem real
  const comprasReais = new Map<string, number>();
  const aberturas = new Map<string, AberturaDeEstoque>();
  const fechosDoPeriodo = new Map<string, FechoDeEstoque>();
  const fechosAnteriores = new Map<string, FechoDeEstoque>();
  let proximoNome = '';

  const abertas = await tx.contagem.findMany({
    where: { tipo: 'ABERTURA', status: { not: 'CANCELADA' }, lojaId: { in: ids } },
    select: { id: true, lojaId: true, status: true, fechadaEm: true, valorTotalCentavos: true, itensSemPreco: true },
  });
  for (const a of abertas) {
    aberturas.set(a.lojaId, {
      id: a.id,
      status: a.status === 'FECHADA' ? 'FECHADA' : 'ABERTA',
      diaConcluida: a.fechadaEm ? hojeNoRio(a.fechadaEm) : null,
      valorTotalCentavos: a.valorTotalCentavos,
      itensSemPreco: a.itensSemPreco,
    });
  }

  if (encerrado) {
    const reais = await tx.sql<{ lojaId: string; centavos: bigint }>`
      SELECT m."lojaId", sum(m."valorCentavos")::bigint AS "centavos"
      FROM "NotaEntrada" n
      JOIN "MovimentoEstoque" m ON m."parceiroId" = n."parceiroId" AND m."notaId" = n."id"
      WHERE n."parceiroId" = ${tx.parceiroId} AND n."entradaEm" >= ${periodo.inicio}::date AND n."entradaEm" <= ${periodo.fim}::date
        AND m."lojaId" = ANY(${ids}::text[]) AND m."tipo" = 'ENTRADA_COMPRA'
      GROUP BY m."lojaId"`;
    for (const r of reais) comprasReais.set(r.lojaId, numero(r.centavos));

    const quais = [periodo, ...(anterior ? [anterior] : [])];
    const fechos = await tx.contagem.findMany({
      where: {
        tipo: 'FECHAMENTO',
        status: 'FECHADA',
        desfecho: { in: ['APLICADA', 'APLICADA_SOZINHA'] },
        lojaId: { in: ids },
        OR: quais.map((p) => ({ periodo: { inicio: dataDoBanco(p.inicio), fim: dataDoBanco(p.fim) } })),
      },
      select: { id: true, lojaId: true, fechadaEm: true, valorTotalCentavos: true, itensSemPreco: true, periodo: { select: { inicio: true } } },
    });
    const validos = fechos.filter((f) => f.fechadaEm && f.valorTotalCentavos !== null);
    const cortes = new Map<string, { depois: number; antes: number }>();
    if (validos.length > 0) {
      const linhas = await tx.sql<{ fechamentoId: string; depois: bigint; antes: bigint }>`
        SELECT f."id" AS "fechamentoId",
          coalesce(sum(CASE WHEN m."ocorridoEm" > f."fechadaEm" AND c."dia" <= f."fim" THEN m."valorCentavos" ELSE 0 END), 0)::bigint AS "depois",
          coalesce(sum(CASE WHEN m."ocorridoEm" <= f."fechadaEm" AND c."dia" > f."fim" AND ci."id" IS NULL THEN m."valorCentavos" ELSE 0 END), 0)::bigint AS "antes"
        FROM (
          SELECT k."id", k."lojaId", k."fechadaEm", p."fim"
          FROM "Contagem" k
          JOIN "PeriodoApuracao" p ON p."parceiroId" = k."parceiroId" AND p."id" = k."periodoId"
          WHERE k."parceiroId" = ${tx.parceiroId} AND k."id" = ANY(${validos.map((f) => f.id)}::text[])
        ) f
        JOIN "MovimentoEstoque" m ON m."parceiroId" = ${tx.parceiroId} AND m."lojaId" = f."lojaId"
          AND m."tipo" = ANY(${TIPOS_DE_MOVIMENTO}::"MovimentoTipo"[])
          AND m."ocorridoEm" >= LEAST(f."fechadaEm", f."fim"::timestamp - interval '1 day')
        LEFT JOIN "NotaEntrada" n ON n."parceiroId" = m."parceiroId" AND n."id" = m."notaId"
        CROSS JOIN LATERAL (SELECT CASE WHEN m."notaId" IS NOT NULL THEN n."entradaEm" ELSE (m."ocorridoEm" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date END AS "dia") c
        LEFT JOIN "ContagemItem" ci ON ci."parceiroId" = m."parceiroId" AND ci."id" = m."contagemItemId" AND ci."contagemId" = f."id"
        GROUP BY f."id"`;
      for (const l of linhas) cortes.set(l.fechamentoId, { depois: numero(l.depois), antes: numero(l.antes) });
    }
    for (const f of validos) {
      const corte = cortes.get(f.id) ?? { depois: 0, antes: 0 };
      const fecho: FechoDeEstoque = {
        id: f.id,
        fechadaEm: f.fechadaEm!.toISOString(),
        valorTotalCentavos: f.valorTotalCentavos!,
        itensSemPreco: f.itensSemPreco,
        depoisCentavos: corte.depois,
        antesCentavos: corte.antes,
      };
      (iso(f.periodo!.inicio) === periodo.inicio ? fechosDoPeriodo : fechosAnteriores).set(f.lojaId, fecho);
    }
    proximoNome = (await periodoDe(tx, somarDias(periodo.fim, 1))).nome;
  }

  const contexto = { periodo, anterior, proximoNome, hoje, encerrado, abreEm: janelaDoFechamento(periodo, hoje).abreEm };
  const saida: CmvDaLoja[] = lojas.map((loja) => {
    const { real, motivo } = apurarReal(
      { comprasReaisCentavos: comprasReais.get(loja.id) ?? 0, abertura: aberturas.get(loja.id) ?? null, fechoDoPeriodo: fechosDoPeriodo.get(loja.id) ?? null, fechoAnterior: fechosAnteriores.get(loja.id) ?? null },
      contexto,
    );
    return { lojaId: loja.id, lojaNome: loja.nome, compraCentavos: compras.has(loja.id) ? compras.get(loja.id)! : null, real, motivoSemReal: motivo };
  });
  return { lojas: saida, parcial };
}
