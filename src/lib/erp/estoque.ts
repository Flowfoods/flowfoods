/**
 * Estoque (1.6) — com banco, sem tela. Abertura do zero por LOJA (a 1ª
 * contagem vira o saldo inicial), o livro-razão (`MovimentoEstoque`, só
 * INSERT) e o saldo (`SaldoEstoque`, cópia de consulta com versão) andando
 * juntos na MESMA transação, e a nota de compra entrando no estoque da loja
 * aberta (decisão 68).
 *
 * Recebe sempre o `ClienteDoParceiro` (parceiro da sessão) e o `Alcance`:
 * estoque é por loja — `estoque.ver`, `estoque.contar` e `estoque.ajustar`
 * sempre com `lojaId`; loja fora do alcance não existe para quem pede.
 *
 * Concorrência (decisão 69):
 * - "Abrir estoque" duas vezes: o índice único parcial deixa uma abertura por
 *   loja; a segunda chamada devolve a mesma contagem.
 * - Salvar um número: `UPDATE Contagem SET versao + 1 WHERE ABERTA` trava a
 *   contagem e confere o estado; o item só muda na versão lida. Outra pessoa
 *   salvou antes = conflito com o número e o nome dela; o mesmo número de novo
 *   (retentativa) = ok.
 * - Concluir: `FOR UPDATE` na contagem (espera quem está salvando), confere a
 *   versão conferida e grava um movimento por item com chave única
 *   (`abertura:<item>`): concluir de novo devolve a abertura já feita.
 * - Nota × abertura: a nota pega `FOR SHARE` na abertura da loja antes de
 *   marcar `lancadaEm`; concluir e lançar se esperam, e a ordem decide.
 * - Saldos travados em ordem (loja, insumo) com `FOR UPDATE`, e a versão
 *   conferida no UPDATE.
 */

import type { ClienteDoParceiro } from './tenant';
import { ehErroDeUnicidade } from './tenant';
import { alcancaLoja, filtroDeLojas, pode, recusa, type Alcance, type Permissao } from './permissoes';
import { listarHistorico } from './historico';
import { ultimasCompras } from './compras-custo';
import { custosEmCascata } from './ficha-custos';
import { custoIncompleto } from './ficha-campos';
import { hojeNoRio, numeroDaNota } from './compra-campos';
import {
  aplicarNosSaldos,
  camposDaContagem,
  chaveDoSaldo,
  efeitoDaNota,
  entradasDaNota,
  estadoDoEstoque,
  estornoDe,
  fraseDoEfeito,
  lerContagem,
  mesmoEfeito,
  resumoDaContagem,
  somarValores,
  textoDaContagem,
  valorDaQuantidade,
  type ContagemDigitada,
  type EstadoDoEstoque,
  type MovimentoNovo,
  type TipoDeMovimento,
} from './estoque-campos';
import { custoDaEmbalagem, custoPorUnidade, formatarQuantidade, type Fracao, type Unidade } from './unidades';
import type { Conservacao } from './validade';
import type { Erros } from './insumo-campos';

export type ResultadoEstoque =
  | { ok: true; id: string; jaFeito?: boolean }
  | { ok: false; erros: Erros; conflito?: boolean; naoEncontrado?: boolean };

type Recusada = Extract<ResultadoEstoque, { ok: false }>;

class Recusa extends Error {
  constructor(readonly resultado: Recusada) {
    super('recusa');
  }
}

const ID = /^[a-z0-9]{1,64}$/i;
const motivoLimpo = (t: unknown) => (typeof t === 'string' ? t.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null);

export const MENSAGEM_LOJA_FORA = 'Loja não encontrada no seu acesso.';

// ================================================================ alcance

/** Lojas do alcance onde a pessoa tem esta permissão (permissão por loja). */
async function lojasCom(tx: ClienteDoParceiro, alcance: Alcance, permissao: Permissao) {
  const lojas = await tx.loja.findMany({ where: { id: filtroDeLojas(alcance) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, ativa: true } });
  return lojas.filter((l) => pode(alcance, permissao, { lojaId: l.id }));
}

/** A loja, se está no alcance e a pessoa tem a permissão nela; senão a recusa. */
async function lojaDoAlcance(tx: ClienteDoParceiro, alcance: Alcance, lojaId: string, permissao: Permissao) {
  if (!ID.test(lojaId) || !alcancaLoja(alcance, lojaId)) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_LOJA_FORA }, naoEncontrado: true });
  const loja = await tx.loja.findUnique({ where: { id: lojaId }, select: { id: true, nome: true, ativa: true } });
  if (!loja) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_LOJA_FORA }, naoEncontrado: true });
  const negado = recusa(alcance, permissao, { lojaId });
  if (negado) throw new Recusa({ ok: false, erros: { geral: negado } });
  return loja;
}

async function comRecusa<T>(fn: () => Promise<T>): Promise<T | Recusada> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    throw e;
  }
}

// ================================================================ abertura: leitura

interface AberturaLida {
  id: string;
  lojaId: string;
  status: 'ABERTA' | 'FECHADA' | 'CANCELADA';
  fechadaEm: Date | null;
}

/** A abertura (não descartada) de cada loja pedida. */
async function aberturasDe(tx: ClienteDoParceiro, lojaIds: readonly string[]): Promise<Map<string, AberturaLida>> {
  if (lojaIds.length === 0) return new Map();
  const lidas = await tx.contagem.findMany({
    where: { tipo: 'ABERTURA', status: { not: 'CANCELADA' }, lojaId: { in: [...lojaIds] } },
    select: { id: true, lojaId: true, status: true, fechadaEm: true },
  });
  return new Map(lidas.map((c) => [c.lojaId, c]));
}

/**
 * Trava (FOR SHARE) a abertura das lojas até o fim da transação: quem lança,
 * edita ou cancela nota espera uma conclusão em curso, e a conclusão espera a
 * nota. Ordem fixa (id da loja) contra deadlock.
 */
export async function travarAberturas(tx: ClienteDoParceiro, lojaIds: readonly string[]): Promise<Map<string, AberturaLida>> {
  const ids = Array.from(new Set(lojaIds.filter((x) => ID.test(x)))).sort();
  if (ids.length === 0) return new Map();
  const linhas = await tx.sql<{ id: string; lojaId: string; status: AberturaLida['status']; fechadaEm: Date | null }>`
    SELECT "id", "lojaId", "status"::text AS "status", "fechadaEm" FROM "Contagem"
    WHERE "parceiroId" = ${tx.parceiroId} AND "lojaId" = ANY(${ids}::text[]) AND "tipo" = 'ABERTURA' AND "status" <> 'CANCELADA'
    ORDER BY "lojaId"
    FOR SHARE`;
  return new Map(linhas.map((c) => [c.lojaId, c]));
}

const aberturaFechada = (a: AberturaLida | undefined) => (a && a.status === 'FECHADA' && a.fechadaEm ? { abertoEm: a.fechadaEm } : null);

// ================================================================ custo de referência

export interface CustoDeReferencia {
  /** Centavos por 1 unidade base (kg, L, un), exato; null = sem preço/custo incompleto (valor pendente). */
  porUnidade: Fracao | null;
  origem: 'compra' | 'cadastro' | 'preparo';
}

/**
 * Custo de referência de cada insumo, como em todo o ERP: comprado = último
 * preço pago (1.5) ou o cadastrado; pré-preparo = custo da ficha que o
 * produz, em cascata (incompleto = pendente). Uma leitura para a lista toda.
 */
export async function custosDeReferencia(tx: ClienteDoParceiro, insumoIds: readonly string[]): Promise<Map<string, CustoDeReferencia>> {
  const ids = Array.from(new Set(insumoIds));
  if (ids.length === 0) return new Map();
  const insumos = await tx.insumo.findMany({
    where: { id: { in: ids } },
    select: { id: true, precoEmbalagemCentavos: true, taxaEntregaCentavos: true, conteudoMilesimos: true, fichaQueProduz: { select: { id: true } } },
  });
  const comprados = insumos.filter((i) => !i.fichaQueProduz);
  const compras = await ultimasCompras(
    tx,
    comprados.map((i) => i.id),
  );
  const fichas = insumos.map((i) => i.fichaQueProduz?.id).filter((x): x is string => !!x);
  const cascata = fichas.length ? await custosEmCascata(tx, fichas) : null;
  const mapa = new Map<string, CustoDeReferencia>();
  for (const i of insumos) {
    if (i.fichaQueProduz) {
      const c = cascata!.custo(i.fichaQueProduz.id);
      mapa.set(i.id, { porUnidade: c && !custoIncompleto(c) ? c.porRendimento : null, origem: 'preparo' });
      continue;
    }
    const compra = compras.get(i.id);
    const custo = compra?.custo ?? custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos);
    mapa.set(i.id, { porUnidade: custo ? custoPorUnidade(custo) : null, origem: compra ? 'compra' : 'cadastro' });
  }
  return mapa;
}

// ================================================================ livro-razão

/**
 * Grava os movimentos e o saldo na transação de quem chama: cria a linha de
 * saldo que faltar (inclusive dos `garantir`, com zero), trava os saldos em
 * ordem (loja, insumo), calcula antes/depois (o CHECK do banco confere),
 * insere o razão e atualiza o saldo pela versão lida. Nunca UPDATE em
 * movimento.
 */
export async function gravarMovimentos(
  tx: ClienteDoParceiro,
  movimentos: readonly MovimentoNovo[],
  opcoes: { ocorridoEm?: Date; garantir?: readonly { lojaId: string; insumoId: string }[] } = {},
): Promise<void> {
  const pares = new Map<string, { lojaId: string; insumoId: string }>();
  for (const p of [...(opcoes.garantir ?? []), ...movimentos]) pares.set(chaveDoSaldo(p.lojaId, p.insumoId), { lojaId: p.lojaId, insumoId: p.insumoId });
  if (pares.size === 0) return;
  const lista = Array.from(pares.values()).sort((a, b) => (a.lojaId < b.lojaId ? -1 : a.lojaId > b.lojaId ? 1 : a.insumoId < b.insumoId ? -1 : a.insumoId > b.insumoId ? 1 : 0));
  await tx.saldoEstoque.createMany({
    data: lista.map((p) => ({ parceiroId: tx.parceiroId, lojaId: p.lojaId, insumoId: p.insumoId })),
    skipDuplicates: true,
  });
  if (movimentos.length === 0) return;
  const comMovimento = lista.filter((p) => movimentos.some((m) => m.lojaId === p.lojaId && m.insumoId === p.insumoId));
  const travados = await tx.sql<{ id: string; lojaId: string; insumoId: string; quantidadeMilesimos: number; valorCentavos: number; versao: number }>`
    SELECT s."id", s."lojaId", s."insumoId", s."quantidadeMilesimos", s."valorCentavos", s."versao"
    FROM "SaldoEstoque" s
    JOIN unnest(${comMovimento.map((p) => p.lojaId)}::text[], ${comMovimento.map((p) => p.insumoId)}::text[]) AS p("lojaId", "insumoId")
      ON p."lojaId" = s."lojaId" AND p."insumoId" = s."insumoId"
    WHERE s."parceiroId" = ${tx.parceiroId}
    ORDER BY s."lojaId", s."insumoId"
    FOR UPDATE OF s`;
  const porChave = new Map(travados.map((s) => [chaveDoSaldo(s.lojaId, s.insumoId), s]));
  const { linhas, finais } = aplicarNosSaldos(
    new Map(travados.map((s) => [chaveDoSaldo(s.lojaId, s.insumoId), { quantidadeMilesimos: s.quantidadeMilesimos, valorCentavos: s.valorCentavos }])),
    movimentos,
  );
  const quando = opcoes.ocorridoEm ?? new Date();
  await tx.movimentoEstoque.createMany({
    data: linhas.map((m) => ({
      parceiroId: tx.parceiroId,
      lojaId: m.lojaId,
      insumoId: m.insumoId,
      tipo: m.tipo,
      quantidadeMilesimos: m.quantidadeMilesimos,
      valorCentavos: m.valorCentavos,
      saldoAntesMilesimos: m.saldoAntesMilesimos,
      saldoDepoisMilesimos: m.saldoDepoisMilesimos,
      insumoNomeSnapshot: m.insumoNome,
      unidadeSnapshot: m.unidade,
      motivo: m.motivo,
      ocorridoEm: quando,
      chaveIdempotencia: m.chave,
      notaId: m.notaId ?? null,
      contagemItemId: m.contagemItemId ?? null,
      estornoDeId: m.estornoDeId ?? null,
    })),
  });
  const ids: string[] = [];
  const qs: number[] = [];
  const vals: number[] = [];
  const vers: number[] = [];
  for (const [k, f] of Array.from(finais)) {
    const s = porChave.get(k);
    if (!s) continue;
    ids.push(s.id);
    qs.push(f.quantidadeMilesimos);
    vals.push(f.valorCentavos);
    vers.push(s.versao);
  }
  const atualizados = await tx.sql<{ id: string }>`
    UPDATE "SaldoEstoque" s
    SET "quantidadeMilesimos" = v.q, "valorCentavos" = v.val, "versao" = s."versao" + 1, "atualizadoEm" = now()
    FROM unnest(${ids}::text[], ${qs}::int[], ${vals}::int[], ${vers}::int[]) AS v(id, q, val, ver)
    WHERE s."parceiroId" = ${tx.parceiroId} AND s."id" = v.id AND s."versao" = v.ver
    RETURNING s."id"`;
  // Impossível com a trava acima; se acontecer, a transação inteira volta.
  if (atualizados.length !== ids.length) throw new Error('[erp] saldo do estoque mudou no meio da gravação.');
}

// ================================================================ nota × estoque (decisão 68)

/**
 * Põe o estoque de acordo com a nota, na transação da nota: o que ela deve
 * ter no razão agora (entradas, se movimenta) contra o que ela tem (entradas
 * não estornadas). Mesmo efeito = nada; senão estorna tudo o que valia e entra
 * o novo. Quem chama já travou a abertura das lojas (`travarAberturas`).
 */
export async function aplicarNotaNoEstoque(tx: ClienteDoParceiro, notaId: string, motivoDoEstorno: string): Promise<void> {
  const nota = await tx.notaEntrada.findUnique({
    where: { id: notaId },
    select: {
      id: true,
      lojaId: true,
      status: true,
      numero: true,
      serie: true,
      entradaEm: true,
      lancadaEm: true,
      atualizadoEm: true,
      itens: {
        orderBy: { ordem: 'asc' },
        select: { insumoId: true, insumoNomeSnapshot: true, unidadeSnapshot: true, quantidadeMilesimos: true, valorTotalCentavos: true, freteRateadoCentavos: true, embalagemSnapshot: true },
      },
    },
  });
  if (!nota) return;
  const ativos = await tx.movimentoEstoque.findMany({
    where: { notaId, estornoDeId: null, estorno: { is: null } },
    select: { id: true, lojaId: true, insumoId: true, tipo: true, quantidadeMilesimos: true, valorCentavos: true, insumoNomeSnapshot: true, unidadeSnapshot: true, notaId: true, contagemItemId: true },
  });
  const aberturas = await travarAberturas(tx, [nota.lojaId, ...ativos.map((m) => m.lojaId)]);
  const efeito = efeitoDaNota({ status: nota.status, lancadaEm: nota.lancadaEm, entradaEm: nota.entradaEm.toISOString().slice(0, 10) }, aberturaFechada(aberturas.get(nota.lojaId)));
  const desejadas = efeito.movimenta
    ? entradasDaNota(
        { id: nota.id, lojaId: nota.lojaId, rotulo: `Nota ${numeroDaNota(nota)}`, versao: nota.atualizadoEm.getTime() },
        nota.itens.map((i) => ({
          insumoId: i.insumoId,
          insumoNome: i.insumoNomeSnapshot ?? '?',
          unidade: (i.unidadeSnapshot ?? 'UN') as Unidade,
          quantidadeMilesimos: i.quantidadeMilesimos,
          valorCentavos: i.valorTotalCentavos,
          freteRateadoCentavos: i.freteRateadoCentavos,
          embalagem: i.embalagemSnapshot ?? '',
        })),
      )
    : [];
  if (mesmoEfeito(ativos, desejadas)) return;
  const estornos = ativos.map((m) => estornoDe({ ...m, tipo: m.tipo as TipoDeMovimento, unidadeSnapshot: m.unidadeSnapshot as Unidade }, motivoDoEstorno));
  await gravarMovimentos(tx, [...estornos, ...desejadas]);
}

/** O que a nota fez no estoque, para o detalhe dela (frase + movimentos, inclusive estornos). */
export async function estoqueDaNota(tx: ClienteDoParceiro, nota: { id: string; lojaId: string; loja: string; status: string; lancadaEm: Date | null; entradaEm: string }) {
  const aberturas = await aberturasDe(tx, [nota.lojaId]);
  const a = aberturaFechada(aberturas.get(nota.lojaId));
  const efeito = efeitoDaNota(nota, a);
  const movimentos = await tx.movimentoEstoque.findMany({
    where: { notaId: nota.id },
    orderBy: [{ ocorridoEm: 'asc' }, { criadoEm: 'asc' }, { id: 'asc' }],
    select: { id: true, tipo: true, insumoNomeSnapshot: true, unidadeSnapshot: true, quantidadeMilesimos: true, saldoAntesMilesimos: true, saldoDepoisMilesimos: true, estornoDeId: true, ocorridoEm: true, lojaId: true, loja: { select: { nome: true } } },
  });
  const teveEntrada = movimentos.length > 0;
  return {
    frase: nota.status !== 'LANCADA' && teveEntrada ? `Nota cancelada: o que ela tinha posto no estoque da ${nota.loja} foi estornado.` : fraseDoEfeito(efeito, nota.loja, a?.abertoEm ?? null),
    movimenta: efeito.movimenta,
    movimentos: movimentos.map((m) => ({
      id: m.id,
      loja: m.loja.nome,
      nome: m.insumoNomeSnapshot,
      unidade: m.unidadeSnapshot as Unidade,
      quantidadeMilesimos: m.quantidadeMilesimos,
      antes: m.saldoAntesMilesimos,
      depois: m.saldoDepoisMilesimos,
      estorno: !!m.estornoDeId,
      ocorridoEm: m.ocorridoEm,
    })),
  };
}

/** Para a prévia da nota (sem gravar, sem travar): o efeito se ela for lançada/salva assim. */
export async function efeitoPrevistoDaNota(tx: ClienteDoParceiro, nota: { lojaId: string; lojaNome: string; lancadaEm: Date | null; entradaEm: string }): Promise<{ movimenta: boolean; frase: string }> {
  const aberturas = await aberturasDe(tx, [nota.lojaId]);
  const a = aberturaFechada(aberturas.get(nota.lojaId));
  const e = efeitoDaNota({ status: 'LANCADA', lancadaEm: nota.lancadaEm ?? new Date(), entradaEm: nota.entradaEm }, a);
  const frase = e.movimenta ? `Entra no estoque da ${nota.lojaNome} ao lançar.` : fraseDoEfeito(e, nota.lojaNome, a?.abertoEm ?? null);
  return { movimenta: e.movimenta, frase };
}

// ================================================================ situação por loja

export interface SituacaoDaLoja {
  id: string;
  nome: string;
  ativa: boolean;
  estado: EstadoDoEstoque;
  /** Em contagem: quantos contados de quantos. */
  contagem: { contados: number; total: number; iniciadaEm: Date; por: string | null } | null;
  /** Aberto: desde quando, itens com saldo e o valor pelo custo de referência de hoje. */
  aberto: { desde: Date; por: string | null; itensComSaldo: number; valorCentavos: number; pendentes: number } | null;
}

/** Lojas do alcance com estoque à vista e a situação de cada uma. */
export async function situacaoDoEstoque(cliente: ClienteDoParceiro, alcance: Alcance): Promise<SituacaoDaLoja[]> {
  return cliente.transacao(async (tx) => {
    const lojas = await lojasCom(tx, alcance, 'estoque.ver');
    const ids = lojas.map((l) => l.id);
    const contagens = ids.length
      ? await tx.contagem.findMany({
          where: { tipo: 'ABERTURA', status: { not: 'CANCELADA' }, lojaId: { in: ids } },
          select: { id: true, lojaId: true, status: true, criadoEm: true, fechadaEm: true, iniciadaPorNome: true, fechadaPorNome: true },
        })
      : [];
    const porLoja = new Map(contagens.map((c) => [c.lojaId, c]));
    const emContagem = contagens.filter((c) => c.status === 'ABERTA').map((c) => c.id);
    const contados = emContagem.length
      ? await tx.contagemItem.groupBy({ by: ['contagemId'], where: { contagemId: { in: emContagem } }, _count: { _all: true, contadoMilesimos: true } })
      : [];
    const contadosPor = new Map(contados.map((c) => [c.contagemId, c._count]));
    const abertas = contagens.filter((c) => c.status === 'FECHADA').map((c) => c.lojaId);
    const saldos = abertas.length
      ? await tx.saldoEstoque.findMany({ where: { lojaId: { in: abertas }, quantidadeMilesimos: { not: 0 } }, select: { lojaId: true, insumoId: true, quantidadeMilesimos: true } })
      : [];
    const custos = await custosDeReferencia(
      tx,
      saldos.map((s) => s.insumoId),
    );
    return lojas.map((l) => {
      const c = porLoja.get(l.id);
      const estado = estadoDoEstoque(c);
      const n = c ? contadosPor.get(c.id) : undefined;
      const daLoja = saldos.filter((s) => s.lojaId === l.id);
      const soma = somarValores(daLoja.map((s) => valorDaQuantidade(custos.get(s.insumoId)?.porUnidade ?? null, s.quantidadeMilesimos)));
      return {
        id: l.id,
        nome: l.nome,
        ativa: l.ativa,
        estado,
        contagem: c && estado === 'EM_CONTAGEM' ? { contados: n?.contadoMilesimos ?? 0, total: n?._all ?? 0, iniciadaEm: c.criadoEm, por: c.iniciadaPorNome } : null,
        aberto: c && estado === 'ABERTO' ? { desde: c.fechadaEm!, por: c.fechadaPorNome, itensComSaldo: daLoja.filter((s) => s.quantidadeMilesimos > 0).length, valorCentavos: soma.centavos, pendentes: soma.pendentes } : null,
      };
    });
  });
}

// ================================================================ abertura: começar e descartar

/**
 * Começa a contagem de abertura da loja: congela a lista (os insumos ATIVOS,
 * com nome, unidade, conservação e a embalagem padrão). Já começada =
 * devolve a mesma (idempotente, inclusive na corrida); já aberta = recusa.
 */
export async function iniciarAbertura(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, autorNome = 'Sistema'): Promise<ResultadoEstoque> {
  const tentar = () =>
    comRecusa(() =>
      cliente.transacao(
        async (tx) => {
          const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ajustar');
          const ja = (await aberturasDe(tx, [lojaId])).get(lojaId);
          if (ja?.status === 'ABERTA') return { ok: true as const, id: ja.id, jaFeito: true };
          if (ja?.status === 'FECHADA') throw new Recusa({ ok: false, erros: { geral: `O estoque da ${loja.nome} já está aberto. Correção de saldo é pela contagem (fase 1.7), nunca reabrindo.` } });
          if (!loja.ativa) throw new Recusa({ ok: false, erros: { geral: `A ${loja.nome} está desativada: reative a loja antes de abrir o estoque.` } });
          const insumos = await tx.insumo.findMany({
            where: { ativo: true },
            orderBy: { nome: 'asc' },
            select: { id: true, nome: true, unidade: true, conservacao: true, conteudoMilesimos: true, tipo: true },
          });
          if (insumos.length === 0) throw new Recusa({ ok: false, erros: { geral: 'Nenhum insumo ativo para contar. Cadastre os insumos antes de abrir o estoque.' } });
          const c = await tx.contagem.create({
            data: { parceiroId: tx.parceiroId, lojaId, tipo: 'ABERTURA', status: 'ABERTA', referenciaEm: new Date(`${hojeNoRio()}T00:00:00.000Z`), iniciadaPorNome: autorNome },
            select: { id: true },
          });
          await tx.contagemItem.createMany({
            data: insumos.map((i) => {
              const porEmbalagem = i.tipo !== 'PRE_PREPARO' && i.conteudoMilesimos !== 1000;
              return {
                parceiroId: tx.parceiroId,
                contagemId: c.id,
                insumoId: i.id,
                insumoNomeSnapshot: i.nome,
                unidadeSnapshot: i.unidade,
                conservacaoSnapshot: i.conservacao,
                embalagemSnapshot: porEmbalagem ? `embalagem de ${formatarQuantidade(i.conteudoMilesimos, i.unidade)}` : null,
                embalagemConteudoMilesimos: porEmbalagem ? i.conteudoMilesimos : null,
                saldoSistemaMilesimos: 0,
                valorSistemaCentavos: 0,
              };
            }),
          });
          await tx.historicoAlteracao.create({
            data: {
              parceiroId: tx.parceiroId,
              entidade: 'Contagem',
              entidadeId: c.id,
              acao: 'INICIOU',
              depois: { nome: `Abertura do estoque · ${loja.nome}`, itens: insumos.length },
              autorNome,
            },
          });
          return { ok: true as const, id: c.id };
        },
        { timeout: 20_000 },
      ),
    );
  try {
    return await tentar();
  } catch (e) {
    // Duas pessoas clicaram "Abrir estoque" juntas: a outra já começou; abre a dela.
    if (ehErroDeUnicidade(e)) return tentar();
    throw e;
  }
}

/** Descarta a contagem de abertura EM ANDAMENTO (nada foi para o razão). Motivo obrigatório. */
export async function descartarAbertura(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, motivoTexto: unknown, autorNome = 'Sistema'): Promise<ResultadoEstoque> {
  const motivo = motivoLimpo(motivoTexto);
  if (!motivo || motivo.length < 3) return { ok: false, erros: { motivo: 'Diga por que a contagem sai (ex.: começamos errado, vamos recomeçar).' } };
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ajustar');
      const [c] = await tx.sql<{ id: string; status: string }>`
        SELECT "id", "status"::text AS "status" FROM "Contagem"
        WHERE "parceiroId" = ${tx.parceiroId} AND "lojaId" = ${lojaId} AND "tipo" = 'ABERTURA' AND "status" <> 'CANCELADA'
        FOR UPDATE`;
      if (!c) throw new Recusa({ ok: false, erros: { geral: 'Não há contagem de abertura em andamento nesta loja.' }, conflito: true });
      if (c.status === 'FECHADA') throw new Recusa({ ok: false, erros: { geral: 'A abertura já foi concluída: não se descarta. Correção é pela contagem (fase 1.7).' }, conflito: true });
      await tx.contagem.updateMany({ where: { id: c.id, status: 'ABERTA' }, data: { status: 'CANCELADA' } });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Contagem',
          entidadeId: c.id,
          acao: 'DESCARTOU',
          antes: { nome: `Abertura do estoque · ${loja.nome}`, situacao: 'Em andamento' },
          depois: { nome: `Abertura do estoque · ${loja.nome}`, situacao: 'Descartada' },
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, id: c.id };
    }),
  );
}

// ================================================================ abertura: contar

export interface ItemDaContagem {
  id: string;
  insumoId: string;
  nome: string;
  unidade: Unidade;
  conservacao: Conservacao;
  embalagem: { nome: string; conteudoMilesimos: number } | null;
  campos: ContagemDigitada;
  contadoMilesimos: number | null;
  texto: string;
  versao: number;
  por: string | null;
  em: Date | null;
}

const SELECAO_DO_ITEM = {
  id: true,
  insumoId: true,
  insumoNomeSnapshot: true,
  unidadeSnapshot: true,
  conservacaoSnapshot: true,
  embalagemSnapshot: true,
  embalagemConteudoMilesimos: true,
  embalagensMilesimos: true,
  soltoMilesimos: true,
  escalaDigitada: true,
  contadoMilesimos: true,
  contadoPorNome: true,
  contadoEm: true,
  versao: true,
} as const;

type ItemLido = {
  id: string;
  insumoId: string;
  insumoNomeSnapshot: string;
  unidadeSnapshot: string;
  conservacaoSnapshot: string | null;
  embalagemSnapshot: string | null;
  embalagemConteudoMilesimos: number | null;
  embalagensMilesimos: number | null;
  soltoMilesimos: number | null;
  escalaDigitada: string | null;
  contadoMilesimos: number | null;
  contadoPorNome: string | null;
  contadoEm: Date | null;
  versao: number;
};

function paraTela(i: ItemLido): ItemDaContagem {
  const unidade = i.unidadeSnapshot as Unidade;
  return {
    id: i.id,
    insumoId: i.insumoId,
    nome: i.insumoNomeSnapshot,
    unidade,
    conservacao: (i.conservacaoSnapshot ?? 'SECO') as Conservacao,
    embalagem: i.embalagemSnapshot && i.embalagemConteudoMilesimos ? { nome: i.embalagemSnapshot, conteudoMilesimos: i.embalagemConteudoMilesimos } : null,
    campos: camposDaContagem({ unidade, embalagensMilesimos: i.embalagensMilesimos, soltoMilesimos: i.soltoMilesimos, escalaDigitada: i.escalaDigitada }),
    contadoMilesimos: i.contadoMilesimos,
    texto: textoDaContagem({ unidade, contadoMilesimos: i.contadoMilesimos, embalagensMilesimos: i.embalagensMilesimos, soltoMilesimos: i.soltoMilesimos, embalagemSnapshot: i.embalagemSnapshot }),
    versao: i.versao,
    por: i.contadoPorNome,
    em: i.contadoEm,
  };
}

/** A contagem de abertura da loja para contar (quem conta: `estoque.contar`). Null = não há em andamento. */
export async function obterContagemDeAbertura(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ver');
      const c = await tx.contagem.findFirst({
        where: { lojaId, tipo: 'ABERTURA', status: { not: 'CANCELADA' } },
        select: { id: true, status: true, versao: true, criadoEm: true, iniciadaPorNome: true, fechadaEm: true, fechadaPorNome: true },
      });
      if (!c) return { loja, contagem: null, itens: [] as ItemDaContagem[] };
      const itens = await tx.contagemItem.findMany({ where: { contagemId: c.id }, orderBy: { insumoNomeSnapshot: 'asc' }, select: SELECAO_DO_ITEM });
      return { loja, contagem: c, itens: itens.map(paraTela) };
    }),
  );
  return 'ok' in r ? null : r;
}

export type ContagemDeAbertura = NonNullable<Awaited<ReturnType<typeof obterContagemDeAbertura>>>;

export type ResultadoDoItem =
  | { ok: true; item: ItemDaContagem }
  | { ok: false; erros: Partial<Record<'embalagens' | 'solto' | 'geral', string>>; conflito?: { item: ItemDaContagem }; fechada?: boolean };

/**
 * Salva o número de UM item (a tela chama sozinha, ao parar de digitar).
 * `versao` = a versão do item que a tela tem. Outra pessoa salvou depois =
 * conflito (o número dela volta, e a pessoa escolhe). Mesmo número de novo =
 * ok. Mudar um número já contado deixa o antes/depois no histórico.
 */
export async function contarItem(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { itemId: unknown; embalagens: unknown; solto: unknown; escala: unknown; versao: unknown },
  autorNome = 'Sistema',
): Promise<ResultadoDoItem> {
  const itemId = typeof entrada.itemId === 'string' && ID.test(entrada.itemId) ? entrada.itemId : '';
  const versaoLida = typeof entrada.versao === 'number' ? entrada.versao : Number(entrada.versao);
  const digitado: ContagemDigitada = {
    embalagens: typeof entrada.embalagens === 'string' ? entrada.embalagens.slice(0, 20) : '',
    solto: typeof entrada.solto === 'string' ? entrada.solto.slice(0, 20) : '',
    escala: typeof entrada.escala === 'string' ? entrada.escala : 'base',
  };
  if (!itemId || !Number.isSafeInteger(versaoLida)) return { ok: false, erros: { geral: 'Item não encontrado nesta contagem. Recarregue a página.' } };
  try {
    return await cliente.transacao(async (tx) => {
      await lojaDoAlcance(tx, alcance, lojaId, 'estoque.contar');
      const item = await tx.contagemItem.findFirst({
        where: { id: itemId, contagem: { lojaId, tipo: 'ABERTURA' } },
        select: { ...SELECAO_DO_ITEM, contagemId: true },
      });
      if (!item) throw new Recusa({ ok: false, erros: { geral: 'Item não encontrado nesta contagem. Recarregue a página.' }, naoEncontrado: true });
      const unidade = item.unidadeSnapshot as Unidade;
      const lido = lerContagem(digitado, { unidade, embalagemConteudoMilesimos: item.embalagemConteudoMilesimos });
      if (!lido.ok) return { ok: false as const, erros: lido.erros };
      // Trava a contagem e confere que segue aberta (concluir espera; quem salva depois de concluída, recebe a frase).
      const [c] = await tx.sql<{ versao: number }>`
        UPDATE "Contagem" SET "versao" = "versao" + 1
        WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${item.contagemId} AND "status" = 'ABERTA'
        RETURNING "versao"`;
      if (!c) {
        const atual = await tx.contagem.findUnique({ where: { id: item.contagemId }, select: { status: true, fechadaPorNome: true } });
        const frase =
          atual?.status === 'FECHADA'
            ? `A abertura já foi concluída${atual.fechadaPorNome ? ` por ${atual.fechadaPorNome}` : ''}: este número não entrou. Correção é pela contagem (fase 1.7).`
            : 'Esta contagem foi descartada: este número não entrou.';
        return { ok: false as const, erros: { geral: frase }, fechada: true };
      }
      const l = lido.lida;
      const r = await tx.contagemItem.updateMany({
        where: { id: itemId, versao: versaoLida },
        data: {
          contadoMilesimos: l.contadoMilesimos,
          embalagensMilesimos: l.embalagensMilesimos,
          soltoMilesimos: l.soltoMilesimos,
          escalaDigitada: l.contadoMilesimos === null ? null : l.escala,
          contadoEm: l.contadoMilesimos === null ? null : new Date(),
          contadoPorNome: l.contadoMilesimos === null ? null : autorNome,
          versao: { increment: 1 },
        },
      });
      if (r.count === 0) {
        const agora = (await tx.contagemItem.findUnique({ where: { id: itemId }, select: SELECAO_DO_ITEM }))!;
        const mesmo =
          agora.contadoMilesimos === l.contadoMilesimos && agora.embalagensMilesimos === l.embalagensMilesimos && agora.soltoMilesimos === l.soltoMilesimos;
        // Retentativa do mesmo número (rede caiu depois de gravar): ok, sem conflito.
        if (mesmo) throw new Pronto({ ok: true, item: paraTela(agora) });
        throw new Pronto({
          ok: false,
          erros: { geral: agora.contadoPorNome ? `${agora.contadoPorNome} contou este item agora há pouco: ${paraTela(agora).texto}.` : 'Alguém mudou este item agora há pouco.' },
          conflito: { item: paraTela(agora) },
        });
      }
      // Antes/depois só quando muda um número que já estava contado (a 1ª contagem é o próprio item).
      if (item.contadoMilesimos !== null && item.contadoMilesimos !== l.contadoMilesimos) {
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'ContagemItem',
            entidadeId: itemId,
            acao: 'RECONTOU',
            antes: { insumo: item.insumoNomeSnapshot, contado: `${paraTela(item).texto}${item.contadoPorNome ? ` (${item.contadoPorNome})` : ''}` },
            depois: {
              insumo: item.insumoNomeSnapshot,
              contado: textoDaContagem({ unidade, contadoMilesimos: l.contadoMilesimos, embalagensMilesimos: l.embalagensMilesimos, soltoMilesimos: l.soltoMilesimos, embalagemSnapshot: item.embalagemSnapshot }),
            },
            autorNome,
          },
        });
      }
      const salvo = (await tx.contagemItem.findUnique({ where: { id: itemId }, select: SELECAO_DO_ITEM }))!;
      return { ok: true as const, item: paraTela(salvo) };
    });
  } catch (e) {
    if (e instanceof Pronto) return e.resultado;
    if (e instanceof Recusa) return { ok: false, erros: { geral: e.resultado.erros.geral ?? 'Não deu para salvar.' } };
    throw e;
  }
}

/** Resposta pronta que precisa desfazer a transação (o "versao + 1" da contagem não fica). */
class Pronto extends Error {
  constructor(readonly resultado: ResultadoDoItem) {
    super('pronto');
  }
}

// ================================================================ abertura: conferir e concluir

export interface LinhaDaConferencia {
  id: string;
  nome: string;
  unidade: Unidade;
  conservacao: Conservacao;
  contadoMilesimos: number | null;
  texto: string;
  /** Valor pelo custo de referência de agora; null = pendente (sem preço). */
  valorCentavos: number | null;
  por: string | null;
}

/** O que a tela de conferência mostra antes de concluir (quem vê: `estoque.ver`). */
export async function conferenciaDaAbertura(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ver');
      const c = await tx.contagem.findFirst({
        where: { lojaId, tipo: 'ABERTURA', status: { not: 'CANCELADA' } },
        select: { id: true, status: true, versao: true, criadoEm: true, iniciadaPorNome: true, fechadaEm: true, fechadaPorNome: true, valorTotalCentavos: true },
      });
      if (!c) return { loja, contagem: null, resumo: resumoDaContagem([]), linhas: [] as LinhaDaConferencia[], valorCentavos: 0, semCusto: [] as LinhaDaConferencia[], notasDeHoje: 0 };
      const itens = await tx.contagemItem.findMany({ where: { contagemId: c.id }, orderBy: { insumoNomeSnapshot: 'asc' }, select: SELECAO_DO_ITEM });
      const custos = await custosDeReferencia(
        tx,
        itens.map((i) => i.insumoId),
      );
      const linhas: LinhaDaConferencia[] = itens.map((i) => {
        const t = paraTela(i);
        return {
          id: i.id,
          nome: t.nome,
          unidade: t.unidade,
          conservacao: t.conservacao,
          contadoMilesimos: i.contadoMilesimos,
          texto: t.texto,
          valorCentavos: i.contadoMilesimos === null ? 0 : valorDaQuantidade(custos.get(i.insumoId)?.porUnidade ?? null, i.contadoMilesimos),
          por: i.contadoPorNome,
        };
      });
      const contadas = linhas.filter((l) => l.contadoMilesimos !== null && l.contadoMilesimos > 0);
      const soma = somarValores(contadas.map((l) => l.valorCentavos));
      // Notas desta loja com data de hoje já lançadas: o que chegou hoje e já está na prateleira.
      const notasDeHoje = await tx.notaEntrada.count({ where: { lojaId, status: 'LANCADA', entradaEm: new Date(`${hojeNoRio()}T00:00:00.000Z`) } });
      return {
        loja,
        contagem: c,
        resumo: resumoDaContagem(itens),
        linhas,
        valorCentavos: soma.centavos,
        semCusto: contadas.filter((l) => l.valorCentavos === null),
        notasDeHoje,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type ConferenciaDaAbertura = NonNullable<Awaited<ReturnType<typeof conferenciaDaAbertura>>>;

/**
 * Conclui a abertura: um movimento ABERTURA por item contado acima de zero
 * (valor pelo custo de referência de agora, um arredondamento por item; sem
 * custo = 0 no razão e "pendente" na tela), saldo de TODOS os itens da lista
 * (zero inclusive), contagem FECHADA com o valor total e o histórico. Numa
 * transação; idempotente; só na versão conferida; não contados só com a
 * confirmação explícita (entram com zero, e o histórico diz quantos).
 */
export async function concluirAbertura(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { versao: unknown; confirmarNaoContados: unknown },
  autorNome = 'Sistema',
): Promise<ResultadoEstoque> {
  const versao = Number(entrada.versao);
  const confirmou = entrada.confirmarNaoContados === true || entrada.confirmarNaoContados === 'sim' || entrada.confirmarNaoContados === 'on';
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ajustar');
        const [c] = await tx.sql<{ id: string; status: string; versao: number; fechadaPorNome: string | null }>`
          SELECT "id", "status"::text AS "status", "versao", "fechadaPorNome" FROM "Contagem"
          WHERE "parceiroId" = ${tx.parceiroId} AND "lojaId" = ${lojaId} AND "tipo" = 'ABERTURA' AND "status" <> 'CANCELADA'
          FOR UPDATE`;
        if (!c) throw new Recusa({ ok: false, erros: { geral: `Não há contagem de abertura na ${loja.nome}. Comece por "Abrir estoque".` }, naoEncontrado: true });
        // Concluir de novo (clique duplo, outra aba, outra pessoa): a abertura feita vale.
        if (c.status === 'FECHADA') return { ok: true as const, id: c.id, jaFeito: true };
        if (!Number.isSafeInteger(versao) || versao !== c.versao) {
          throw new Recusa({
            ok: false,
            erros: { geral: 'A contagem mudou depois que você conferiu (alguém salvou um número). Confira de novo antes de concluir; nada foi gravado.' },
            conflito: true,
          });
        }
        const itens = await tx.contagemItem.findMany({ where: { contagemId: c.id }, select: { ...SELECAO_DO_ITEM } });
        const resumo = resumoDaContagem(itens);
        if (resumo.naoContados > 0 && !confirmou) {
          throw new Recusa({
            ok: false,
            erros: { confirmarNaoContados: `${resumo.naoContados} ${resumo.naoContados === 1 ? 'insumo não foi contado' : 'insumos não foram contados'}. Conte ou confirme que ${resumo.naoContados === 1 ? 'ele entra' : 'eles entram'} com zero.` },
          });
        }
        const custos = await custosDeReferencia(
          tx,
          itens.map((i) => i.insumoId),
        );
        const abertoEm = new Date();
        const movimentos: MovimentoNovo[] = itens
          .filter((i) => i.contadoMilesimos !== null && i.contadoMilesimos > 0)
          .map((i) => ({
            lojaId,
            insumoId: i.insumoId,
            tipo: 'ABERTURA' as const,
            quantidadeMilesimos: i.contadoMilesimos!,
            valorCentavos: valorDaQuantidade(custos.get(i.insumoId)?.porUnidade ?? null, i.contadoMilesimos!) ?? 0,
            insumoNome: i.insumoNomeSnapshot,
            unidade: i.unidadeSnapshot as Unidade,
            motivo: 'Abertura do estoque (1ª contagem)',
            chave: `abertura:${i.id}`,
            contagemItemId: i.id,
          }));
        await gravarMovimentos(tx, movimentos, { ocorridoEm: abertoEm, garantir: itens.map((i) => ({ lojaId, insumoId: i.insumoId })) });
        const valorTotal = movimentos.reduce((s, m) => s + m.valorCentavos, 0);
        const semCusto = movimentos.filter((m) => custos.get(m.insumoId)?.porUnidade == null).length;
        await tx.contagem.updateMany({
          where: { id: c.id, status: 'ABERTA' },
          data: { status: 'FECHADA', fechadaEm: abertoEm, fechadaPorNome: autorNome, valorTotalCentavos: valorTotal, naoContadosNoFechamento: resumo.naoContados },
        });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'Contagem',
            entidadeId: c.id,
            acao: 'CONCLUIU',
            antes: { nome: `Abertura do estoque · ${loja.nome}`, situacao: 'Em andamento' },
            depois: {
              nome: `Abertura do estoque · ${loja.nome}`,
              situacao: 'Aberto',
              contados: resumo.contados,
              zerados: resumo.zerados,
              naoContados: resumo.naoContados,
              valorCentavos: valorTotal,
              ...(semCusto ? { semCusto } : {}),
            },
            motivo: resumo.naoContados ? `${resumo.naoContados} não contados entraram com zero (confirmado).` : null,
            autorNome,
          },
        });
        return { ok: true as const, id: c.id };
      },
      { timeout: 30_000, maxWait: 10_000 },
    ),
  );
}

// ================================================================ saldo da loja

export interface LinhaDeSaldo {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  conservacao: Conservacao;
  ativo: boolean;
  quantidadeMilesimos: number;
  /** Custo de referência de agora por unidade (null = sem preço) e o valor do saldo por ele. */
  porUnidade: Fracao | null;
  valorCentavos: number | null;
}

export interface MovimentoDaTela {
  id: string;
  tipo: TipoDeMovimento;
  nome: string;
  insumoId: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  valorCentavos: number;
  antes: number;
  depois: number;
  motivo: string | null;
  estorno: boolean;
  notaId: string | null;
  ocorridoEm: Date;
}

const SELECAO_DO_MOVIMENTO = {
  id: true,
  tipo: true,
  insumoId: true,
  insumoNomeSnapshot: true,
  unidadeSnapshot: true,
  quantidadeMilesimos: true,
  valorCentavos: true,
  saldoAntesMilesimos: true,
  saldoDepoisMilesimos: true,
  motivo: true,
  estornoDeId: true,
  notaId: true,
  ocorridoEm: true,
} as const;

function movimentoParaTela(m: {
  id: string;
  tipo: string;
  insumoId: string;
  insumoNomeSnapshot: string;
  unidadeSnapshot: string;
  quantidadeMilesimos: number;
  valorCentavos: number;
  saldoAntesMilesimos: number;
  saldoDepoisMilesimos: number;
  motivo: string | null;
  estornoDeId: string | null;
  notaId: string | null;
  ocorridoEm: Date;
}): MovimentoDaTela {
  return {
    id: m.id,
    tipo: m.tipo as TipoDeMovimento,
    nome: m.insumoNomeSnapshot,
    insumoId: m.insumoId,
    unidade: m.unidadeSnapshot as Unidade,
    quantidadeMilesimos: m.quantidadeMilesimos,
    valorCentavos: m.valorCentavos,
    antes: m.saldoAntesMilesimos,
    depois: m.saldoDepoisMilesimos,
    motivo: m.motivo,
    estorno: !!m.estornoDeId,
    notaId: m.notaId,
    ocorridoEm: m.ocorridoEm,
  };
}

export interface FiltrosDoSaldo {
  q: string;
  conservacao: Conservacao | '';
  /** Só o que tem quantidade (≠ 0). */
  comSaldo: boolean;
}

/** O estoque de uma loja (quem vê: `estoque.ver` NA loja): estado, saldo por insumo e o razão recente. */
export async function obterEstoqueDaLoja(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, filtros: Partial<FiltrosDoSaldo> = {}) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ver');
      const c = await tx.contagem.findFirst({
        where: { lojaId, tipo: 'ABERTURA', status: { not: 'CANCELADA' } },
        select: { id: true, status: true, criadoEm: true, iniciadaPorNome: true, fechadaEm: true, fechadaPorNome: true, valorTotalCentavos: true, naoContadosNoFechamento: true },
      });
      const estado = estadoDoEstoque(c);
      const base = { loja, estado, abertura: c };
      if (estado === 'NAO_ABERTO') return { ...base, contagem: null, linhas: [] as LinhaDeSaldo[], total: { centavos: 0, pendentes: 0 }, movimentos: [] as MovimentoDaTela[], totalDeItens: 0 };
      if (estado === 'EM_CONTAGEM') {
        const itens = await tx.contagemItem.findMany({ where: { contagemId: c!.id }, select: { contadoMilesimos: true } });
        return { ...base, contagem: resumoDaContagem(itens), linhas: [] as LinhaDeSaldo[], total: { centavos: 0, pendentes: 0 }, movimentos: [] as MovimentoDaTela[], totalDeItens: 0 };
      }
      const q = (filtros.q ?? '').trim().slice(0, 80);
      const saldos = await tx.saldoEstoque.findMany({
        where: {
          lojaId,
          ...(filtros.comSaldo ? { quantidadeMilesimos: { not: 0 } } : {}),
          insumo: {
            ...(q ? { nome: { contains: q, mode: 'insensitive' as const } } : {}),
            ...(filtros.conservacao ? { conservacao: filtros.conservacao } : {}),
          },
        },
        select: { insumoId: true, quantidadeMilesimos: true, insumo: { select: { nome: true, unidade: true, conservacao: true, ativo: true } } },
      });
      const custos = await custosDeReferencia(
        tx,
        saldos.map((s) => s.insumoId),
      );
      const linhas: LinhaDeSaldo[] = saldos
        .map((s) => {
          const porUnidade = custos.get(s.insumoId)?.porUnidade ?? null;
          return {
            insumoId: s.insumoId,
            nome: s.insumo.nome,
            unidade: s.insumo.unidade,
            conservacao: s.insumo.conservacao,
            ativo: s.insumo.ativo,
            quantidadeMilesimos: s.quantidadeMilesimos,
            porUnidade,
            valorCentavos: valorDaQuantidade(porUnidade, s.quantidadeMilesimos),
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const totalDeItens = await tx.saldoEstoque.count({ where: { lojaId } });
      const movimentos = await tx.movimentoEstoque.findMany({
        where: { lojaId },
        orderBy: [{ ocorridoEm: 'desc' }, { criadoEm: 'desc' }, { id: 'desc' }],
        take: 40,
        select: SELECAO_DO_MOVIMENTO,
      });
      return {
        ...base,
        contagem: null,
        linhas,
        total: somarValores(linhas.filter((l) => l.quantidadeMilesimos !== 0).map((l) => l.valorCentavos)),
        movimentos: movimentos.map(movimentoParaTela),
        totalDeItens,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type EstoqueDaLoja = NonNullable<Awaited<ReturnType<typeof obterEstoqueDaLoja>>>;

/** No detalhe do insumo: o saldo dele em cada loja do alcance onde a pessoa vê estoque. */
export async function saldosDoInsumo(cliente: ClienteDoParceiro, alcance: Alcance, insumoId: string) {
  return cliente.transacao(async (tx) => {
    if (!ID.test(insumoId)) return [];
    const lojas = await lojasCom(tx, alcance, 'estoque.ver');
    if (lojas.length === 0) return [];
    const ids = lojas.map((l) => l.id);
    const aberturas = await aberturasDe(tx, ids);
    const saldos = await tx.saldoEstoque.findMany({ where: { insumoId, lojaId: { in: ids } }, select: { lojaId: true, quantidadeMilesimos: true } });
    const custo = (await custosDeReferencia(tx, [insumoId])).get(insumoId)?.porUnidade ?? null;
    const porLoja = new Map(saldos.map((s) => [s.lojaId, s.quantidadeMilesimos]));
    return lojas.map((l) => {
      const estado = estadoDoEstoque(aberturas.get(l.id));
      const q = estado === 'ABERTO' ? (porLoja.get(l.id) ?? 0) : null;
      return { lojaId: l.id, loja: l.nome, estado, quantidadeMilesimos: q, valorCentavos: q === null ? null : valorDaQuantidade(custo, q) };
    });
  });
}

export type SaldoDoInsumoNaLoja = Awaited<ReturnType<typeof saldosDoInsumo>>[number];

/** Histórico das aberturas da loja (iniciou, recontou, concluiu, descartou). */
export async function historicoDaAbertura(cliente: ClienteDoParceiro, contagemId: string) {
  return cliente.transacao(async (tx) => {
    const itens = await tx.contagemItem.findMany({ where: { contagemId }, select: { id: true } });
    return listarHistorico(tx, {
      de: [
        { entidade: 'Contagem', ids: [contagemId] },
        { entidade: 'ContagemItem', ids: itens.map((i) => i.id) },
      ],
      limite: 20,
    });
  });
}

