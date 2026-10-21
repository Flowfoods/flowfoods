/**
 * Produção do pré-preparo (3.1) — com banco. O cozinheiro planeja o lote pela ficha ("Molho cheddar, 5 kg, para hoje"); a
 * produção CRIA a requisição dos insumos na MESMA transação (a baixa é a entrega dela, pelo estoque); quando o lote sai, o
 * cozinheiro conclui dizendo quanto saiu de verdade e o lote entra no estoque da loja, no insumo que a ficha produz
 * (`PRODUCAO_ENTRADA`), com o custo fechado pelas baixas reais.
 *
 * Recebe sempre o `ClienteDoParceiro` (parceiro da sessão) e o `Alcance`, com a LOJA: ver = `producao.ver`; planejar,
 * iniciar, concluir e cancelar = `producao.registrar`; estornar o lote concluído = `producao.registrar` E `estoque.ajustar`
 * (mexe no saldo). O custo do lote só sai do servidor para quem tem `insumos.ver` ("Ver insumos e custos").
 *
 * Concorrência (decisões 190 a 201):
 * - a ORDEM FIXA das travas, em todo lugar: período (compartilhada) → abertura da loja → requisição (FOR UPDATE) → ordem
 *   (FOR UPDATE) → saldos (`gravarMovimentos`). Concluir, cancelar e estornar seguem esta ordem; entregar e devolver a
 *   requisição (1.8) também (e olham a ordem depois de travar a requisição);
 * - concluir duas vezes: a ordem é lida FOR UPDATE; CONCLUIDA devolve "já concluída" sem gravar; a chave do livro
 *   (`producao:<ordem>`) é única — duas conclusões em paralelo dão UMA entrada;
 * - planejar duas vezes com o mesmo formulário: `chaveIdempotencia` do formulário (única no parceiro);
 * - o código do lote nasce sob `pg_advisory_xact_lock` do dia e o índice único (parceiro, código) é o cinto: 10 planejamentos
 *   juntos dão 10 códigos diferentes, e um código cancelado nunca é reaproveitado;
 * - concluir e estornar pegam `travarParaEscrever` (a trava do fechamento do período, 2.2b) e recusam hoje em período FECHADO.
 */

import type { ClienteDoParceiro } from './tenant';
import { pode, recusa, type Alcance } from './permissoes';
import { hojeNoRio } from './compra-campos';
import { listarHistorico } from './historico';
import { estornoDe } from './estoque-campos';
import {
  aberturasDe,
  comRecusa,
  custosDeReferencia,
  gravarMovimentos,
  lojaDoAlcance,
  movimentoParaTela,
  Recusa,
  saldosTravados,
  SELECAO_DO_MOVIMENTO,
  type MovimentoDaTela,
  type ResultadoEstoque,
} from './estoque';
import { conferirPeriodoAberto, criarRequisicaoNaTx, exigirAberto, listaDaFichaNaTx, type OpcaoDeInsumo } from './requisicao';
import { diasDeAtrasoDoLote, codigoDoLote, custoDoLote, custoPorUnidadeDoLote, foiEstornado, fraseDoQueFalta, LIMITE_DA_OBSERVACAO, LOTES_POR_DIA, lerChaveDoEnvio, lerConclusao, lerMotivo, perdaDoLote, rendimentoDoLote, validadeDoLote, formatarRendimento, quandoVence, type BaixaDoInsumo, type StatusDaProducao } from './producao-campos';
import { faltaDe, lerParaDia, numeroDaRequisicao, textoDoParaDia, type LinhaDigitada, type StatusDaRequisicao } from './requisicao-campos';
import { formatarDinheiro, formatarFracao, formatarQuantidade, UNIDADES, type Fracao, type Unidade } from './unidades';
import { CONSERVACOES, formatarValidade, retratoDaValidade, SELECAO_DA_VALIDADE, validadesDaLinha, type Conservacao, type Validades } from './validade';

const ID = /^[a-z0-9]{1,64}$/i;
const NAO_ENCONTRADO = 'Lote não encontrado nesta loja.';
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** Início de um dia do Rio (UTC−3) como instante. */
const inicioDoDia = (dia: string) => new Date(`${dia}T03:00:00.000Z`);
const ehSim = (v: unknown) => v === true || v === 'sim' || v === 'on';
const naoEncontrado = () => new Recusa({ ok: false, erros: { geral: NAO_ENCONTRADO }, naoEncontrado: true });

/** Quem fez: o nome (para o histórico) e a pessoa (texto, sem FK: a credencial mora fora do tenant). */
export interface Autor {
  nome: string;
  userId?: string | null;
}

// ================================================================ lojas (entrada do menu)

/** Lojas do alcance onde a pessoa vê (ou, para planejar, registra) a produção, com o que está pendente e atrasado. */
export async function lojasDaProducao(cliente: ClienteDoParceiro, alcance: Alcance, opcoes: { agora?: Date; permissao?: 'producao.ver' | 'producao.registrar' } = {}) {
  const agora = opcoes.agora ?? new Date();
  const permissao = opcoes.permissao ?? 'producao.ver';
  return cliente.transacao(async (tx) => {
    const lojas = (await tx.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } })).filter((l) => pode(alcance, permissao, { lojaId: l.id }));
    if (lojas.length === 0) return [];
    const hoje = hojeNoRio(agora);
    const pendentes = await tx.ordemProducao.findMany({ where: { lojaId: { in: lojas.map((l) => l.id) }, status: { in: ['PLANEJADA', 'EM_EXECUCAO'] } }, select: { lojaId: true, status: true, dataPlanejada: true } });
    return lojas.map((l) => {
      const p = pendentes.filter((o) => o.lojaId === l.id);
      return { ...l, pendentes: p.length, atrasadas: p.filter((o) => diasDeAtrasoDoLote({ status: o.status as StatusDaProducao, dataPlanejada: iso(o.dataPlanejada) }, hoje) > 0).length };
    });
  });
}

// ================================================================ quadro

export interface CartaoDoLote {
  id: string;
  codigoLote: string;
  status: StatusDaProducao;
  fichaNome: string;
  unidade: Unidade;
  planejadoMilesimos: number;
  produzidoMilesimos: number | null;
  dataPlanejada: string;
  atrasoDias: number;
  criadoEm: Date;
  iniciadaEm: Date | null;
  concluidaEm: Date | null;
  concluidaPorNome: string | null;
  canceladaEm: Date | null;
  estornado: boolean;
  /** Os insumos pedem a requisição: a situação dela (null = sem requisição). */
  requisicao: { id: string; numero: number | null; status: StatusDaRequisicao } | null;
}

/** Quantas concluídas/canceladas de hoje o quadro mostra (as pendentes, todas). */
export const RECENTES_NO_QUADRO = 20;

/**
 * O quadro da loja: planejadas e em produção (todas, das mais atrasadas para as mais novas), concluídas e canceladas de
 * HOJE (dia do Rio; as estornadas ficam em canceladas). Sem custo: o quadro é de todo mundo que vê produção.
 */
export async function quadroDaProducao(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.ver');
      const hoje = hojeNoRio(agora);
      const deHoje = inicioDoDia(hoje);
      const select = {
        id: true,
        codigoLote: true,
        status: true,
        fichaNomeSnapshot: true,
        unidadeSnapshot: true,
        planejadoMilesimos: true,
        produzidoMilesimos: true,
        dataPlanejada: true,
        criadoEm: true,
        iniciadaEm: true,
        concluidaEm: true,
        concluidaPorNome: true,
        canceladaEm: true,
        requisicao: { select: { id: true, numero: true, status: true } },
      } as const;
      const [pendentes, concluidas, canceladas] = await Promise.all([
        tx.ordemProducao.findMany({ where: { lojaId, status: { in: ['PLANEJADA', 'EM_EXECUCAO'] } }, orderBy: [{ dataPlanejada: 'asc' }, { criadoEm: 'asc' }], select }),
        tx.ordemProducao.findMany({ where: { lojaId, status: 'CONCLUIDA', concluidaEm: { gte: deHoje } }, orderBy: { concluidaEm: 'desc' }, take: RECENTES_NO_QUADRO, select }),
        tx.ordemProducao.findMany({ where: { lojaId, status: 'CANCELADA', canceladaEm: { gte: deHoje } }, orderBy: { canceladaEm: 'desc' }, take: RECENTES_NO_QUADRO, select }),
      ]);
      const cartao = (x: (typeof pendentes)[number]): CartaoDoLote => {
        const status = x.status as StatusDaProducao;
        const dataPlanejada = iso(x.dataPlanejada)!;
        return {
          id: x.id,
          codigoLote: x.codigoLote,
          status,
          fichaNome: x.fichaNomeSnapshot,
          unidade: (x.unidadeSnapshot ?? 'KG') as Unidade,
          planejadoMilesimos: x.planejadoMilesimos,
          produzidoMilesimos: x.produzidoMilesimos,
          dataPlanejada,
          atrasoDias: diasDeAtrasoDoLote({ status, dataPlanejada }, hoje),
          criadoEm: x.criadoEm,
          iniciadaEm: x.iniciadaEm,
          concluidaEm: x.concluidaEm,
          concluidaPorNome: x.concluidaPorNome,
          canceladaEm: x.canceladaEm,
          estornado: foiEstornado({ status, concluidaEm: x.concluidaEm }),
          requisicao: x.requisicao ? { id: x.requisicao.id, numero: x.requisicao.numero, status: x.requisicao.status as StatusDaRequisicao } : null,
        };
      };
      const ps = pendentes.map(cartao).sort((a, b) => b.atrasoDias - a.atrasoDias || a.criadoEm.getTime() - b.criadoEm.getTime());
      const aberto = ((await aberturasDe(tx, [lojaId])).get(lojaId)?.status ?? null) === 'FECHADA';
      return {
        loja,
        hoje,
        aberto,
        colunas: {
          PLANEJADA: ps.filter((c) => c.status === 'PLANEJADA'),
          EM_EXECUCAO: ps.filter((c) => c.status === 'EM_EXECUCAO'),
          CONCLUIDA: concluidas.map(cartao),
          CANCELADA: canceladas.map(cartao),
        } satisfies Record<StatusDaProducao, CartaoDoLote[]>,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type QuadroDaProducao = NonNullable<Awaited<ReturnType<typeof quadroDaProducao>>>;

// ================================================================ planejar

export interface FichaParaProduzir {
  id: string;
  nome: string;
  unidade: Unidade;
  /** "Refrigerado: 3 dias · Congelado: 30 dias", ou null quando a ficha não diz. */
  validade: string | null;
}

/** O que o formulário de planejar precisa: os pré-preparos ativos que viram insumo do estoque. */
export async function opcoesDaProducao(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.registrar');
      const aberto = ((await aberturasDe(tx, [lojaId])).get(lojaId)?.status ?? null) === 'FECHADA';
      const fichas = await tx.fichaTecnica.findMany({
        where: { tipo: 'PRE_PREPARO', ativa: true, insumoProduzidoId: { not: null } },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, unidadeRendimento: true, ...SELECAO_DA_VALIDADE },
      });
      const lista: FichaParaProduzir[] = fichas.map((f) => ({
        id: f.id,
        nome: f.nome,
        unidade: f.unidadeRendimento as Unidade,
        validade: retratoDaValidade(validadesDaLinha({ ...f, conservacao: f.conservacao as Conservacao | null })),
      }));
      // A lista de insumos é editável na tela (como na requisição): todos os ativos entram na escolha.
      const ativos: OpcaoDeInsumo[] = (await tx.insumo.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, unidade: true, conservacao: true } })).map((i) => ({ ...i, unidade: i.unidade as Unidade, conservacao: i.conservacao as Conservacao }));
      return { loja, aberto, fichas: lista, ativos };
    }),
  );
  return 'ok' in r ? null : r;
}

export type OpcoesDaProducao = NonNullable<Awaited<ReturnType<typeof opcoesDaProducao>>>;

/** A lista de insumos que a ficha pede para produzir `quantidade` (editável na tela antes de planejar). */
export async function listaDaProducao(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, fichaId: unknown, quantidadeTexto: unknown) {
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      await lojaDoAlcance(tx, alcance, lojaId, 'producao.registrar');
      return listaDaFichaNaTx(tx, fichaId, quantidadeTexto, { soPreparo: true });
    }),
  );
}

/**
 * Planeja o lote: `producao.registrar` na loja, estoque aberto, pré-preparo ativo que virou insumo, quantidade na unidade
 * do rendimento (até 10 mil), dia de hoje a 14 dias à frente. Na MESMA transação nasce a requisição dos insumos (setor
 * Cozinha, para o dia do lote, com a lista editada na tela) e a ordem PLANEJADA, com o código do lote. Nada sai do estoque aqui.
 */
export async function planejarProducao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { fichaId: unknown; quantidade: unknown; paraDia: unknown; observacao: unknown; linhas: readonly LinhaDigitada[]; envio?: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.registrar');
        const r = await planejarProducaoNaTx(tx, loja, { ...entrada, chave: lerChaveDoEnvio(entrada.envio) }, autor, agora);
        return { ok: true as const, id: r.id, ...(r.jaFeito ? { jaFeito: true } : {}) };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}

/**
 * A regra de planejar, na transação de quem chama (Regra Nº 2: uma regra só). Planejar pela tela (acima) e transformar a
 * linha da lista do dia em lote (3.2, `producao-lista.ts`) passam por aqui. Quem chama já conferiu a permissão dele e entrega
 * a loja lida pelo portão. `linhas` ausente = a lista da ficha, sem mudança (a da lista do dia). `daLista` (3.2) marca de onde
 * o lote veio no histórico. Recusa em `Recusa`.
 */
export async function planejarProducaoNaTx(
  tx: ClienteDoParceiro,
  loja: { id: string; nome: string; ativa: boolean },
  entrada: { fichaId: unknown; quantidade: unknown; paraDia: unknown; observacao: unknown; linhas?: readonly LinhaDigitada[]; chave: string | null; daLista?: string },
  autor: Autor,
  agora: Date,
): Promise<{ id: string; codigo: string; jaFeito?: true }> {
  const lojaId = loja.id;
  const hoje = hojeNoRio(agora);
  const dia = lerParaDia(entrada.paraDia, hoje);
  if ('erro' in dia) throw new Recusa({ ok: false, erros: { paraDia: dia.erro } });
  const obs = typeof entrada.observacao === 'string' ? entrada.observacao.trim().replace(/\s+/g, ' ') : '';
  if (obs.length > LIMITE_DA_OBSERVACAO) throw new Recusa({ ok: false, erros: { observacao: `Observação: até ${LIMITE_DA_OBSERVACAO} letras.` } });
  const chave = entrada.chave;
  // O código do lote e o envio repetido se resolvem sob a trava do dia: quem chega junto espera.
  await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp:lote:${tx.parceiroId}:${dia.dia}`}, 0))::text AS "trava"`;
  if (chave) {
    const feita = await tx.ordemProducao.findFirst({ where: { chaveIdempotencia: chave }, select: { id: true, lojaId: true, codigoLote: true } });
    if (feita) {
      if (feita.lojaId !== lojaId) throw new Recusa({ ok: false, erros: { geral: 'Este envio já foi usado: recarregue a tela e planeje de novo.' } });
      return { id: feita.id, codigo: feita.codigoLote, jaFeito: true };
    }
  }
  const lista = await listaDaFichaNaTx(tx, entrada.fichaId, entrada.quantidade, { soPreparo: true });
  const prefixo = codigoDoLote(dia.dia, 0).slice(0, 7);
  const [{ proximo }] = await tx.sql<{ proximo: number }>`
    SELECT (coalesce(max(split_part("codigoLote", '-', 2)::int), 0) + 1)::int AS "proximo" FROM "OrdemProducao"
    WHERE "parceiroId" = ${tx.parceiroId} AND "codigoLote" LIKE ${`${prefixo}%`}`;
  if (proximo > LOTES_POR_DIA) throw new Recusa({ ok: false, erros: { geral: `Passou de ${LOTES_POR_DIA.toLocaleString('pt-BR')} lotes num dia só: escolha outro dia.` } });
  const codigo = codigoDoLote(dia.dia, proximo);
  const req = await criarRequisicaoNaTx(
    tx,
    loja,
    { setor: 'COZINHA', paraDia: dia.dia, observacao: obs, linhas: entrada.linhas ?? lista.linhas, fichaId: lista.ficha.id, fichaQuantidade: lista.ficha.quantidadeMilesimos },
    autor.nome,
    agora,
    { lote: codigo },
  );
  const ordem = await tx.ordemProducao.create({
    data: {
      parceiroId: tx.parceiroId,
      lojaId,
      fichaId: lista.ficha.id,
      insumoProduzidoId: lista.ficha.insumoProduzidoId,
      codigoLote: codigo,
      status: 'PLANEJADA',
      dataPlanejada: new Date(`${dia.dia}T00:00:00.000Z`),
      planejadoMilesimos: lista.ficha.quantidadeMilesimos,
      fichaNomeSnapshot: lista.ficha.nome,
      unidadeSnapshot: lista.ficha.unidade,
      requisicaoId: req.id,
      planejadaPorNome: autor.nome,
      chaveIdempotencia: chave,
      observacao: obs || null,
    },
    select: { id: true },
  });
  await tx.historicoAlteracao.create({
    data: {
      parceiroId: tx.parceiroId,
      entidade: 'OrdemProducao',
      entidadeId: ordem.id,
      acao: 'PLANEJOU',
      depois: {
        nome: `Lote ${codigo} · ${lista.ficha.nome}`,
        planejado: formatarQuantidade(lista.ficha.quantidadeMilesimos, lista.ficha.unidade),
        paraQuando: textoDoParaDia(dia.dia, hoje).replace(/^para /, ''),
        requisicaoDoLote: `Requisição ${numeroDaRequisicao(req.numero)} · ${loja.nome}`,
        ...(entrada.daLista ? { daLista: entrada.daLista } : {}),
        ...(obs ? { observacao: obs } : {}),
      },
      autorNome: autor.nome,
    },
  });
  return { id: ordem.id, codigo };
}

// ================================================================ travas

interface OrdemTravada {
  id: string;
  lojaId: string;
  status: StatusDaProducao;
  versao: number;
  codigoLote: string;
  requisicaoId: string | null;
  fichaId: string;
  fichaNomeSnapshot: string;
  insumoProduzidoId: string | null;
  unidadeSnapshot: Unidade | null;
  planejadoMilesimos: number;
  dataPlanejada: Date;
  iniciadaEm: Date | null;
  iniciadaPorNome: string | null;
  concluidaEm: Date | null;
  produzidoMilesimos: number | null;
  custoTotalCentavos: number | null;
}

interface RequisicaoTravada {
  id: string;
  status: StatusDaRequisicao;
  versao: number;
  numero: number | null;
}

/**
 * Trava a requisição do lote (FOR UPDATE) e DEPOIS a ordem (FOR UPDATE) — a ordem fixa das travas. O vínculo ordem →
 * requisição nunca muda depois de criado, então ler antes de travar é seguro. Entregar e devolver (1.8) travam a requisição
 * primeiro: concluir/cancelar/estornar esperam uma entrega em curso, e a entrega espera quem está fechando o lote.
 */
async function travarOrdem(tx: ClienteDoParceiro, lojaId: string, id: string): Promise<{ ordem: OrdemTravada; requisicao: RequisicaoTravada | null }> {
  if (!ID.test(id)) throw naoEncontrado();
  const [pre] = await tx.sql<{ requisicaoId: string | null }>`SELECT "requisicaoId" FROM "OrdemProducao" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} AND "lojaId" = ${lojaId}`;
  if (!pre) throw naoEncontrado();
  let requisicao: RequisicaoTravada | null = null;
  if (pre.requisicaoId) {
    const [r] = await tx.sql<RequisicaoTravada>`
      SELECT "id", "status"::text AS "status", "versao", "numero" FROM "Requisicao"
      WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${pre.requisicaoId} FOR UPDATE`;
    requisicao = r ?? null;
  }
  const linhas = await tx.sql<OrdemTravada>`
    SELECT "id", "lojaId", "status"::text AS "status", "versao", "codigoLote", "requisicaoId", "fichaId", "fichaNomeSnapshot", "insumoProduzidoId",
           "unidadeSnapshot"::text AS "unidadeSnapshot", "planejadoMilesimos", "dataPlanejada", "iniciadaEm", "iniciadaPorNome", "concluidaEm",
           "produzidoMilesimos", "custoTotalCentavos"
    FROM "OrdemProducao"
    WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} AND "lojaId" = ${lojaId} FOR UPDATE`;
  if (!linhas[0]) throw naoEncontrado();
  return { ordem: linhas[0], requisicao };
}

const MUDOU = 'Alguém mexeu neste lote agora há pouco. Confira de novo; nada foi gravado.';

/** O líquido que saiu pela requisição, por insumo (baixas + estornos do livro): a verdade do custo do lote. */
async function baixasDaRequisicao(tx: ClienteDoParceiro, requisicaoId: string): Promise<BaixaDoInsumo[]> {
  const linhas = await tx.sql<{ insumoId: string; nome: string; unidade: Unidade; quantidade: number; valor: number }>`
    SELECT m."insumoId", min(m."insumoNomeSnapshot") AS "nome", min(m."unidadeSnapshot"::text) AS "unidade",
           sum(m."quantidadeMilesimos")::int AS "quantidade", sum(m."valorCentavos")::int AS "valor"
    FROM "MovimentoEstoque" m
    JOIN "RequisicaoItem" ri ON ri."parceiroId" = m."parceiroId" AND ri."id" = m."requisicaoItemId"
    WHERE m."parceiroId" = ${tx.parceiroId} AND ri."requisicaoId" = ${requisicaoId} AND m."tipo" = 'REQUISICAO'
    GROUP BY m."insumoId"
    ORDER BY min(m."insumoNomeSnapshot")`;
  return linhas.map((l) => ({ insumoId: l.insumoId, nome: l.nome, unidade: l.unidade, quantidadeMilesimos: l.quantidade, valorCentavos: l.valor }));
}

// ================================================================ iniciar

/** Começa a produzir (opcional: concluir direto da planejada também vale). Idempotente. */
export async function iniciarProducao(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, id: string, entrada: { versao: unknown }, autor: Autor, agora = new Date()): Promise<ResultadoEstoque> {
  const versaoLida = Number(entrada.versao);
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      await lojaDoAlcance(tx, alcance, lojaId, 'producao.registrar');
      const { ordem } = await travarOrdem(tx, lojaId, id);
      if (ordem.status === 'EM_EXECUCAO') return { ok: true as const, id: ordem.id, jaFeito: true };
      if (ordem.status !== 'PLANEJADA') throw new Recusa({ ok: false, erros: { geral: `O lote ${ordem.codigoLote} já ${ordem.status === 'CONCLUIDA' ? 'foi concluído' : 'foi cancelado'}.` }, conflito: true });
      if (!Number.isSafeInteger(versaoLida) || versaoLida !== ordem.versao) throw new Recusa({ ok: false, erros: { geral: MUDOU }, conflito: true });
      const mudou = await tx.ordemProducao.updateMany({ where: { id: ordem.id, versao: ordem.versao, status: 'PLANEJADA' }, data: { status: 'EM_EXECUCAO', iniciadaEm: agora, iniciadaPorNome: autor.nome, versao: { increment: 1 } } });
      if (mudou.count !== 1) throw new Error('[erp] lote mudou no meio do início.');
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'OrdemProducao',
          entidadeId: ordem.id,
          acao: 'INICIOU',
          antes: { nome: `Lote ${ordem.codigoLote} · ${ordem.fichaNomeSnapshot}`, situacao: 'Planejada' },
          depois: { nome: `Lote ${ordem.codigoLote} · ${ordem.fichaNomeSnapshot}`, situacao: 'Em produção' },
          autorNome: autor.nome,
        },
      });
      return { ok: true as const, id: ordem.id };
    }),
  );
}

// ================================================================ o lote (detalhe)

export interface InsumoDoLote {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  pedidoMilesimos: number;
  /** Líquido que saiu do estoque (entregas − devoluções). */
  saiuMilesimos: number;
  faltaMilesimos: number;
  /** R$ que saíram deste insumo; null para quem não vê custos. */
  valorCentavos: number | null;
  /** Saiu mas sem valor (sem preço na entrega). */
  semPreco: boolean;
}

export interface CustoDaTela {
  /** O que saiu do estoque até aqui (ou o fechado, no lote concluído). */
  totalCentavos: number;
  /** Nomes dos insumos que saíram sem preço: o custo é INCOMPLETO. */
  semPreco: string[];
  /** Por kg/L/un do que saiu de verdade (só concluído com produzido > 0). */
  porUnidade: Fracao | null;
  /** O custo da ficha hoje, por kg/L/un (a cascata); null = a ficha está incompleta ou não existe. */
  previstoPorUnidade: Fracao | null;
  /** O que a diferença de rendimento custou (só concluído; positivo = perdeu). */
  perda: Fracao | null;
}

/** O lote, com a requisição dos insumos, o que saiu, o rendimento, a validade, o custo (quem vê custos) e o histórico. */
export async function obterOrdem(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, id: string, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.ver');
      if (!ID.test(id)) throw naoEncontrado();
      const o = await tx.ordemProducao.findFirst({
        where: { id, lojaId },
        select: {
          id: true,
          codigoLote: true,
          status: true,
          versao: true,
          fichaId: true,
          fichaNomeSnapshot: true,
          insumoProduzidoId: true,
          unidadeSnapshot: true,
          dataPlanejada: true,
          planejadoMilesimos: true,
          produzidoMilesimos: true,
          custoTotalCentavos: true,
          insumosSemPreco: true,
          observacao: true,
          criadoEm: true,
          planejadaPorNome: true,
          iniciadaEm: true,
          iniciadaPorNome: true,
          concluidaEm: true,
          concluidaPorNome: true,
          canceladaEm: true,
          canceladaPorNome: true,
          motivoCancelamento: true,
          motivoRendimento: true,
          conservacaoSnapshot: true,
          validadeMinSnapshot: true,
          validadeEm: true,
          requisicaoId: true,
        },
      });
      if (!o) throw naoEncontrado();
      const verCustos = pode(alcance, 'insumos.ver');
      const status = o.status as StatusDaProducao;
      const unidade = (o.unidadeSnapshot ?? 'KG') as Unidade;
      const hoje = hojeNoRio(agora);
      const dataPlanejada = iso(o.dataPlanejada)!;
      const req = o.requisicaoId
        ? await tx.requisicao.findFirst({
            where: { id: o.requisicaoId },
            select: { id: true, numero: true, status: true, versao: true, itens: { orderBy: { ordem: 'asc' }, select: { insumoId: true, insumoNomeSnapshot: true, unidadeSnapshot: true, solicitadoMilesimos: true, atendidoMilesimos: true } } },
          })
        : null;
      const baixas = req ? await baixasDaRequisicao(tx, req.id) : [];
      const porInsumo = new Map(baixas.map((b) => [b.insumoId, b]));
      const itensDoLote: InsumoDoLote[] = (req?.itens ?? []).map((i) => {
        const b = porInsumo.get(i.insumoId);
        const saiu = b ? -b.quantidadeMilesimos : 0;
        return {
          insumoId: i.insumoId,
          nome: i.insumoNomeSnapshot,
          unidade: i.unidadeSnapshot as Unidade,
          pedidoMilesimos: i.solicitadoMilesimos,
          saiuMilesimos: saiu,
          faltaMilesimos: faltaDe({ solicitadoMilesimos: i.solicitadoMilesimos, atendidoMilesimos: i.atendidoMilesimos ?? 0 }),
          valorCentavos: verCustos ? (b ? -b.valorCentavos : 0) : null,
          semPreco: saiu !== 0 && (b?.valorCentavos ?? 0) === 0,
        };
      });
      // Conservações aceitas pela ficha AGORA (a escolha de "concluir" sai daqui) e o custo da ficha hoje.
      const ficha = await tx.fichaTecnica.findFirst({ where: { id: o.fichaId }, select: { ...SELECAO_DA_VALIDADE, ativa: true } });
      const validadesAgora: Validades | null = ficha ? validadesDaLinha({ ...ficha, conservacao: ficha.conservacao as Conservacao | null }) : null;
      let custo: CustoDaTela | null = null;
      if (verCustos) {
        const feito = custoDoLote(baixas);
        const previsto = o.insumoProduzidoId ? (await custosDeReferencia(tx, [o.insumoProduzidoId])).get(o.insumoProduzidoId)?.porUnidade ?? null : null;
        const total = status === 'CONCLUIDA' || (status === 'CANCELADA' && o.concluidaEm) ? (o.custoTotalCentavos ?? feito.totalCentavos) : feito.totalCentavos;
        const produzido = o.produzidoMilesimos;
        custo = {
          totalCentavos: total,
          semPreco: feito.semPreco.map((s) => s.nome),
          porUnidade: produzido ? custoPorUnidadeDoLote(total, produzido) : null,
          previstoPorUnidade: previsto,
          perda: o.concluidaEm && produzido !== null ? perdaDoLote(total, o.planejadoMilesimos, produzido) : null,
        };
      }
      const movs = await tx.movimentoEstoque.findMany({ where: { ordemProducaoId: o.id }, orderBy: [{ ocorridoEm: 'asc' }, { criadoEm: 'asc' }, { id: 'asc' }], select: SELECAO_DO_MOVIMENTO });
      const movimentos: MovimentoDaTela[] = movs.map(movimentoParaTela).map((m) => (verCustos ? m : { ...m, valorCentavos: 0 }));
      const saldoNaLoja =
        o.insumoProduzidoId && pode(alcance, 'estoque.ver', { lojaId })
          ? ((await tx.saldoEstoque.findFirst({ where: { lojaId, insumoId: o.insumoProduzidoId }, select: { quantidadeMilesimos: true } }))?.quantidadeMilesimos ?? 0)
          : null;
      const historico = await listarHistorico(tx, { de: [{ entidade: 'OrdemProducao', ids: [o.id] }], limite: 20, verPrecos: false, verCustos });
      const aberto = ((await aberturasDe(tx, [lojaId])).get(lojaId)?.status ?? null) === 'FECHADA';
      const rendimento = o.concluidaEm && o.produzidoMilesimos !== null ? rendimentoDoLote(o.planejadoMilesimos, o.produzidoMilesimos) : null;
      return {
        loja,
        hoje,
        aberto,
        ordem: {
          id: o.id,
          codigoLote: o.codigoLote,
          status,
          versao: o.versao,
          fichaId: o.fichaId,
          fichaNome: o.fichaNomeSnapshot,
          insumoProduzidoId: o.insumoProduzidoId,
          unidade,
          dataPlanejada,
          planejadoMilesimos: o.planejadoMilesimos,
          produzidoMilesimos: o.produzidoMilesimos,
          observacao: o.observacao,
          criadoEm: o.criadoEm,
          planejadaPorNome: o.planejadaPorNome,
          iniciadaEm: o.iniciadaEm,
          iniciadaPorNome: o.iniciadaPorNome,
          concluidaEm: o.concluidaEm,
          concluidaPorNome: o.concluidaPorNome,
          canceladaEm: o.canceladaEm,
          canceladaPorNome: o.canceladaPorNome,
          motivoCancelamento: o.motivoCancelamento,
          motivoRendimento: o.motivoRendimento,
          conservacao: (o.conservacaoSnapshot ?? null) as Conservacao | null,
          validadeMin: o.validadeMinSnapshot,
          validadeEm: o.validadeEm,
          estornado: foiEstornado({ status, concluidaEm: o.concluidaEm }),
          insumosSemPreco: o.insumosSemPreco,
        },
        atrasoDias: diasDeAtrasoDoLote({ status, dataPlanejada }, hoje),
        requisicao: req ? { id: req.id, numero: req.numero, status: req.status as StatusDaRequisicao, versao: req.versao } : null,
        itensDoLote,
        // O que a ficha aceita hoje (a escolha de conservação ao concluir); a validade do lote concluído é a fotografada.
        validadesAgora,
        fichaAtiva: ficha?.ativa ?? false,
        rendimento,
        custo,
        movimentos,
        saldoNaLoja,
        historico,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type LoteDaLoja = NonNullable<Awaited<ReturnType<typeof obterOrdem>>>;

// ================================================================ concluir

/**
 * Conclui o lote: `producao.registrar`, estoque aberto, hoje fora de período fechado, a requisição dos insumos ATENDIDA
 * (tudo saiu, ou o resto foi encerrado). O cozinheiro diz quanto saiu de verdade (0 a 2× o planejado; fora de ±10% pede o
 * motivo; 0 = lote perdido) e a conservação (entre as da ficha; define a validade). Numa transação só: UM `PRODUCAO_ENTRADA`
 * no insumo que a ficha produz, na loja do lote, com o custo FECHADO pelas baixas reais; a ordem vira CONCLUIDA e não muda
 * mais. Concluir de novo = "já concluído".
 */
export async function concluirProducao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  id: string,
  entrada: { versao: unknown; produzido: unknown; escala: unknown; motivo: unknown; conservacao: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const versaoLida = Number(entrada.versao);
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.registrar');
        await conferirPeriodoAberto(tx, agora);
        await exigirAberto(tx, loja, true);
        const { ordem, requisicao } = await travarOrdem(tx, lojaId, id);
        // O mesmo "concluir" de novo (clique duplo, outra aba, rede que caiu depois de gravar): a que valeu fica.
        if (ordem.status === 'CONCLUIDA') return { ok: true as const, id: ordem.id, jaFeito: true };
        if (ordem.status === 'CANCELADA') throw new Recusa({ ok: false, erros: { geral: `O lote ${ordem.codigoLote} foi cancelado: não se conclui.` }, conflito: true });
        if (!Number.isSafeInteger(versaoLida) || versaoLida !== ordem.versao) throw new Recusa({ ok: false, erros: { geral: MUDOU }, conflito: true });
        if (!requisicao || !ordem.insumoProduzidoId) throw new Recusa({ ok: false, erros: { geral: `O lote ${ordem.codigoLote} não tem a requisição dos insumos. Cancele e planeje de novo.` } });
        if (requisicao.status === 'CANCELADA') throw new Recusa({ ok: false, erros: { geral: 'A requisição dos insumos foi cancelada: cancele o lote.' } });
        const itens = await tx.requisicaoItem.findMany({ where: { requisicaoId: requisicao.id }, orderBy: { ordem: 'asc' }, select: { insumoNomeSnapshot: true, unidadeSnapshot: true, solicitadoMilesimos: true, atendidoMilesimos: true } });
        if (requisicao.status !== 'ATENDIDA') {
          const frase = fraseDoQueFalta(
            itens.map((i) => ({ nome: i.insumoNomeSnapshot, unidade: i.unidadeSnapshot as Unidade, faltaMilesimos: faltaDe({ solicitadoMilesimos: i.solicitadoMilesimos, atendidoMilesimos: i.atendidoMilesimos ?? 0 }) })),
            requisicao.numero,
          );
          throw new Recusa({
            ok: false,
            erros: { geral: frase ?? `Os insumos ainda não foram entregues pela requisição ${numeroDaRequisicao(requisicao.numero)}: entregue ou encerre o resto.` },
            conflito: true,
          });
        }
        const unidade = (ordem.unidadeSnapshot ?? 'KG') as Unidade;
        const ficha = await tx.fichaTecnica.findFirst({ where: { id: ordem.fichaId }, select: SELECAO_DA_VALIDADE });
        const validades = ficha ? validadesDaLinha({ ...ficha, conservacao: ficha.conservacao as Conservacao | null }) : null;
        const lido = lerConclusao(entrada, { planejadoMilesimos: ordem.planejadoMilesimos, unidade, validades });
        if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });
        const c = lido.conclusao;
        const baixas = await baixasDaRequisicao(tx, requisicao.id);
        const custo = custoDoLote(baixas);
        if (!custo.saiuAlgo) {
          throw new Recusa({ ok: false, erros: { geral: `Nenhum insumo saiu do estoque pela requisição ${numeroDaRequisicao(requisicao.numero)}: sem a saída não há custo para fechar. Entregue os insumos, ou cancele o lote.` }, conflito: true });
        }
        const insumo = await tx.insumo.findFirst({ where: { id: ordem.insumoProduzidoId }, select: { id: true, nome: true, unidade: true, ativo: true } });
        if (!insumo) throw new Recusa({ ok: false, erros: { geral: 'O insumo que a ficha produz não existe mais: refaça a ficha.' } });
        if (c.produzidoMilesimos > 0) {
          await gravarMovimentos(
            tx,
            [
              {
                lojaId,
                insumoId: insumo.id,
                tipo: 'PRODUCAO_ENTRADA',
                quantidadeMilesimos: c.produzidoMilesimos,
                valorCentavos: custo.totalCentavos,
                insumoNome: insumo.nome,
                unidade: insumo.unidade as Unidade,
                motivo: `Lote ${ordem.codigoLote} · ${ordem.fichaNomeSnapshot}`,
                chave: `producao:${ordem.id}`,
                ordemProducaoId: ordem.id,
              },
            ],
            { ocorridoEm: agora },
          );
        }
        const validadeEm = c.conservacao && c.validadeMin ? validadeDoLote(agora, c.validadeMin) : null;
        const mudou = await tx.ordemProducao.updateMany({
          where: { id: ordem.id, versao: ordem.versao, status: { in: ['PLANEJADA', 'EM_EXECUCAO'] } },
          data: {
            status: 'CONCLUIDA',
            produzidoMilesimos: c.produzidoMilesimos,
            custoTotalCentavos: custo.totalCentavos,
            insumosSemPreco: custo.semPreco.length,
            concluidaEm: agora,
            concluidaPorNome: autor.nome,
            responsavelNomeSnapshot: autor.nome,
            responsavelUsuarioId: autor.userId ?? null,
            motivoRendimento: c.motivo,
            ...(c.conservacao && c.validadeMin && validadeEm ? { conservacaoSnapshot: c.conservacao, validadeMinSnapshot: c.validadeMin, validadeEm } : {}),
            ...(ordem.iniciadaEm ? {} : { iniciadaEm: agora, iniciadaPorNome: autor.nome }),
            versao: { increment: 1 },
          },
        });
        if (mudou.count !== 1) throw new Error('[erp] lote mudou no meio da conclusão.');
        const r = rendimentoDoLote(ordem.planejadoMilesimos, c.produzidoMilesimos);
        const porUnidade = custoPorUnidadeDoLote(custo.totalCentavos, c.produzidoMilesimos);
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'OrdemProducao',
            entidadeId: ordem.id,
            acao: 'CONCLUIU',
            antes: { nome: `Lote ${ordem.codigoLote} · ${ordem.fichaNomeSnapshot}`, situacao: ordem.status === 'EM_EXECUCAO' ? 'Em produção' : 'Planejada' },
            depois: {
              nome: `Lote ${ordem.codigoLote} · ${ordem.fichaNomeSnapshot}`,
              situacao: c.produzidoMilesimos === 0 ? 'Lote perdido' : 'Concluída',
              planejado: formatarQuantidade(ordem.planejadoMilesimos, unidade),
              produzido: formatarQuantidade(c.produzidoMilesimos, unidade),
              rendimentoDoLote: formatarRendimento(r.rendimentoBp),
              ...(c.motivo ? { motivoDaDiferenca: c.motivo } : {}),
              custoDoLote: `${formatarDinheiro(custo.totalCentavos)}${custo.semPreco.length ? ' (incompleto)' : porUnidade ? ` (${formatarFracao(porUnidade)}/${UNIDADES[unidade].sigla})` : ''}`,
              ...(c.conservacao && c.validadeMin && validadeEm ? { validadeDoLote: `${CONSERVACOES[c.conservacao]} ${formatarValidade(c.validadeMin)}, vence ${quandoVence(validadeEm)}` } : {}),
              ...(c.produzidoMilesimos > 0 ? { entrouNoEstoque: `${insumo.nome} ${formatarQuantidade(c.produzidoMilesimos, unidade)} · ${loja.nome}` } : {}),
            },
            autorNome: autor.nome,
          },
        });
        return { ok: true as const, id: ordem.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}

// ================================================================ cancelar

/**
 * Cancela o lote que ainda não saiu (planejado ou em produção): só com a saída LÍQUIDA zero na requisição (nada foi
 * entregue, ou tudo voltou) — senão o estoque devolve primeiro. Cancela a requisição junto. Motivo de 3 a 200 letras.
 * Cancelar de novo = "já cancelado". O código do lote fica com ele: nunca é reaproveitado.
 */
export async function cancelarProducao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  id: string,
  entrada: { versao: unknown; motivo: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const versaoLida = Number(entrada.versao);
  const motivo = lerMotivo(entrada.motivo);
  if (!motivo.ok) return { ok: false, erros: { motivo: motivo.erro } };
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.registrar');
      const { ordem, requisicao } = await travarOrdem(tx, lojaId, id);
      if (ordem.status === 'CANCELADA') return { ok: true as const, id: ordem.id, jaFeito: true };
      if (ordem.status === 'CONCLUIDA') throw new Recusa({ ok: false, erros: { geral: `O lote ${ordem.codigoLote} já foi concluído: para desfazer, estorne o lote (quem ajusta o estoque).` }, conflito: true });
      if (!Number.isSafeInteger(versaoLida) || versaoLida !== ordem.versao) throw new Recusa({ ok: false, erros: { geral: MUDOU }, conflito: true });
      if (requisicao) {
        const baixas = await baixasDaRequisicao(tx, requisicao.id);
        const saiu = baixas.filter((b) => b.quantidadeMilesimos !== 0);
        if (saiu.length) {
          throw new Recusa({
            ok: false,
            erros: {
              geral: `Já saiu estoque pela requisição ${numeroDaRequisicao(requisicao.numero)} (${saiu.map((b) => `${b.nome} ${formatarQuantidade(-b.quantidadeMilesimos, b.unidade)}`).join(' · ')}): o estoque precisa receber de volta antes de cancelar o lote.`,
            },
            conflito: true,
          });
        }
        const texto = `Lote ${ordem.codigoLote} cancelado: ${motivo.motivo}`.slice(0, 200);
        await tx.requisicao.updateMany({ where: { id: requisicao.id }, data: { status: 'CANCELADA', canceladaEm: agora, canceladaPorNome: autor.nome, motivoCancelamento: texto, versao: { increment: 1 } } });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'Requisicao',
            entidadeId: requisicao.id,
            acao: 'CANCELOU',
            antes: { nome: `Requisição ${numeroDaRequisicao(requisicao.numero)} · ${loja.nome}` },
            depois: { nome: `Requisição ${numeroDaRequisicao(requisicao.numero)} · ${loja.nome}`, situacao: 'Cancelada' },
            motivo: texto,
            autorNome: autor.nome,
          },
        });
      }
      const mudou = await tx.ordemProducao.updateMany({
        where: { id: ordem.id, versao: ordem.versao, status: { in: ['PLANEJADA', 'EM_EXECUCAO'] } },
        data: { status: 'CANCELADA', canceladaEm: agora, canceladaPorNome: autor.nome, motivoCancelamento: motivo.motivo, versao: { increment: 1 } },
      });
      if (mudou.count !== 1) throw new Error('[erp] lote mudou no meio do cancelamento.');
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'OrdemProducao',
          entidadeId: ordem.id,
          acao: 'CANCELOU',
          antes: { nome: `Lote ${ordem.codigoLote} · ${ordem.fichaNomeSnapshot}`, situacao: ordem.status === 'EM_EXECUCAO' ? 'Em produção' : 'Planejada' },
          depois: { nome: `Lote ${ordem.codigoLote} · ${ordem.fichaNomeSnapshot}`, situacao: 'Cancelada' },
          motivo: motivo.motivo,
          autorNome: autor.nome,
        },
      });
      return { ok: true as const, id: ordem.id };
    }),
  );
}

// ================================================================ estornar

/**
 * Estorna o lote CONCLUÍDO: `producao.registrar` E `estoque.ajustar` (mexe no saldo). O estorno é o espelho exato do
 * `PRODUCAO_ENTRADA` (o banco confere), com a data de hoje; o saldo abaixo de zero só com a confirmação de quem estorna.
 * A ordem vira CANCELADA e guarda `concluidaEm` (é assim que se sabe que foi estornada). As baixas dos insumos ficam:
 * o que se cozinhou não volta para a prateleira.
 */
export async function estornarProducao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  id: string,
  entrada: { versao: unknown; motivo: unknown; confirmarNegativo: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const versaoLida = Number(entrada.versao);
  const motivo = lerMotivo(entrada.motivo);
  if (!motivo.ok) return { ok: false, erros: { motivo: motivo.erro } };
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.registrar');
        const negado = recusa(alcance, 'estoque.ajustar', { lojaId });
        if (negado) throw new Recusa({ ok: false, erros: { geral: `Estornar um lote concluído mexe no saldo do estoque: ${negado}` } });
        await conferirPeriodoAberto(tx, agora);
        await exigirAberto(tx, loja, true);
        const { ordem } = await travarOrdem(tx, lojaId, id);
        if (ordem.status === 'CANCELADA' && ordem.concluidaEm) return { ok: true as const, id: ordem.id, jaFeito: true };
        if (ordem.status !== 'CONCLUIDA') throw new Recusa({ ok: false, erros: { geral: `O lote ${ordem.codigoLote} ainda não foi concluído: cancele-o, em vez de estornar.` }, conflito: true });
        if (!Number.isSafeInteger(versaoLida) || versaoLida !== ordem.versao) throw new Recusa({ ok: false, erros: { geral: MUDOU }, conflito: true });
        const entrada1 = await tx.movimentoEstoque.findFirst({
          where: { ordemProducaoId: ordem.id, tipo: 'PRODUCAO_ENTRADA', estornoDeId: null, estorno: { is: null } },
          select: { id: true, lojaId: true, insumoId: true, tipo: true, quantidadeMilesimos: true, valorCentavos: true, insumoNomeSnapshot: true, unidadeSnapshot: true, notaId: true, contagemItemId: true, requisicaoItemId: true, ordemProducaoId: true },
        });
        let negativo: string | null = null;
        if (entrada1) {
          const saldos = await saldosTravados(tx, lojaId, [entrada1.insumoId]);
          const fica = (saldos.get(entrada1.insumoId) ?? 0) - entrada1.quantidadeMilesimos;
          const unidade = entrada1.unidadeSnapshot as Unidade;
          if (fica < 0) {
            negativo = `${entrada1.insumoNomeSnapshot} fica com −${formatarQuantidade(-fica, unidade)} no livro`;
            if (!ehSim(entrada.confirmarNegativo)) {
              throw new Recusa({
                ok: false,
                erros: {
                  confirmarNegativo: `O estoque tem ${formatarQuantidade(saldos.get(entrada1.insumoId) ?? 0, unidade)} de ${entrada1.insumoNomeSnapshot} e o estorno tira ${formatarQuantidade(entrada1.quantidadeMilesimos, unidade)}: fica abaixo de zero. Se é isso mesmo (o lote já foi usado), confirme: o saldo negativo vira alarme nas divergências.`,
                },
              });
            }
          }
          await gravarMovimentos(tx, [estornoDe({ ...entrada1, tipo: 'PRODUCAO_ENTRADA', unidadeSnapshot: unidade }, `Estorno do lote ${ordem.codigoLote} · ${motivo.motivo}`.slice(0, 200))], { ocorridoEm: agora });
        }
        const mudou = await tx.ordemProducao.updateMany({
          where: { id: ordem.id, versao: ordem.versao, status: 'CONCLUIDA' },
          data: { status: 'CANCELADA', canceladaEm: agora, canceladaPorNome: autor.nome, motivoCancelamento: motivo.motivo, versao: { increment: 1 } },
        });
        if (mudou.count !== 1) throw new Error('[erp] lote mudou no meio do estorno.');
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'OrdemProducao',
            entidadeId: ordem.id,
            acao: 'ESTORNOU',
            antes: { nome: `Lote ${ordem.codigoLote} · ${ordem.fichaNomeSnapshot}`, situacao: 'Concluída' },
            depois: {
              nome: `Lote ${ordem.codigoLote} · ${ordem.fichaNomeSnapshot}`,
              situacao: 'Estornada',
              ...(entrada1 ? { estornoDoLote: `${entrada1.insumoNomeSnapshot} −${formatarQuantidade(entrada1.quantidadeMilesimos, entrada1.unidadeSnapshot as Unidade)} · ${loja.nome}` } : {}),
              ...(negativo ? { observacao: negativo } : {}),
            },
            motivo: motivo.motivo,
            autorNome: autor.nome,
          },
        });
        return { ok: true as const, id: ordem.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}
