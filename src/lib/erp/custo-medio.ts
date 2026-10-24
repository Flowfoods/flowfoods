/**
 * N.1 — o relatório de impacto e a troca para o custo médio ponderado por LOJA (decisão de Rodolfo, 23/10/2026).
 *
 * Nada muda sozinho: cada loja nasce no método antigo (o último preço da rede valoriza saídas e retratos). A
 * FlowFoods (nível 1) lê o impacto e liga loja por loja. Ligar grava o marco (`Loja.custoMedioDesde`) e a
 * diferença de base naquele instante (`custoMedioPonteCentavos`: valor do livro − valor pela regra antiga), para
 * o período que atravessa a troca mostrar o número em vez de misturar as bases em silêncio. Não reescreve
 * movimento, saldo, retrato nem período fechado. Desligar não existe: o livro segue só para a frente.
 */

import type { ClienteDoParceiro } from './tenant';
import { custosDeReferencia } from './estoque';
import { somarValores, valorDaQuantidade } from './estoque-campos';
import type { Unidade } from './unidades';

export type AlertaDoImpacto = 'valor-negativo' | 'residuo' | 'sem-custo' | 'sem-referencia';

export interface LinhaDoImpacto {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  /** O valor do livro da loja (soma dos movimentos). */
  livroCentavos: number;
  /** O mesmo saldo pela regra antiga (quantidade × último preço da rede); nulo = sem referência. */
  referenciaCentavos: number | null;
  /** livro − referência (nulo quando um dos lados é desconhecido). */
  diferencaCentavos: number | null;
  alertas: AlertaDoImpacto[];
}

export interface ImpactoDaLoja {
  lojaId: string;
  nome: string;
  ligadoDesde: Date | null;
  ponteCentavos: number | null;
  linhas: LinhaDoImpacto[];
  /** Somas só do que é conhecido dos dois lados; `pendentes` = quantas linhas ficaram fora. */
  livroCentavos: number;
  referenciaCentavos: number;
  pendentes: number;
}

/** O impacto de ligar, loja por loja (só leitura). Linhas com quantidade ou valor diferente de zero, maior diferença primeiro. */
export async function impactoDoCustoMedio(tx: ClienteDoParceiro, lojaIds?: readonly string[]): Promise<ImpactoDaLoja[]> {
  const lojas = await tx.loja.findMany({
    where: lojaIds ? { id: { in: [...lojaIds] } } : {},
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, custoMedioDesde: true, custoMedioPonteCentavos: true },
  });
  if (lojas.length === 0) return [];
  const saldos = await tx.saldoEstoque.findMany({
    where: { lojaId: { in: lojas.map((l) => l.id) }, OR: [{ quantidadeMilesimos: { not: 0 } }, { valorCentavos: { not: 0 } }] },
    select: { lojaId: true, insumoId: true, quantidadeMilesimos: true, valorCentavos: true, valorIncompleto: true, insumo: { select: { nome: true, unidade: true } } },
  });
  const ref = await custosDeReferencia(
    tx,
    saldos.map((s) => s.insumoId),
  );
  return lojas.map((l) => {
    const linhas: LinhaDoImpacto[] = saldos
      .filter((s) => s.lojaId === l.id)
      .map((s) => {
        const referencia = s.quantidadeMilesimos > 0 ? valorDaQuantidade(ref.get(s.insumoId)?.porUnidade ?? null, s.quantidadeMilesimos) : s.quantidadeMilesimos === 0 ? 0 : null;
        const alertas: AlertaDoImpacto[] = [];
        if (s.quantidadeMilesimos > 0 && s.valorCentavos < 0) alertas.push('valor-negativo');
        if (s.quantidadeMilesimos === 0 && s.valorCentavos !== 0) alertas.push('residuo');
        if (s.valorIncompleto) alertas.push('sem-custo');
        if (s.quantidadeMilesimos > 0 && referencia === null) alertas.push('sem-referencia');
        const livro = s.valorIncompleto ? null : s.valorCentavos;
        return {
          insumoId: s.insumoId,
          nome: s.insumo.nome,
          unidade: s.insumo.unidade as Unidade,
          quantidadeMilesimos: s.quantidadeMilesimos,
          livroCentavos: s.valorCentavos,
          referenciaCentavos: referencia,
          diferencaCentavos: livro === null || referencia === null ? null : livro - referencia,
          alertas,
        };
      })
      .sort((a, b) => Math.abs(b.diferencaCentavos ?? Number.MAX_SAFE_INTEGER) - Math.abs(a.diferencaCentavos ?? Number.MAX_SAFE_INTEGER) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const conhecidas = linhas.filter((x) => x.diferencaCentavos !== null);
    return {
      lojaId: l.id,
      nome: l.nome,
      ligadoDesde: l.custoMedioDesde,
      ponteCentavos: l.custoMedioPonteCentavos,
      linhas,
      livroCentavos: somarValores(conhecidas.map((x) => x.livroCentavos)).centavos,
      referenciaCentavos: somarValores(conhecidas.map((x) => x.referenciaCentavos)).centavos,
      pendentes: linhas.length - conhecidas.length,
    };
  });
}

export type ResultadoDaTroca = { ok: true; jaFeito: boolean; ponteCentavos: number } | { ok: false; erro: string };

/**
 * Liga o custo médio na loja a partir de AGORA (só a FlowFoods chama: a página é do nível 1). Idempotente: ligada,
 * devolve `jaFeito`. Grava a diferença de base e o histórico com o antes e o depois.
 */
export async function ligarCustoMedio(cliente: ClienteDoParceiro, lojaId: unknown, autorNome: string, agora: Date = new Date()): Promise<ResultadoDaTroca> {
  if (typeof lojaId !== 'string' || !/^[a-z0-9]{1,64}$/i.test(lojaId)) return { ok: false, erro: 'Loja inválida.' };
  return cliente.transacao(async (tx) => {
    const [loja] = await tx.sql<{ id: string; nome: string; custoMedioDesde: Date | null; custoMedioPonteCentavos: number | null }>`
      SELECT "id", "nome", "custoMedioDesde", "custoMedioPonteCentavos" FROM "Loja" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${lojaId} FOR UPDATE`;
    if (!loja) return { ok: false as const, erro: 'Loja não encontrada.' };
    if (loja.custoMedioDesde) return { ok: true as const, jaFeito: true, ponteCentavos: loja.custoMedioPonteCentavos ?? 0 };
    const [impacto] = await impactoDoCustoMedio(tx, [lojaId]);
    const ponte = impacto.livroCentavos - impacto.referenciaCentavos;
    await tx.loja.updateMany({ where: { id: lojaId, custoMedioDesde: null }, data: { custoMedioDesde: agora, custoMedioPonteCentavos: ponte } });
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'Loja',
        entidadeId: lojaId,
        acao: 'ALTEROU',
        antes: { nome: loja.nome, valorizacao: 'Último preço da rede' },
        depois: {
          nome: loja.nome,
          valorizacao: 'Custo médio da loja',
          valorDoLivroCentavos: impacto.livroCentavos,
          valorPelaRegraAntigaCentavos: impacto.referenciaCentavos,
          diferencaDeBaseCentavos: ponte,
          ...(impacto.pendentes ? { itensSemComparacao: impacto.pendentes } : {}),
        },
        motivo: 'N.1: custo médio ponderado por loja (decisão de 23/10/2026).',
        autorNome,
      },
    });
    return { ok: true as const, jaFeito: false, ponteCentavos: ponte };
  });
}
