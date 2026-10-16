/**
 * Requisição (1.8) — com banco, sem tela. O setor pede (cozinha, salão…), o
 * estoque entrega e a baixa sai daqui: `REQUISICAO` (−) no livro, com o saldo
 * na mesma transação (`gravarMovimentos`). Devolução por estorno. E o
 * cruzamento requisição × contagem (só leitura): o que a contagem acusou sem
 * requisição que explique.
 *
 * Recebe sempre o `ClienteDoParceiro` (parceiro da sessão) e o `Alcance`,
 * com a LOJA: quadro e detalhe = `requisicao.pedir` OU `requisicao.atender`;
 * pedir = `requisicao.pedir`; entregar, encerrar e receber devolução =
 * `requisicao.atender`; cancelar a pedida = qualquer das duas; divergências
 * = `estoque.ajustar` (quem confere contagem). Setor não concede nada
 * (decisão 39): só pré-escolhe o setor do pedido. Loja fora do alcance não
 * existe para quem pede.
 *
 * Concorrência:
 * - número da requisição sob trava da loja (`pg_advisory_xact_lock`) e índice
 *   único (loja, número);
 * - entregar: `FOR UPDATE` na requisição + versão lida: duas entregas da
 *   mesma tela não baixam duas vezes (a segunda recebe "já atendida" ou o
 *   conflito); a chave do movimento é por item × versão;
 * - entregar × aplicar contagem: os dois passam por `gravarMovimentos`
 *   (saldo FOR UPDATE em ordem) e a contagem compara com o esperado
 *   fotografado — qualquer ordem dá o saldo certo (decisão 73); a baixa
 *   depois de contar aparece em "depois de contar" e segura o "fecha
 *   sozinha";
 * - abertura em andamento: a entrega trava a abertura (`FOR SHARE`, como a
 *   nota) e recusa enquanto ela não for concluída.
 */

import type { ClienteDoParceiro } from './tenant';
import { pode, type Alcance, type Permissao } from './permissoes';
import { hojeNoRio, lerData } from './compra-campos';
import { listarHistorico } from './historico';
import {
  aberturasDe,
  comRecusa,
  custosDeReferencia,
  gravarMovimentos,
  lojaDoAlcance,
  movimentoParaTela,
  Recusa,
  SELECAO_DO_MOVIMENTO,
  travarAberturas,
  type MovimentoDaTela,
  type ResultadoEstoque,
} from './estoque';
import { valorDaQuantidade } from './estoque-campos';
import { periodoDe, type ConfigDoPeriodo } from './contagem';
import { somarDias, diasEntre, regrasDaLoja } from './contagem-campos';
import {
  baixasDaEntrega,
  diasDeAtraso,
  divergenciasDoPeriodo,
  estadoDepoisDaEntrega,
  faltaDe,
  fraseDoNegativo,
  lerEntrega,
  lerPedido,
  movimentosDaDevolucao,
  negativosDaEntrega,
  numeroDaRequisicao,
  porSetor,
  quantidadesDaFicha,
  resumoDasDivergencias,
  rotuloDoSetor,
  ROTULO_DA_REQUISICAO,
  textoDoCampo,
  textoDoParaDia,
  type DivergenciaDoInsumo,
  type Fluxo,
  type InsumoParaPedir,
  type ItemParaEntregar,
  type LinhaDigitada,
  type Marco,
  type StatusDaRequisicao,
} from './requisicao-campos';
import { formatarQuantidade, lerQuantidadeNa, type Fracao, type Unidade } from './unidades';
import type { Conservacao } from './validade';
import type { TipoDeMovimento } from './estoque-campos';

const ID = /^[a-z0-9]{1,64}$/i;
const motivoLimpo = (t: unknown) => (typeof t === 'string' ? t.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null);
const NAO_ENCONTRADA = 'Requisição não encontrada nesta loja.';
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** Início de um dia do Rio (UTC−3) como instante. */
const inicioDoDia = (dia: string) => new Date(`${dia}T03:00:00.000Z`);
const ehSim = (v: unknown) => v === true || v === 'sim' || v === 'on';

// ================================================================ apoio

/** A loja, se a pessoa tem QUALQUER uma das permissões nela (a primeira que passa). */
async function lojaComAlguma(tx: ClienteDoParceiro, alcance: Alcance, lojaId: string, permissoes: readonly Permissao[]) {
  const p = permissoes.find((x) => pode(alcance, x, { lojaId })) ?? permissoes[0];
  return lojaDoAlcance(tx, alcance, lojaId, p);
}

const VER: Permissao[] = ['requisicao.pedir', 'requisicao.atender'];

/** O estoque da loja está aberto (abertura concluída)? A requisição baixa do estoque aberto. */
async function exigirAberto(tx: ClienteDoParceiro, loja: { id: string; nome: string }, travar = false) {
  const a = travar ? (await travarAberturas(tx, [loja.id])).get(loja.id) : (await aberturasDe(tx, [loja.id])).get(loja.id);
  if (!a || a.status !== 'FECHADA' || !a.fechadaEm) {
    throw new Recusa({ ok: false, erros: { geral: `O estoque da ${loja.nome} ainda não foi aberto: a requisição baixa do estoque, que começa depois da contagem de abertura.` } });
  }
}

/** "Cheddar fatiado 2 kg · Bacon 1 kg". */
const listaEmTexto = (itens: readonly { nome: string; unidade: Unidade; q: number }[]) => itens.map((i) => `${i.nome} ${formatarQuantidade(i.q, i.unidade)}`).join(' · ');

interface RequisicaoTravada {
  id: string;
  lojaId: string;
  status: StatusDaRequisicao;
  versao: number;
  numero: number | null;
  setor: string | null;
}

async function travarRequisicao(tx: ClienteDoParceiro, lojaId: string, id: string): Promise<RequisicaoTravada> {
  if (!ID.test(id)) throw new Recusa({ ok: false, erros: { geral: NAO_ENCONTRADA }, naoEncontrado: true });
  const [r] = await tx.sql<RequisicaoTravada>`
    SELECT "id", "lojaId", "status"::text AS "status", "versao", "numero", "setor" FROM "Requisicao"
    WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} AND "lojaId" = ${lojaId}
    FOR UPDATE`;
  if (!r) throw new Recusa({ ok: false, erros: { geral: NAO_ENCONTRADA }, naoEncontrado: true });
  return r;
}

const SELECAO_DO_ITEM = { id: true, insumoId: true, insumoNomeSnapshot: true, unidadeSnapshot: true, solicitadoMilesimos: true, atendidoMilesimos: true, devolvidoMilesimos: true, ordem: true } as const;

function paraEntregar(i: { id: string; insumoId: string; insumoNomeSnapshot: string; unidadeSnapshot: string; solicitadoMilesimos: number; atendidoMilesimos: number | null }): ItemParaEntregar {
  return { id: i.id, insumoId: i.insumoId, nome: i.insumoNomeSnapshot, unidade: i.unidadeSnapshot as Unidade, solicitadoMilesimos: i.solicitadoMilesimos, atendidoMilesimos: i.atendidoMilesimos ?? 0 };
}

// ================================================================ lojas (entrada do menu)

/** Lojas do alcance onde a pessoa vê requisições, com o que está pendente e atrasado. */
export async function lojasDasRequisicoes(cliente: ClienteDoParceiro, alcance: Alcance, agora = new Date()) {
  return cliente.transacao(async (tx) => {
    const lojas = (await tx.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } })).filter((l) => VER.some((p) => pode(alcance, p, { lojaId: l.id })));
    if (lojas.length === 0) return [];
    const hoje = hojeNoRio(agora);
    const pendentes = await tx.requisicao.findMany({ where: { lojaId: { in: lojas.map((l) => l.id) }, status: { in: ['ABERTA', 'PARCIAL'] } }, select: { lojaId: true, status: true, paraDia: true } });
    return lojas.map((l) => {
      const p = pendentes.filter((r) => r.lojaId === l.id);
      return { ...l, pendentes: p.length, atrasadas: p.filter((r) => diasDeAtraso({ status: r.status as StatusDaRequisicao, paraDia: iso(r.paraDia) }, hoje) > 0).length };
    });
  });
}

/** Lojas onde a pessoa vê as divergências (quem confere contagem). */
export async function lojasDasDivergencias(cliente: ClienteDoParceiro, alcance: Alcance) {
  return cliente.transacao(async (tx) => (await tx.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } })).filter((l) => pode(alcance, 'estoque.ajustar', { lojaId: l.id })));
}

// ================================================================ quadro

export interface CartaoDaRequisicao {
  id: string;
  numero: number | null;
  status: StatusDaRequisicao;
  setor: string | null;
  paraDia: string | null;
  solicitadaEm: Date;
  atendidaEm: Date | null;
  canceladaEm: Date | null;
  pedidaPorNome: string | null;
  atendidaPorNome: string | null;
  fichaNome: string | null;
  atrasoDias: number;
  itens: { nome: string; unidade: Unidade; solicitadoMilesimos: number; atendidoMilesimos: number }[];
}

/** Quantas atendidas/canceladas recentes o quadro mostra (as pendentes, todas). */
export const RECENTES_NO_QUADRO = 20;

/**
 * O quadro da loja: pendentes (pedidas e atendidas em parte) todas, das mais
 * atrasadas para as mais novas; atendidas e canceladas dos últimos 7 dias.
 */
export async function quadroDeRequisicoes(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaComAlguma(tx, alcance, lojaId, VER);
      const hoje = hojeNoRio(agora);
      const desde = new Date(agora.getTime() - 7 * 86_400_000);
      const select = {
        id: true,
        numero: true,
        status: true,
        setor: true,
        paraDia: true,
        solicitadaEm: true,
        atendidaEm: true,
        canceladaEm: true,
        pedidaPorNome: true,
        atendidaPorNome: true,
        fichaNomeSnapshot: true,
        itens: { orderBy: { ordem: 'asc' as const }, select: { insumoNomeSnapshot: true, unidadeSnapshot: true, solicitadoMilesimos: true, atendidoMilesimos: true } },
      } as const;
      const [pendentes, atendidas, canceladas] = await Promise.all([
        tx.requisicao.findMany({ where: { lojaId, status: { in: ['ABERTA', 'PARCIAL'] } }, orderBy: [{ paraDia: 'asc' }, { solicitadaEm: 'asc' }], select }),
        tx.requisicao.findMany({ where: { lojaId, status: 'ATENDIDA', atendidaEm: { gte: desde } }, orderBy: { atendidaEm: 'desc' }, take: RECENTES_NO_QUADRO, select }),
        tx.requisicao.findMany({ where: { lojaId, status: 'CANCELADA', canceladaEm: { gte: desde } }, orderBy: { canceladaEm: 'desc' }, take: RECENTES_NO_QUADRO, select }),
      ]);
      const cartao = (x: (typeof pendentes)[number]): CartaoDaRequisicao => {
        const status = x.status as StatusDaRequisicao;
        const paraDia = iso(x.paraDia);
        return {
          id: x.id,
          numero: x.numero,
          status,
          setor: x.setor,
          paraDia,
          solicitadaEm: x.solicitadaEm,
          atendidaEm: x.atendidaEm,
          canceladaEm: x.canceladaEm,
          pedidaPorNome: x.pedidaPorNome,
          atendidaPorNome: x.atendidaPorNome,
          fichaNome: x.fichaNomeSnapshot,
          atrasoDias: diasDeAtraso({ status, paraDia }, hoje),
          itens: x.itens.map((i) => ({ nome: i.insumoNomeSnapshot, unidade: i.unidadeSnapshot as Unidade, solicitadoMilesimos: i.solicitadoMilesimos, atendidoMilesimos: i.atendidoMilesimos ?? 0 })),
        };
      };
      const ps = pendentes.map(cartao).sort((a, b) => b.atrasoDias - a.atrasoDias || a.solicitadaEm.getTime() - b.solicitadaEm.getTime());
      const aberto = ((await aberturasDe(tx, [lojaId])).get(lojaId)?.status ?? null) === 'FECHADA';
      return {
        loja,
        hoje,
        aberto,
        colunas: {
          ABERTA: ps.filter((c) => c.status === 'ABERTA'),
          PARCIAL: ps.filter((c) => c.status === 'PARCIAL'),
          ATENDIDA: atendidas.map(cartao),
          CANCELADA: canceladas.map(cartao),
        } satisfies Record<StatusDaRequisicao, CartaoDaRequisicao[]>,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type QuadroDeRequisicoes = NonNullable<Awaited<ReturnType<typeof quadroDeRequisicoes>>>;

// ================================================================ pedir

export interface OpcaoDeInsumo {
  id: string;
  nome: string;
  unidade: Unidade;
  conservacao: Conservacao;
}

/** O que o formulário de pedido precisa: os insumos ativos (e, para quem vê fichas, as fichas ativas). */
export async function opcoesDoPedido(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'requisicao.pedir');
      const aberto = ((await aberturasDe(tx, [lojaId])).get(lojaId)?.status ?? null) === 'FECHADA';
      const ativos: OpcaoDeInsumo[] = (await tx.insumo.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, unidade: true, conservacao: true } })).map((i) => ({ ...i, unidade: i.unidade as Unidade, conservacao: i.conservacao as Conservacao }));
      const fichas = pode(alcance, 'fichas.ver')
        ? (await tx.fichaTecnica.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, tipo: true, unidadeRendimento: true } })).map((f) => ({ ...f, unidadeRendimento: f.unidadeRendimento as Unidade }))
        : [];
      return { loja, aberto, ativos, fichas };
    }),
  );
  return 'ok' in r ? null : r;
}

export type OpcoesDoPedido = NonNullable<Awaited<ReturnType<typeof opcoesDoPedido>>>;

/**
 * A lista que a ficha pede para produzir `quantidade` (porções do prato, ou
 * kg/L/un do pré-preparo): pela receita, quantidade BRUTA, sem cascata — o
 * pré-preparo da receita vem pronto do estoque, pelo insumo que produz
 * (fazer o pré-preparo é a produção, 3.1). Devolve as linhas do formulário
 * (editáveis antes de pedir) e os avisos.
 */
export async function listaDaFicha(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, fichaId: unknown, quantidadeTexto: unknown) {
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      await lojaDoAlcance(tx, alcance, lojaId, 'requisicao.pedir');
      if (!pode(alcance, 'fichas.ver')) throw new Recusa({ ok: false, erros: { ficha: 'Seu acesso não inclui ver fichas técnicas: peça item a item.' } });
      const id = typeof fichaId === 'string' && ID.test(fichaId) ? fichaId : '';
      const ficha = id
        ? await tx.fichaTecnica.findFirst({
            where: { id, ativa: true },
            select: {
              id: true,
              nome: true,
              tipo: true,
              rendimentoMilesimos: true,
              unidadeRendimento: true,
              itens: { orderBy: { ordem: 'asc' }, select: { insumoId: true, quantidadeMilesimos: true, fatorCorrecaoMilesimos: true, subficha: { select: { nome: true, insumoProduzidoId: true } } } },
            },
          })
        : null;
      if (!ficha) throw new Recusa({ ok: false, erros: { ficha: 'Escolha a ficha técnica.' } });
      const unidade = ficha.unidadeRendimento as Unidade;
      const prato = ficha.tipo === 'PRATO';
      const txt = typeof quantidadeTexto === 'string' ? quantidadeTexto.trim() : '';
      const q = txt ? lerQuantidadeNa(txt, prato ? 'UN' : unidade, 'base') : null;
      if (q === null || q <= 0 || (prato && q % 1000 !== 0) || q > 10_000_000) {
        throw new Recusa({ ok: false, erros: { quantidade: prato ? 'Quantas porções: número inteiro (ex.: 20).' : `Quanto vai produzir: número em ${formatarQuantidade(1000, unidade).replace(/^1 /, '')} (ex.: 2 ou 1,5).` } });
      }
      const r = quantidadesDaFicha(
        ficha,
        ficha.itens.map((i) => ({ insumoId: i.insumoId ?? i.subficha?.insumoProduzidoId ?? null, quantidadeMilesimos: i.quantidadeMilesimos, fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos })),
        q,
      );
      const insumos = await tx.insumo.findMany({ where: { id: { in: r.itens.map((i) => i.insumoId) } }, select: { id: true, nome: true, ativo: true } });
      const porId = new Map(insumos.map((i) => [i.id, i]));
      const avisos: string[] = [];
      if (r.semInsumo) avisos.push(`${r.semInsumo} ${r.semInsumo === 1 ? 'pré-preparo da receita ainda não aparece' : 'pré-preparos da receita ainda não aparecem'} como insumo: salve a ficha dele de novo e peça à parte.`);
      const inativos = r.itens.filter((i) => porId.get(i.insumoId)?.ativo === false).map((i) => porId.get(i.insumoId)!.nome);
      if (inativos.length) avisos.push(`Desativados, ficaram de fora: ${inativos.join(', ')}.`);
      const linhas: LinhaDigitada[] = r.itens
        .filter((i) => porId.get(i.insumoId)?.ativo)
        .sort((a, b) => porId.get(a.insumoId)!.nome.localeCompare(porId.get(b.insumoId)!.nome, 'pt-BR'))
        .map((i) => ({ insumoId: i.insumoId, quantidade: textoDoCampo(i.quantidadeMilesimos), escala: 'base' }));
      return { ok: true as const, id: ficha.id, ficha: { id: ficha.id, nome: ficha.nome, prato, unidade, quantidadeMilesimos: q }, linhas, avisos };
    }),
  );
}

/**
 * Pede: `requisicao.pedir` na loja, estoque aberto, setor da 0.4, itens
 * ativos. Número sequencial da loja sob trava; itens com snapshot; histórico
 * na mesma transação. Nada sai do estoque aqui: a baixa é na entrega.
 */
export async function criarRequisicao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { setor: unknown; paraDia: unknown; observacao: unknown; linhas: readonly LinhaDigitada[]; fichaId?: unknown; fichaQuantidade?: unknown },
  autorNome = 'Sistema',
  agora = new Date(),
): Promise<ResultadoEstoque> {
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'requisicao.pedir');
      if (!loja.ativa) throw new Recusa({ ok: false, erros: { geral: `A ${loja.nome} está desativada.` } });
      await exigirAberto(tx, loja);
      const ids = Array.from(new Set(entrada.linhas.map((l) => l.insumoId).filter((x) => typeof x === 'string' && ID.test(x))));
      const insumos = await tx.insumo.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, unidade: true, ativo: true } });
      const mapa = new Map<string, InsumoParaPedir>(insumos.map((i) => [i.id, { ...i, unidade: i.unidade as Unidade }]));
      const hoje = hojeNoRio(agora);
      const lido = lerPedido({ setor: entrada.setor, paraDia: entrada.paraDia, observacao: entrada.observacao, linhas: entrada.linhas }, mapa, hoje);
      if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });
      const p = lido.pedido;
      // De uma ficha: guarda qual e quanto se ia produzir (a lista já veio editável).
      let ficha: { id: string; nome: string; q: number } | null = null;
      if (typeof entrada.fichaId === 'string' && ID.test(entrada.fichaId)) {
        const f = await tx.fichaTecnica.findFirst({ where: { id: entrada.fichaId }, select: { id: true, nome: true } });
        const q = Number(entrada.fichaQuantidade);
        if (f && Number.isSafeInteger(q) && q > 0) ficha = { id: f.id, nome: f.nome, q };
      }
      await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp:requisicao:${tx.parceiroId}:${lojaId}`}, 0))::text AS "trava"`;
      const [{ proximo }] = await tx.sql<{ proximo: number }>`
        SELECT (coalesce(max("numero"), 0) + 1)::int AS "proximo" FROM "Requisicao" WHERE "parceiroId" = ${tx.parceiroId} AND "lojaId" = ${lojaId}`;
      const req = await tx.requisicao.create({
        data: {
          parceiroId: tx.parceiroId,
          lojaId,
          status: 'ABERTA',
          setor: p.setor,
          observacao: p.observacao,
          solicitadaEm: agora,
          numero: proximo,
          paraDia: new Date(`${p.paraDia}T00:00:00.000Z`),
          pedidaPorNome: autorNome,
          ...(ficha ? { fichaId: ficha.id, fichaNomeSnapshot: ficha.nome, fichaQuantidadeMilesimos: ficha.q } : {}),
        },
        select: { id: true },
      });
      await tx.requisicaoItem.createMany({
        data: p.itens.map((i, ordem) => ({ parceiroId: tx.parceiroId, requisicaoId: req.id, insumoId: i.insumoId, insumoNomeSnapshot: i.nome, unidadeSnapshot: i.unidade, solicitadoMilesimos: i.solicitadoMilesimos, ordem })),
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Requisicao',
          entidadeId: req.id,
          acao: 'PEDIU',
          depois: {
            nome: `Requisição ${numeroDaRequisicao(proximo)} · ${loja.nome}`,
            setor: rotuloDoSetor(p.setor),
            paraQuando: textoDoParaDia(p.paraDia, hoje).replace(/^para /, ''),
            pedido: listaEmTexto(p.itens.map((i) => ({ nome: i.nome, unidade: i.unidade, q: i.solicitadoMilesimos }))),
            ...(ficha ? { ficha: ficha.nome } : {}),
            ...(p.observacao ? { observacao: p.observacao } : {}),
          },
          autorNome,
        },
      });
      return { ok: true as const, id: req.id };
    }),
  );
}

// ================================================================ detalhe

export interface ItemDoDetalhe {
  id: string;
  insumoId: string;
  nome: string;
  unidade: Unidade;
  solicitadoMilesimos: number;
  atendidoMilesimos: number;
  devolvidoMilesimos: number;
  faltaMilesimos: number;
  /** Saldo do livro de agora na loja (pode ser negativo: alarme). */
  saldoMilesimos: number;
  porUnidade: Fracao | null;
}

/** A requisição com os itens, o saldo de agora de cada insumo, o que saiu do livro e o histórico. */
export async function obterRequisicao(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, id: string, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaComAlguma(tx, alcance, lojaId, VER);
      if (!ID.test(id)) throw new Recusa({ ok: false, erros: { geral: NAO_ENCONTRADA }, naoEncontrado: true });
      const req = await tx.requisicao.findFirst({
        where: { id, lojaId },
        select: {
          id: true,
          numero: true,
          status: true,
          versao: true,
          setor: true,
          paraDia: true,
          observacao: true,
          solicitadaEm: true,
          atendidaEm: true,
          canceladaEm: true,
          pedidaPorNome: true,
          atendidaPorNome: true,
          canceladaPorNome: true,
          motivoCancelamento: true,
          fichaId: true,
          fichaNomeSnapshot: true,
          fichaQuantidadeMilesimos: true,
          itens: { orderBy: { ordem: 'asc' }, select: SELECAO_DO_ITEM },
        },
      });
      if (!req) throw new Recusa({ ok: false, erros: { geral: NAO_ENCONTRADA }, naoEncontrado: true });
      const insumoIds = req.itens.map((i) => i.insumoId);
      const [saldos, custos, movs, aberturas] = await Promise.all([
        tx.saldoEstoque.findMany({ where: { lojaId, insumoId: { in: insumoIds } }, select: { insumoId: true, quantidadeMilesimos: true } }),
        custosDeReferencia(tx, insumoIds),
        tx.movimentoEstoque.findMany({ where: { requisicaoItemId: { in: req.itens.map((i) => i.id) } }, orderBy: [{ ocorridoEm: 'asc' }, { criadoEm: 'asc' }, { id: 'asc' }], select: SELECAO_DO_MOVIMENTO }),
        aberturasDe(tx, [lojaId]),
      ]);
      const saldoDe = new Map(saldos.map((s) => [s.insumoId, s.quantidadeMilesimos]));
      const itens: ItemDoDetalhe[] = req.itens.map((i) => ({
        id: i.id,
        insumoId: i.insumoId,
        nome: i.insumoNomeSnapshot,
        unidade: i.unidadeSnapshot as Unidade,
        solicitadoMilesimos: i.solicitadoMilesimos,
        atendidoMilesimos: i.atendidoMilesimos ?? 0,
        devolvidoMilesimos: i.devolvidoMilesimos,
        faltaMilesimos: faltaDe({ solicitadoMilesimos: i.solicitadoMilesimos, atendidoMilesimos: i.atendidoMilesimos ?? 0 }),
        saldoMilesimos: saldoDe.get(i.insumoId) ?? 0,
        porUnidade: custos.get(i.insumoId)?.porUnidade ?? null,
      }));
      const status = req.status as StatusDaRequisicao;
      const hoje = hojeNoRio(agora);
      const paraDia = iso(req.paraDia);
      const historico = await listarHistorico(tx, { de: [{ entidade: 'Requisicao', ids: [req.id] }], limite: 20 });
      const movimentos: MovimentoDaTela[] = movs.map(movimentoParaTela);
      return {
        loja,
        hoje,
        aberto: aberturas.get(lojaId)?.status === 'FECHADA',
        requisicao: { ...req, status, paraDia, itens: undefined },
        itens,
        atrasoDias: diasDeAtraso({ status, paraDia }, hoje),
        movimentos,
        historico,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type RequisicaoDaLoja = NonNullable<Awaited<ReturnType<typeof obterRequisicao>>>;

// ================================================================ entregar (atender)

/**
 * Entrega: `requisicao.atender`, estoque aberto (abertura travada), versão
 * lida. Uma baixa `REQUISICAO` (−) por item que sai, valor pelo custo de
 * referência de agora; saldo abaixo de zero só com a confirmação de quem
 * entrega (o produto está aí, o livro é que está errado: o negativo vira
 * alarme). Tudo saiu, ou "encerrar o resto" = Atendida; senão Atendida em
 * parte. Entregar de novo a mesma tela: "já atendida" ou o conflito — nunca
 * baixa dupla.
 */
export async function atenderRequisicao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  id: string,
  entrada: { versao: unknown; linhas: readonly { itemId: string; quantidade: string; escala: string }[]; encerrar: unknown; confirmarNegativo: unknown },
  autorNome = 'Sistema',
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const versaoLida = Number(entrada.versao);
  const encerrar = ehSim(entrada.encerrar);
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'requisicao.atender');
        await exigirAberto(tx, loja, true);
        const r = await travarRequisicao(tx, lojaId, id);
        if (r.status === 'CANCELADA') throw new Recusa({ ok: false, erros: { geral: 'Esta requisição foi cancelada: nada sai por ela.' }, conflito: true });
        // A mesma entrega de novo (clique duplo, outra aba, rede que caiu depois de gravar): a que valeu fica.
        if (r.status === 'ATENDIDA') return { ok: true as const, id: r.id, jaFeito: true };
        if (!Number.isSafeInteger(versaoLida) || versaoLida !== r.versao) {
          throw new Recusa({ ok: false, erros: { geral: 'Alguém entregou ou mudou esta requisição agora há pouco. Confira de novo o que falta; nada saiu do estoque.' }, conflito: true });
        }
        const itens = (await tx.requisicaoItem.findMany({ where: { requisicaoId: r.id }, orderBy: { ordem: 'asc' }, select: SELECAO_DO_ITEM })).map(paraEntregar);
        const lido = lerEntrega(entrada.linhas, itens, encerrar);
        if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });
        const entregas = lido.entregas;
        const insumoIds = itens.map((i) => i.insumoId);
        const saldos = await tx.saldoEstoque.findMany({ where: { lojaId, insumoId: { in: insumoIds } }, select: { insumoId: true, quantidadeMilesimos: true } });
        const negativos = negativosDaEntrega(itens, entregas, new Map(saldos.map((s) => [s.insumoId, s.quantidadeMilesimos])));
        if (negativos.length && !ehSim(entrada.confirmarNegativo)) {
          throw new Recusa({
            ok: false,
            erros: {
              confirmarNegativo: `Fica abaixo de zero no livro — ${negativos.map(fraseDoNegativo).join('; ')}. Se o produto está aí e você está entregando mesmo assim, confirme: o saldo negativo vira alarme nas divergências.`,
            },
          });
        }
        const custos = await custosDeReferencia(tx, insumoIds);
        const baixas = baixasDaEntrega(
          { id: r.id, lojaId, numero: r.numero, setor: r.setor, versao: r.versao },
          itens,
          entregas,
          new Map(Array.from(custos).map(([k, v]) => [k, v.porUnidade])),
        );
        await gravarMovimentos(tx, baixas, { ocorridoEm: agora });
        for (const e of entregas) {
          await tx.requisicaoItem.updateMany({ where: { id: e.itemId, requisicaoId: r.id }, data: { atendidoMilesimos: (itens.find((i) => i.id === e.itemId)!.atendidoMilesimos ?? 0) + e.quantidadeMilesimos } });
        }
        const status = estadoDepoisDaEntrega(itens, entregas, encerrar);
        const mudou = await tx.requisicao.updateMany({
          where: { id: r.id, versao: r.versao },
          data: { status, versao: { increment: 1 }, atendidaPorNome: autorNome, ...(status === 'ATENDIDA' ? { atendidaEm: agora } : {}) },
        });
        if (mudou.count !== 1) throw new Error('[erp] requisição mudou no meio da entrega.');
        const porId = new Map(itens.map((i) => [i.id, i]));
        const mais = new Map(entregas.map((e) => [e.itemId, e.quantidadeMilesimos]));
        const corte = encerrar ? itens.map((i) => ({ i, f: faltaDe({ ...i, atendidoMilesimos: i.atendidoMilesimos + (mais.get(i.id) ?? 0) }) })).filter((x) => x.f > 0) : [];
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'Requisicao',
            entidadeId: r.id,
            acao: 'ATENDEU',
            antes: { nome: `Requisição ${numeroDaRequisicao(r.numero)} · ${loja.nome}`, situacao: ROTULO_DA_REQUISICAO[r.status] },
            depois: {
              nome: `Requisição ${numeroDaRequisicao(r.numero)} · ${loja.nome}`,
              situacao: ROTULO_DA_REQUISICAO[status],
              ...(entregas.length ? { saiu: listaEmTexto(entregas.map((e) => ({ nome: porId.get(e.itemId)!.nome, unidade: porId.get(e.itemId)!.unidade, q: e.quantidadeMilesimos }))) } : {}),
              ...(corte.length ? { corte: listaEmTexto(corte.map((x) => ({ nome: x.i.nome, unidade: x.i.unidade, q: x.f }))) } : {}),
              ...(negativos.length ? { negativo: negativos.map(fraseDoNegativo).join('; ') } : {}),
            },
            motivo: encerrar && corte.length ? 'O resto foi encerrado: não vai sair por esta requisição.' : null,
            autorNome,
          },
        });
        return { ok: true as const, id: r.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}

// ================================================================ devolver

/**
 * Devolução de parte (ou tudo) de um item: `requisicao.atender` (quem recebe
 * de volta é o estoque). Estorna as baixas ativas do item (espelho exato) e
 * baixa o líquido que ficou — o livro nunca muda uma linha. Versão lida.
 */
export async function devolverItem(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  id: string,
  entrada: { versao: unknown; itemId: unknown; quantidade: unknown; escala: unknown; motivo: unknown },
  autorNome = 'Sistema',
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const versaoLida = Number(entrada.versao);
  const itemId = typeof entrada.itemId === 'string' && ID.test(entrada.itemId) ? entrada.itemId : '';
  const motivo = motivoLimpo(entrada.motivo);
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'requisicao.atender');
        await exigirAberto(tx, loja, true);
        const r = await travarRequisicao(tx, lojaId, id);
        if (r.status === 'CANCELADA' || r.status === 'ABERTA') throw new Recusa({ ok: false, erros: { geral: 'Nada saiu por esta requisição: não há o que devolver.' }, conflito: true });
        if (!Number.isSafeInteger(versaoLida) || versaoLida !== r.versao) {
          throw new Recusa({ ok: false, erros: { geral: 'Alguém mexeu nesta requisição agora há pouco. Confira de novo; nada voltou para o estoque.' }, conflito: true });
        }
        const item = itemId ? await tx.requisicaoItem.findFirst({ where: { id: itemId, requisicaoId: r.id }, select: SELECAO_DO_ITEM }) : null;
        if (!item) throw new Recusa({ ok: false, erros: { devolver: 'Escolha o insumo que voltou.' } });
        const unidade = item.unidadeSnapshot as Unidade;
        const txt = typeof entrada.quantidade === 'string' ? entrada.quantidade.trim() : '';
        const q = txt ? lerQuantidadeNa(txt, unidade, entrada.escala === 'menor' && unidade !== 'UN' ? 'menor' : 'base') : null;
        if (q === null || q <= 0) throw new Recusa({ ok: false, erros: { devolver: `Quanto voltou de “${item.insumoNomeSnapshot}”: número maior que zero.` } });
        const ativos = await tx.movimentoEstoque.findMany({
          where: { requisicaoItemId: item.id, tipo: 'REQUISICAO', estornoDeId: null, estorno: { is: null } },
          orderBy: { ocorridoEm: 'asc' },
          select: { id: true, lojaId: true, insumoId: true, quantidadeMilesimos: true, valorCentavos: true, insumoNomeSnapshot: true, unidadeSnapshot: true, requisicaoItemId: true, motivo: true },
        });
        const dev = movimentosDaDevolucao(
          ativos.map((m) => ({ ...m, unidadeSnapshot: m.unidadeSnapshot as Unidade, requisicaoItemId: m.requisicaoItemId! })),
          q,
          { motivo: `Devolução · Requisição ${numeroDaRequisicao(r.numero)}${motivo ? ` · ${motivo}` : ''}`, chave: `devolucao:${item.id}:${r.versao}` },
        );
        if (!dev.ok) throw new Recusa({ ok: false, erros: { devolver: dev.erro } });
        await gravarMovimentos(tx, dev.movimentos, { ocorridoEm: agora });
        await tx.requisicaoItem.updateMany({ where: { id: item.id }, data: { atendidoMilesimos: dev.liquidoMilesimos, devolvidoMilesimos: item.devolvidoMilesimos + q } });
        await tx.requisicao.updateMany({ where: { id: r.id, versao: r.versao }, data: { versao: { increment: 1 } } });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'Requisicao',
            entidadeId: r.id,
            acao: 'DEVOLVEU',
            antes: { nome: `Requisição ${numeroDaRequisicao(r.numero)} · ${loja.nome}`, saiu: `${item.insumoNomeSnapshot} ${formatarQuantidade(item.atendidoMilesimos ?? 0, unidade)}` },
            depois: { nome: `Requisição ${numeroDaRequisicao(r.numero)} · ${loja.nome}`, saiu: `${item.insumoNomeSnapshot} ${formatarQuantidade(dev.liquidoMilesimos, unidade)}`, voltou: `${item.insumoNomeSnapshot} ${formatarQuantidade(q, unidade)}` },
            motivo,
            autorNome,
          },
        });
        return { ok: true as const, id: r.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}

// ================================================================ cancelar

/** Cancela a requisição PEDIDA (nada saiu): quem pede ou quem atende, com motivo. Cancelar de novo = já feito. */
export async function cancelarRequisicao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  id: string,
  entrada: { motivo: unknown },
  autorNome = 'Sistema',
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const motivo = motivoLimpo(entrada.motivo);
  if (!motivo || motivo.length < 3) return { ok: false, erros: { motivo: 'Diga por que a requisição sai (ex.: pedimos em dobro).' } };
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaComAlguma(tx, alcance, lojaId, VER);
      const r = await travarRequisicao(tx, lojaId, id);
      if (r.status === 'CANCELADA') return { ok: true as const, id: r.id, jaFeito: true };
      if (r.status !== 'ABERTA') throw new Recusa({ ok: false, erros: { geral: 'Já saiu estoque por esta requisição: não se cancela. Receba de volta o que voltou e encerre o resto.' }, conflito: true });
      await tx.requisicao.updateMany({ where: { id: r.id, status: 'ABERTA' }, data: { status: 'CANCELADA', canceladaEm: agora, canceladaPorNome: autorNome, motivoCancelamento: motivo, versao: { increment: 1 } } });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Requisicao',
          entidadeId: r.id,
          acao: 'CANCELOU',
          antes: { nome: `Requisição ${numeroDaRequisicao(r.numero)} · ${loja.nome}`, situacao: ROTULO_DA_REQUISICAO.ABERTA },
          depois: { nome: `Requisição ${numeroDaRequisicao(r.numero)} · ${loja.nome}`, situacao: ROTULO_DA_REQUISICAO.CANCELADA },
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, id: r.id };
    }),
  );
}

// ================================================================ divergências (requisição × contagem)

const TIPOS_DE_FLUXO: TipoDeMovimento[] = ['ENTRADA_COMPRA', 'PRODUCAO_ENTRADA', 'REQUISICAO', 'PRODUCAO_CONSUMO', 'PERDA', 'AJUSTE'];

/** Até quantos dias numa janela de divergências. */
export const JANELA_MAXIMA_DIAS = 366;

/**
 * O cruzamento da loja numa janela (padrão: o período de apuração de agora):
 * por insumo, os trechos entre duas contagens APLICADAS que terminam na
 * janela — consumo apurado (inicial + entradas − final), requisitado, outras
 * saídas lançadas e o sumiço (sem requisição), em quantidade e em R$ (custo de
 * referência de hoje); os sumiços pequenos repetidos dentro da tolerância; por
 * setor; os saldos negativos de agora. Só leitura: nada é gravado.
 */
export async function divergenciasDaLoja(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, filtro: { de?: unknown; ate?: unknown }, cfg: ConfigDoPeriodo, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'estoque.ajustar');
        const a = (await aberturasDe(tx, [lojaId])).get(lojaId);
        if (!a || a.status !== 'FECHADA') return { loja, aberto: false as const };
        const hoje = hojeNoRio(agora);
        const { periodo } = await periodoDe(tx, cfg, hoje);
        // dd/mm/aaaa (o campo da tela) ou aaaa-mm-dd; inválida = a do período de agora.
        const data = (x: unknown) => (typeof x === 'string' ? lerData(x) : null);
        let de = data(filtro.de) ?? periodo.inicio;
        let ate = data(filtro.ate) ?? periodo.fim;
        let aviso: string | null = null;
        if (de > ate) [de, ate] = [ate, de];
        if (diasEntre(de, ate) > JANELA_MAXIMA_DIAS) {
          de = somarDias(ate, -JANELA_MAXIMA_DIAS);
          aviso = `Janela de até ${JANELA_MAXIMA_DIAS} dias: começou em ${de.split('-').reverse().join('/')}.`;
        }
        const janela = { de: inicioDoDia(de), ate: inicioDoDia(somarDias(ate, 1)) };
        const regras = regrasDaLoja((await tx.loja.findUnique({ where: { id: lojaId }, select: { contagemPisoValorBp: true, contagemPisoItensBp: true, contagemFreqADias: true, contagemFreqBDias: true, contagemFreqCDias: true, contagemToleranciaCentavos: true } }))!);
        // Contagens aplicadas que contaram o insumo: a abertura vale da conclusão; as outras, de quando foi contado.
        const marcos = await tx.sql<{ insumoId: string; instante: Date; contado: number }>`
          SELECT ci."insumoId", (CASE WHEN c."tipo" = 'ABERTURA' THEN c."fechadaEm" ELSE ci."contadoEm" END) AS "instante", ci."contadoMilesimos" AS "contado"
          FROM "ContagemItem" ci
          JOIN "Contagem" c ON c."parceiroId" = ci."parceiroId" AND c."id" = ci."contagemId"
          WHERE ci."parceiroId" = ${tx.parceiroId} AND c."lojaId" = ${lojaId}
            AND c."status" = 'FECHADA' AND c."desfecho" IN ('APLICADA', 'APLICADA_SOZINHA')
            AND ci."contadoMilesimos" IS NOT NULL
            AND (CASE WHEN c."tipo" = 'ABERTURA' THEN c."fechadaEm" ELSE ci."contadoEm" END) < ${janela.ate.toISOString()}::timestamp
          ORDER BY 2`;
        const porInsumo = new Map<string, Marco[]>();
        for (const m of marcos) porInsumo.set(m.insumoId, [...(porInsumo.get(m.insumoId) ?? []), { instante: m.instante, contadoMilesimos: m.contado }]);
        // Só quem tem um trecho que TERMINA na janela (um marco na janela e um antes dele).
        const comTrecho = Array.from(porInsumo).filter(([, ms]) => ms.length >= 2 && ms.slice(1).some((m) => m.instante.getTime() >= janela.de.getTime()));
        const ids = comTrecho.map(([id]) => id);
        const desde = comTrecho.length ? new Date(Math.min(...comTrecho.map(([, ms]) => ms[0].instante.getTime()))) : janela.de;
        const fluxos = ids.length
          ? await tx.sql<{ insumoId: string; tipo: TipoDeMovimento; quantidade: number; ocorridoEm: Date; setor: string | null }>`
              SELECT m."insumoId", m."tipo"::text AS "tipo", m."quantidadeMilesimos" AS "quantidade", m."ocorridoEm", r."setor"
              FROM "MovimentoEstoque" m
              LEFT JOIN "RequisicaoItem" ri ON ri."parceiroId" = m."parceiroId" AND ri."id" = m."requisicaoItemId"
              LEFT JOIN "Requisicao" r ON r."parceiroId" = ri."parceiroId" AND r."id" = ri."requisicaoId"
              WHERE m."parceiroId" = ${tx.parceiroId} AND m."lojaId" = ${lojaId} AND m."insumoId" = ANY(${ids}::text[])
                AND m."tipo"::text = ANY(${TIPOS_DE_FLUXO}::text[])
                AND m."ocorridoEm" > ${desde.toISOString()}::timestamp AND m."ocorridoEm" < ${janela.ate.toISOString()}::timestamp`
          : [];
        const fluxosDe = new Map<string, Fluxo[]>();
        for (const f of fluxos) fluxosDe.set(f.insumoId, [...(fluxosDe.get(f.insumoId) ?? []), { tipo: f.tipo, quantidadeMilesimos: f.quantidade, ocorridoEm: f.ocorridoEm, setor: f.setor }]);
        // Requisitado na janela de quem NÃO tem trecho para cruzar (não dá para julgar: falta contagem).
        const semContagem = await tx.sql<{ insumoId: string; nome: string; unidade: Unidade; quantidade: number }>`
          SELECT m."insumoId", i."nome", i."unidade"::text AS "unidade", (-sum(m."quantidadeMilesimos"))::int AS "quantidade"
          FROM "MovimentoEstoque" m JOIN "Insumo" i ON i."parceiroId" = m."parceiroId" AND i."id" = m."insumoId"
          WHERE m."parceiroId" = ${tx.parceiroId} AND m."lojaId" = ${lojaId} AND m."tipo" = 'REQUISICAO'
            AND m."ocorridoEm" >= ${janela.de.toISOString()}::timestamp AND m."ocorridoEm" < ${janela.ate.toISOString()}::timestamp
            AND NOT (m."insumoId" = ANY(${ids}::text[]))
          GROUP BY m."insumoId", i."nome", i."unidade"
          HAVING sum(m."quantidadeMilesimos") < 0
          ORDER BY i."nome"`;
        const [insumos, custos, negativos] = await Promise.all([
          tx.insumo.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, unidade: true } }),
          custosDeReferencia(tx, ids),
          tx.saldoEstoque.findMany({ where: { lojaId, quantidadeMilesimos: { lt: 0 } }, select: { insumoId: true, quantidadeMilesimos: true, insumo: { select: { nome: true, unidade: true } } } }),
        ]);
        const nomeDe = new Map(insumos.map((i) => [i.id, i]));
        const porUnidade = new Map(ids.map((id) => [id, custos.get(id)?.porUnidade ?? null]));
        const linhas: DivergenciaDoInsumo[] = divergenciasDoPeriodo(
          comTrecho.map(([id, ms]) => ({ insumoId: id, nome: nomeDe.get(id)?.nome ?? '?', unidade: (nomeDe.get(id)?.unidade ?? 'UN') as Unidade, marcos: ms, fluxos: fluxosDe.get(id) ?? [], porUnidade: porUnidade.get(id) ?? null })),
          janela,
          regras.toleranciaCentavos,
        );
        const custoNeg = await custosDeReferencia(
          tx,
          negativos.map((n) => n.insumoId),
        );
        return {
          loja,
          aberto: true as const,
          hoje,
          janela: { de, ate },
          periodo,
          aviso,
          toleranciaCentavos: regras.toleranciaCentavos,
          linhas,
          resumo: resumoDasDivergencias(linhas),
          setores: porSetor(linhas, porUnidade),
          semContagem: semContagem.map((s) => ({ ...s, unidade: s.unidade as Unidade })),
          negativos: negativos
            .map((n) => ({ insumoId: n.insumoId, nome: n.insumo.nome, unidade: n.insumo.unidade as Unidade, quantidadeMilesimos: n.quantidadeMilesimos, valorCentavos: valorDaQuantidade(custoNeg.get(n.insumoId)?.porUnidade ?? null, n.quantidadeMilesimos) }))
            .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')),
        };
      },
      { timeout: 20_000 },
    ),
  );
  return 'ok' in r ? null : r;
}

export type DivergenciasDaLoja = NonNullable<Awaited<ReturnType<typeof divergenciasDaLoja>>>;
