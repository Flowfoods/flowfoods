/**
 * A lista do dia (3.2) — com banco. O gerente diz o que a LOJA vai produzir num DIA ("Molho cheddar 5 kg, Base de cebola
 * 2 kg"); a tela cruza com o estoque da loja (vai usar / tem / comprar, com a cascata dos pré-preparos, a conta em
 * `producao-lista-campos.ts`) e cada linha vira um lote pela regra da 3.1 (`planejarProducaoNaTx`): a requisição do lote é
 * que baixa os insumos, então a lista nunca mexe no estoque e não há segunda baixa.
 *
 * Permissões (sempre com a LOJA; fora do alcance = não encontrado): ver = `producao.ver` (a cozinha vê a lista); montar,
 * mudar e transformar em lotes = `producao.planejar` (o gerente; decisão 219). O custo estimado da compra só sai do servidor
 * para quem tem `insumos.ver` E `compras.ver` na loja (`veCustosDaProducao`, decisões 226 e 460): a cozinha lê só quantidades. O
 * orçamento de compra (2.5) só para quem vê ou lança nota na loja, pela vista dele (`orcamentoNaNota`: quem não vê o DRE
 * recebe o limite seguro, nunca a receita — decisões 210, 213 e 217). Quem não recebe o custo não leva o valor nem para a
 * conta do orçamento (ela parte de zero).
 *
 * Concorrência (decisões 222 e 223):
 * - uma lista por loja e dia (índice único); criar = `createMany` com `skipDuplicates` e depois ler `FOR UPDATE`: dois cliques
 *   ou duas abas caem na mesma lista;
 * - toda escrita lê a lista `FOR UPDATE` e confere a versão lida; o MESMO conteúdo que já está gravado volta "já feito"
 *   (duplo clique, rede que voltou); conteúdo diferente com versão velha é conflito, com a frase;
 * - ordem das travas: período (compartilhada) → a lista (FOR UPDATE) → a do dia do lote e a da requisição da loja (as da 3.1,
 *   dentro de `planejarProducaoNaTx`). Nenhum caminho trava a lista depois de travar requisição ou ordem;
 * - a linha que virou lote não muda nem sai da lista (regra aqui, gatilho `ListaProducaoItem_lote_confere` no banco): para
 *   tirar, cancela-se o lote; aí a linha volta a ser só "na lista" e pode virar outro lote. Cancelar ou estornar o lote
 *   (3.1) trava a lista antes do lote e sobe a versão dela; e o formulário manda as linhas em aberto que mostrou: salvar não
 *   apaga e gerar não gera a linha que a pessoa não viu (decisão 228);
 * - a lista apagada (sem linhas) fica no banco: a versão por loja e dia nunca recomeça (decisão 229).
 *
 * 3.3 (decisão 232): a cozinha (`producao.registrar`) PEGA uma linha de HOJE que ainda não virou lote: a linha vira o lote
 * dela pela mesma regra do "Gerar" (`planejarProducaoNaTx`) e o lote já sai com quem pegou (`pegarNaTx`, `producao.ts`), numa
 * transação, travando período → lista → as da 3.1. Nada sai do estoque aqui.
 */

import type { ClienteDoParceiro } from './tenant';
import { pode, type Alcance } from './permissoes';
import { hojeNoRio } from './compra-campos';
import { listarHistorico } from './historico';
import { aberturasDe, comRecusa, custosDeReferencia, lojaDoAlcance, Recusa, type ResultadoEstoque } from './estoque';
import { exigirAberto } from './requisicao';
import { NIVEL1_NAO_PEGA, pegarNaTx, planejarProducaoNaTx, veCustosDaProducao, type Autor } from './producao';
import { datasEmPeriodoFechado, fraseDoPeriodoFechado, travarParaEscrever } from './periodo-trava';
import { PROFUNDIDADE_MAXIMA } from './ficha-cascata';
import { faltaDe, textoDoCampo } from './requisicao-campos';
import { foiEstornado, type StatusDaProducao } from './producao-campos';
import { orcamentoNaNota, type OrcamentoNaNota } from './orcamento';
import { centavosDaFracao, formatarQuantidade, UNIDADES, type Unidade } from './unidades';
import {
  contaDaLista,
  custoDaCompra,
  diaDaLista,
  estadoDaLinha,
  fraseSemSaldo,
  lerLinhasDaLista,
  motivoDoDia,
  nomeDaLista,
  rotuloDoDia,
  TETO_DA_LINHA,
  TETO_DE_LINHAS,
  textoDaProducao,
  textoDosLotes,
  type ContaDaLista,
  type CustoDaCompra,
  type EstadoDaLinha,
  type FichaDaConta,
  type FichaEscolhivel,
  type InsumoDaConta,
  type ProducaoDoDia,
  type SaldoDaLoja,
} from './producao-lista-campos';

const ID = /^[a-z0-9]{1,64}$/i;
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const dataDe = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const MUDOU = 'Alguém mudou esta lista agora há pouco. Confira a lista de novo; nada foi gravado.';
const APAGADA = 'A lista deste dia foi apagada por outra pessoa agora há pouco. Confira de novo; nada foi gravado.';

// ================================================================ apoio

/** O dia de uma escrita: aaaa-mm-dd de verdade (a tela manda o dia que mostrou), de hoje a 14 dias. */
function diaDaEscrita(texto: unknown, hoje: string): string {
  const t = typeof texto === 'string' ? texto.trim() : '';
  if (!DIA_ISO.test(t) || diaDaLista(t, hoje) !== t) throw new Recusa({ ok: false, erros: { geral: 'Dia inválido: abra a lista de novo pelo menu.' } });
  const motivo = motivoDoDia(t, hoje);
  if (motivo) throw new Recusa({ ok: false, erros: { geral: motivo } });
  return t;
}

/**
 * O dia da lista em período FECHADO do DRE não recebe escrita (a mesma trava compartilhada das escritas que caem num
 * período: quem fecha espera, e quem chega depois do fechamento é recusado com a frase de sempre).
 */
async function conferirDiaAberto(tx: ClienteDoParceiro, dia: string) {
  await travarParaEscrever(tx);
  const fechado = (await datasEmPeriodoFechado(tx, [dia])).get(dia);
  if (fechado) throw new Recusa({ ok: false, erros: { geral: fraseDoPeriodoFechado(fechado) }, conflito: true });
}

/** A lista da loja no dia, travada (FOR UPDATE), ou null. */
async function travarLista(tx: ClienteDoParceiro, lojaId: string, dia: string): Promise<{ id: string; versao: number } | null> {
  const [l] = await tx.sql<{ id: string; versao: number }>`
    SELECT "id", "versao" FROM "ListaProducao"
    WHERE "parceiroId" = ${tx.parceiroId} AND "lojaId" = ${lojaId} AND "dia" = ${dia}::date
    FOR UPDATE`;
  return l ?? null;
}

interface ItemGravado {
  id: string;
  fichaId: string;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  ordem: number;
  ordemProducaoId: string | null;
  estado: EstadoDaLinha;
  codigoLote: string | null;
}

async function itensDaLista(tx: ClienteDoParceiro, listaId: string): Promise<ItemGravado[]> {
  const itens = await tx.listaProducaoItem.findMany({
    where: { listaId },
    orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }, { id: 'asc' }],
    select: { id: true, fichaId: true, fichaNomeSnapshot: true, unidadeSnapshot: true, quantidadeMilesimos: true, ordem: true, ordemProducaoId: true, ordemProducao: { select: { status: true, codigoLote: true } } },
  });
  return itens.map((i) => ({
    id: i.id,
    fichaId: i.fichaId,
    nome: i.fichaNomeSnapshot,
    unidade: i.unidadeSnapshot as Unidade,
    quantidadeMilesimos: i.quantidadeMilesimos,
    ordem: i.ordem,
    ordemProducaoId: i.ordemProducaoId,
    estado: estadoDaLinha(i.ordemProducao ? { status: i.ordemProducao.status as StatusDaProducao } : null),
    codigoLote: i.ordemProducao?.codigoLote ?? null,
  }));
}

/** As linhas em aberto que a tela mostrou ("id1,id2"; vazio = nenhuma). Ausente = quem chama não diz (uso por código). */
function idsVistos(texto: unknown): Set<string> | null {
  if (typeof texto !== 'string') return null;
  return new Set(texto.split(',').map((x) => x.trim()).filter((x) => ID.test(x)));
}

/** A linha em aberto que a pessoa não viu: a que voltou do lote cancelado, ou a que outra aba pôs. */
function fraseDaLinhaQueVoltou(i: ItemGravado): string {
  return i.codigoLote
    ? `${i.nome} voltou para a lista agora há pouco (o lote ${i.codigoLote} foi cancelado). Confira a lista de novo; nada foi gravado.`
    : MUDOU;
}

/** O que se pode pôr na lista: pré-preparo ativo que vira insumo do estoque (o mesmo que "Nova produção" oferece). */
async function fichasEscolhiveis(tx: ClienteDoParceiro): Promise<Map<string, FichaEscolhivel>> {
  const fichas = await tx.fichaTecnica.findMany({ where: { tipo: 'PRE_PREPARO', ativa: true, insumoProduzidoId: { not: null } }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, unidadeRendimento: true } });
  return new Map(fichas.map((f) => [f.id, { id: f.id, nome: f.nome, unidade: f.unidadeRendimento as Unidade }]));
}

/** O mesmo conteúdo (pré-preparo e quantidade), sem olhar a ordem: o duplo clique e a outra aba que salvou igual. */
function mesmoConteudo(a: readonly { fichaId: string; quantidadeMilesimos: number }[], b: readonly { fichaId: string; quantidadeMilesimos: number }[]) {
  if (a.length !== b.length) return false;
  const chave = (x: { fichaId: string; quantidadeMilesimos: number }) => `${x.fichaId}:${x.quantidadeMilesimos}`;
  const sa = a.map(chave).sort();
  const sb = b.map(chave).sort();
  return sa.every((x, i) => x === sb[i]);
}

/** Cria a lista do dia se ainda não existe (duas transações juntas criam uma só) e a devolve travada. */
async function criarOuTravar(tx: ClienteDoParceiro, lojaId: string, dia: string, autor: Autor, agora: Date) {
  await tx.listaProducao.createMany({
    data: [{ parceiroId: tx.parceiroId, lojaId, dia: dataDe(dia), criadaPorNome: autor.nome, atualizadaPorNome: autor.nome, criadaEm: agora, atualizadaEm: agora }],
    skipDuplicates: true,
  });
  return (await travarLista(tx, lojaId, dia))!;
}

// ================================================================ lojas (entrada da aba)

/** Lojas do alcance onde a pessoa vê a produção, com a lista de HOJE: quantos pré-preparos e quantos ainda sem lote. */
export async function lojasDaListaDoDia(cliente: ClienteDoParceiro, alcance: Alcance, agora = new Date()) {
  return cliente.transacao(async (tx) => {
    const lojas = (await tx.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } })).filter((l) => pode(alcance, 'producao.ver', { lojaId: l.id }));
    if (lojas.length === 0) return [];
    const hoje = hojeNoRio(agora);
    const listas = await tx.listaProducao.findMany({
      where: { lojaId: { in: lojas.map((l) => l.id) }, dia: dataDe(hoje) },
      select: { lojaId: true, itens: { select: { ordemProducao: { select: { status: true } } } } },
    });
    return lojas.map((l) => {
      const itens = listas.find((x) => x.lojaId === l.id)?.itens ?? [];
      return { ...l, naLista: itens.length, semLote: itens.filter((i) => estadoDaLinha(i.ordemProducao ? { status: i.ordemProducao.status as StatusDaProducao } : null) === 'NA_LISTA').length };
    });
  });
}

// ================================================================ a tela

export interface LinhaDaLista {
  id: string;
  fichaId: string;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  estado: EstadoDaLinha;
  /** O lote da linha: o vivo (planejado, em produção, concluído) ou o último cancelado (a linha voltou para a lista). */
  lote: { id: string; codigo: string; status: StatusDaProducao; estornado: boolean; responsavel: { nome: string; desde: Date } | null } | null;
  /** O que tem do pré-preparo no estoque agora (null sem saldo apurado). */
  emEstoqueMilesimos: number | null;
  /** A ficha ainda vira lote (pré-preparo ativo que vira insumo, na mesma unidade da linha). */
  fichaDisponivel: boolean;
}

export interface LoteForaDaLista {
  id: string;
  codigo: string;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  status: StatusDaProducao;
}

export type EstadoDoEstoqueDaLista = 'ABERTO' | 'NAO_ABERTO' | 'EM_CONTAGEM';

/**
 * A lista do dia da loja, pronta para a tela: as linhas (com o lote de cada uma), os lotes do dia planejados fora da lista,
 * a conta (vai usar / tem / comprar e os pré-preparos), o custo estimado (só quem vê custos), o orçamento de compra (só quem
 * vê ou lança nota, pela vista dele), o que se pode fazer e o histórico. `diaTexto` = `?dia=aaaa-mm-dd` (outro = hoje).
 * Null = a pessoa não vê a produção desta loja (ou a loja não existe para ela).
 */
export async function obterListaDoDia(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, diaTexto: unknown, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.ver');
        const hoje = hojeNoRio(agora);
        const dia = diaDaLista(diaTexto, hoje);
        const podePlanejar = pode(alcance, 'producao.planejar', { lojaId });
        // O custo estimado (R$): a régua única da produção — vê custos E vê compras na loja (decisões 226 e 460). A cozinha,
        // mesmo com "ver insumos e custos", lê só as quantidades: o servidor monta sem o valor.
        const verCustos = veCustosDaProducao(alcance, lojaId);
        const abertura = (await aberturasDe(tx, [lojaId])).get(lojaId);
        const estoque: EstadoDoEstoqueDaLista = !abertura ? 'NAO_ABERTO' : abertura.status === 'FECHADA' && abertura.fechadaEm ? 'ABERTO' : 'EM_CONTAGEM';
        const periodoFechado = (await datasEmPeriodoFechado(tx, [dia])).get(dia) ?? null;

        const lista = await tx.listaProducao.findFirst({ where: { lojaId, dia: dataDe(dia) }, select: { id: true, versao: true, criadaPorNome: true, criadaEm: true, atualizadaEm: true, atualizadaPorNome: true } });
        const itens = lista ? await itensDaLista(tx, lista.id) : [];
        const ordensIds = itens.map((i) => i.ordemProducaoId).filter((x): x is string => !!x);
        const selecaoDaOrdem = { id: true, codigoLote: true, status: true, concluidaEm: true, planejadoMilesimos: true, insumoProduzidoId: true, requisicaoId: true, fichaId: true, fichaNomeSnapshot: true, unidadeSnapshot: true, responsavelNomeSnapshot: true, responsavelDesde: true } as const;
        const [ordensDaLista, fora] = await Promise.all([
          ordensIds.length ? tx.ordemProducao.findMany({ where: { id: { in: ordensIds } }, select: selecaoDaOrdem }) : Promise.resolve([]),
          // Lotes do mesmo dia planejados FORA da lista (Nova produção, ou a ficha): entram na conta (vão consumir e produzir).
          tx.ordemProducao.findMany({ where: { lojaId, dataPlanejada: dataDe(dia), status: { not: 'CANCELADA' }, itemDaLista: { is: null } }, orderBy: { codigoLote: 'asc' }, select: selecaoDaOrdem }),
        ]);
        const ordemPorId = new Map(ordensDaLista.map((o) => [o.id, o]));

        // O que ainda falta SAIR pela requisição de cada lote vivo (o que saiu já está no saldo); do concluído, o que ele tirou.
        const comLote = [...ordensDaLista, ...fora].filter((o) => o.status !== 'CANCELADA');
        const reqIds = comLote.map((o) => o.requisicaoId).filter((x): x is string => !!x);
        const itensDasReqs = reqIds.length
          ? await tx.requisicaoItem.findMany({ where: { requisicaoId: { in: reqIds } }, select: { requisicaoId: true, insumoId: true, solicitadoMilesimos: true, atendidoMilesimos: true, requisicao: { select: { status: true } } } })
          : [];
        const aSairDe = (requisicaoId: string | null) => {
          const m = new Map<string, number>();
          for (const i of itensDasReqs) {
            if (i.requisicaoId !== requisicaoId) continue;
            const aberta = i.requisicao.status === 'ABERTA' || i.requisicao.status === 'PARCIAL';
            const q = aberta ? faltaDe({ solicitadoMilesimos: i.solicitadoMilesimos, atendidoMilesimos: i.atendidoMilesimos ?? 0 }) : 0;
            m.set(i.insumoId, (m.get(i.insumoId) ?? 0) + q);
          }
          return m;
        };
        const tocadosDe = (requisicaoId: string | null) => itensDasReqs.filter((i) => i.requisicaoId === requisicaoId).map((i) => i.insumoId);

        // As fichas e os insumos da conta, até fechar: as fichas das linhas E dos lotes de fora da lista; o que cada ficha usa
        // (subficha e insumo); e a ficha que produz cada pré-preparo que aparece — na receita ou ainda saindo pela requisição de
        // um lote. Sem isso, o lote planejado fora da lista (Nova produção) levava a base na requisição e a cascata dela sumia
        // ("sem ficha"; revisão da 3.2, B1). Cada volta lê só o que ainda não foi pedido; o laço para quando nada novo aparece.
        const fichas = new Map<string, FichaDaConta & { tipo: string }>();
        const insumos = new Map<string, InsumoDaConta>();
        const fichasPedidas = new Set<string>();
        const insumosPedidos = new Set<string>();
        let proximasFichas = [...itens.map((i) => i.fichaId), ...fora.map((o) => o.fichaId)];
        let proximosInsumos = [...itensDasReqs.map((i) => i.insumoId), ...comLote.map((o) => o.insumoProduzidoId).filter((x): x is string => !!x)];
        for (let volta = 0; volta <= 2 * PROFUNDIDADE_MAXIMA + 2 && (proximasFichas.length > 0 || proximosInsumos.length > 0); volta++) {
          const fichasDaVolta = Array.from(new Set(proximasFichas)).filter((x) => !fichasPedidas.has(x));
          const insumosDaVolta = Array.from(new Set(proximosInsumos)).filter((x) => !insumosPedidos.has(x));
          proximasFichas = [];
          proximosInsumos = [];
          for (const x of fichasDaVolta) fichasPedidas.add(x);
          for (const x of insumosDaVolta) insumosPedidos.add(x);
          const [lidas, lidos] = await Promise.all([
            fichasDaVolta.length
              ? tx.fichaTecnica.findMany({
                  where: { id: { in: fichasDaVolta } },
                  select: { id: true, nome: true, tipo: true, ativa: true, rendimentoMilesimos: true, unidadeRendimento: true, insumoProduzidoId: true, itens: { orderBy: { ordem: 'asc' }, select: { insumoId: true, subfichaId: true, quantidadeMilesimos: true, fatorCorrecaoMilesimos: true } } },
                })
              : Promise.resolve([]),
            insumosDaVolta.length ? tx.insumo.findMany({ where: { id: { in: insumosDaVolta } }, select: { id: true, nome: true, unidade: true, ativo: true, conteudoMilesimos: true, fichaQueProduz: { select: { id: true } } } }) : Promise.resolve([]),
          ]);
          for (const f of lidas) {
            fichas.set(f.id, { id: f.id, nome: f.nome, tipo: f.tipo, ativa: f.ativa, rendimentoMilesimos: f.rendimentoMilesimos, unidade: f.unidadeRendimento as Unidade, insumoProduzidoId: f.insumoProduzidoId, itens: f.itens });
            if (f.insumoProduzidoId) proximosInsumos.push(f.insumoProduzidoId);
            for (const it of f.itens) {
              if (it.subfichaId) proximasFichas.push(it.subfichaId);
              if (it.insumoId) proximosInsumos.push(it.insumoId);
            }
          }
          for (const i of lidos) {
            insumos.set(i.id, { id: i.id, nome: i.nome, unidade: i.unidade as Unidade, ativo: i.ativo, conteudoMilesimos: i.conteudoMilesimos, fichaQueProduzId: i.fichaQueProduz?.id ?? null });
            if (i.fichaQueProduz) proximasFichas.push(i.fichaQueProduz.id);
          }
        }

        // O que a loja produz no dia: as linhas (sem lote = a receita; com lote vivo = o que falta sair) e os lotes de fora.
        const producao: ProducaoDoDia[] = [];
        for (const i of itens) {
          const o = i.ordemProducaoId ? ordemPorId.get(i.ordemProducaoId) : undefined;
          const f = fichas.get(i.fichaId);
          producao.push({
            nome: i.nome,
            fichaId: i.fichaId,
            insumoProduzidoId: o?.insumoProduzidoId ?? f?.insumoProduzidoId ?? null,
            quantidadeMilesimos: i.estado === 'NA_LISTA' ? i.quantidadeMilesimos : (o?.planejadoMilesimos ?? i.quantidadeMilesimos),
            estado: i.estado,
            ...(i.estado === 'EM_LOTE' ? { aSair: aSairDe(o?.requisicaoId ?? null) } : {}),
            ...(i.estado === 'FEITA' ? { tocados: tocadosDe(o?.requisicaoId ?? null) } : {}),
          });
        }
        for (const o of fora) {
          producao.push({
            nome: o.fichaNomeSnapshot,
            fichaId: o.fichaId,
            insumoProduzidoId: o.insumoProduzidoId,
            quantidadeMilesimos: o.planejadoMilesimos,
            estado: estadoDaLinha({ status: o.status as StatusDaProducao }),
            ...(o.status === 'PLANEJADA' || o.status === 'EM_EXECUCAO' ? { aSair: aSairDe(o.requisicaoId) } : { tocados: tocadosDe(o.requisicaoId) }),
          });
        }

        // Os insumos que aparecem (os das receitas, os que as fichas produzem e os que ainda saem pelos lotes) já foram lidos.
        const ids = Array.from(insumos.keys());
        let saldo: SaldoDaLoja;
        if (estoque === 'ABERTO') {
          const saldos = ids.length ? await tx.saldoEstoque.findMany({ where: { lojaId, insumoId: { in: ids } }, select: { insumoId: true, quantidadeMilesimos: true } }) : [];
          saldo = { apurado: true, saldos: new Map(saldos.map((s) => [s.insumoId, s.quantidadeMilesimos])) };
        } else saldo = { apurado: false, motivo: fraseSemSaldo(estoque, loja.nome) };
        const conta: ContaDaLista = contaDaLista({ producao, fichas, cadastro: insumos, saldo });

        // O custo estimado do que falta comprar: só para quem vê custos (montado aqui, o navegador não recebe nada a mais).
        let custo: CustoDaCompra | null = null;
        if (verCustos && conta.resumo.faltaComprar > 0) {
          const comprar = conta.materiaPrima.filter((i) => (i.comprarMilesimos ?? 0) > 0);
          const ref = await custosDeReferencia(tx, comprar.map((i) => i.insumoId));
          custo = custoDaCompra(comprar, new Map(comprar.map((i) => [i.insumoId, ref.get(i.insumoId)?.porUnidade ?? null])));
        }
        // O orçamento de compra da loja (2.5), pela vista de quem lê. Sem ver custos, a conta parte de zero (só o "cabe").
        let orcamento: OrcamentoNaNota | null = null;
        if (conta.resumo.faltaComprar > 0 && (pode(alcance, 'compras.ver', { lojaId }) || pode(alcance, 'compras.lancar', { lojaId }))) {
          orcamento = await orcamentoNaNota(tx, alcance, { lojaId, entradaEm: hoje, notaCentavos: custo ? Number(centavosDaFracao(custo.total)) : 0, hoje });
        }

        // O que ainda vira lote (e o que se escolhe para pôr na lista): pré-preparo ativo que vira insumo.
        const escolhiveis = podePlanejar || itens.length ? await fichasEscolhiveis(tx) : new Map<string, FichaEscolhivel>();
        const saldoDe = (insumoId: string | null) => (insumoId && saldo.apurado ? (saldo.saldos.get(insumoId) ?? 0) : null);
        const linhas: LinhaDaLista[] = itens.map((i) => {
          const o = i.ordemProducaoId ? ordemPorId.get(i.ordemProducaoId) : undefined;
          const f = fichas.get(i.fichaId);
          const status = o ? (o.status as StatusDaProducao) : null;
          const escolha = escolhiveis.get(i.fichaId);
          return {
            id: i.id,
            fichaId: i.fichaId,
            nome: i.nome,
            unidade: i.unidade,
            quantidadeMilesimos: i.quantidadeMilesimos,
            estado: i.estado,
            lote: o && status ? { id: o.id, codigo: o.codigoLote, status, estornado: foiEstornado({ status, concluidaEm: o.concluidaEm }), responsavel: o.responsavelDesde && o.responsavelNomeSnapshot ? { nome: o.responsavelNomeSnapshot, desde: o.responsavelDesde } : null } : null,
            emEstoqueMilesimos: saldoDe(f?.insumoProduzidoId ?? null),
            fichaDisponivel: !!escolha && escolha.unidade === i.unidade,
          };
        });
        const foraDaLista: LoteForaDaLista[] = fora.map((o) => ({ id: o.id, codigo: o.codigoLote, nome: o.fichaNomeSnapshot, unidade: (o.unidadeSnapshot ?? 'KG') as Unidade, quantidadeMilesimos: o.planejadoMilesimos, status: o.status as StatusDaProducao }));

        const motivoDoDiaTexto = motivoDoDia(dia, hoje);
        const naoEdita = !loja.ativa ? `A ${loja.nome} está desativada.` : motivoDoDiaTexto ?? (periodoFechado ? fraseDoPeriodoFechado(periodoFechado) : null);
        const semLote = linhas.filter((l) => l.estado === 'NA_LISTA');
        const naoGera = naoEdita ?? (estoque !== 'ABERTO' ? `O estoque da ${loja.nome} ainda não foi aberto: o lote baixa os insumos do estoque, que começa depois da contagem de abertura.` : null);
        const historico = lista ? await listarHistorico(tx, { de: [{ entidade: 'ListaProducao', ids: [lista.id] }], limite: 15, verPrecos: false, verCustos }) : [];
        return {
          loja,
          hoje,
          dia,
          rotuloDoDia: rotuloDoDia(dia, hoje),
          estoque,
          periodoFechado,
          lista: lista ? { id: lista.id, versao: lista.versao, criadaPorNome: lista.criadaPorNome, criadaEm: lista.criadaEm, atualizadaPorNome: lista.atualizadaPorNome, atualizadaEm: lista.atualizadaEm } : null,
          linhas,
          foraDaLista,
          conta,
          custo,
          orcamento,
          historico,
          pode: {
            planejar: podePlanejar,
            /** 3.3: quem registra produção pega as tarefas do dia (a tela da cozinha). */
            registrar: pode(alcance, 'producao.registrar', { lojaId }),
            verCustos,
            lancarNota: pode(alcance, 'compras.lancar', { lojaId }),
            verOrcamento: pode(alcance, 'compras.ver', { lojaId }),
            verLotes: true,
          },
          /** Por que não se edita (null = edita, para quem pode planejar). */
          naoEdita,
          /** Por que as linhas não viram lote agora (null = viram). */
          naoGera,
          semLote: semLote.length,
          opcoes: podePlanejar && !naoEdita ? Array.from(escolhiveis.values()) : [],
        };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
  return 'ok' in r ? null : r;
}

export type ListaDoDiaNaTela = NonNullable<Awaited<ReturnType<typeof obterListaDoDia>>>;

// ================================================================ salvar a lista

/**
 * Salva a lista do dia (as linhas que ainda não viraram lote; as que viraram ficam como estão): `producao.planejar` na loja,
 * dia de hoje a 14 dias, fora de período fechado. Cria a lista na primeira vez. Lista que fica sem nenhuma linha está
 * APAGADA, mas a linha dela no banco fica: a versão nunca recomeça, e a aba que leu a lista apagada não sobrescreve a lista
 * montada de novo por outra pessoa (decisão 229). Versão lida; o mesmo conteúdo = "já feito". `vistas` = as linhas em aberto
 * que a tela mostrou (o formulário manda): linha em aberto que a pessoa não viu (o lote dela foi cancelado em outra tela e
 * ela voltou) é conflito, nunca apagada em silêncio (decisão 228). Histórico com o antes e o depois do que produzir.
 */
export async function salvarListaDoDia(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { dia: unknown; versao: unknown; linhaIds: readonly unknown[]; fichaIds: readonly unknown[]; quantidades: readonly unknown[]; vistas?: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const versaoLida = typeof entrada.versao === 'string' && entrada.versao.trim() !== '' ? Number(entrada.versao) : typeof entrada.versao === 'number' ? entrada.versao : null;
  const vistas = idsVistos(entrada.vistas);
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.planejar');
      if (!loja.ativa) throw new Recusa({ ok: false, erros: { geral: `A ${loja.nome} está desativada.` } });
      const hoje = hojeNoRio(agora);
      const dia = diaDaEscrita(entrada.dia, hoje);
      await conferirDiaAberto(tx, dia);
      const escolhiveis = await fichasEscolhiveis(tx);
      const lido = lerLinhasDaLista({ linhaIds: entrada.linhaIds, fichaIds: entrada.fichaIds, quantidades: entrada.quantidades }, escolhiveis);
      if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });
      const existia = await travarLista(tx, lojaId, dia);
      if (!existia && lido.linhas.length === 0) return { ok: true as const, id: lojaId, jaFeito: true };
      const lista = existia ?? (await criarOuTravar(tx, lojaId, dia, autor, agora));
      const itens = await itensDaLista(tx, lista.id);
      // Vazia = nunca montada ou apagada: quem não viu lista (versão vazia) ou viu esta mesma versão monta de novo.
      const vazia = itens.length === 0;
      const editaveis = itens.filter((i) => i.estado === 'NA_LISTA');
      const fixos = itens.filter((i) => i.estado !== 'NA_LISTA');
      if (vazia) {
        if (lido.linhas.length === 0) return { ok: true as const, id: lista.id, jaFeito: true };
        if (versaoLida !== null && versaoLida !== lista.versao) throw new Recusa({ ok: false, erros: { geral: APAGADA }, conflito: true });
      } else {
        // O mesmo conteúdo que já está gravado: o duplo clique, ou outra aba que salvou igual.
        if (mesmoConteudo(editaveis, lido.linhas)) return { ok: true as const, id: lista.id, jaFeito: true };
        const naoVista = vistas ? editaveis.find((i) => !vistas.has(i.id)) : undefined;
        if (naoVista) throw new Recusa({ ok: false, erros: { geral: fraseDaLinhaQueVoltou(naoVista) }, conflito: true });
        if (versaoLida === null || !Number.isSafeInteger(versaoLida) || versaoLida !== lista.versao) throw new Recusa({ ok: false, erros: { geral: MUDOU }, conflito: true });
      }
      const porId = new Map(editaveis.map((i) => [i.id, i]));
      for (const l of lido.linhas) {
        if (l.id && !porId.has(l.id)) {
          const virou = fixos.find((f) => f.id === l.id);
          throw new Recusa({ ok: false, erros: { geral: virou ? `${virou.nome} virou o lote ${virou.codigoLote} agora há pouco: a linha não muda mais. Confira a lista de novo; nada foi gravado.` : MUDOU }, conflito: true });
        }
      }
      // A mesma ficha numa linha que já virou lote e numa nova é outro lote do dia (vale); duas abertas, não (o lido recusa).
      const manter = new Set(lido.linhas.map((l) => l.id).filter((x): x is string => !!x));
      const sair = editaveis.filter((i) => !manter.has(i.id)).map((i) => i.id);
      if (sair.length) await tx.listaProducaoItem.deleteMany({ where: { id: { in: sair } } });
      const base = fixos.length ? Math.max(...fixos.map((f) => f.ordem)) + 1 : 0;
      for (const [n, l] of lido.linhas.entries()) {
        const ordem = Math.min(999, base + n);
        const antes = l.id ? porId.get(l.id)! : null;
        if (antes) {
          const trocouFicha = antes.fichaId !== l.fichaId;
          if (trocouFicha || antes.quantidadeMilesimos !== l.quantidadeMilesimos || antes.ordem !== ordem) {
            await tx.listaProducaoItem.update({
              where: { id: antes.id },
              // Trocar a ficha de uma linha que tinha lote cancelado desliga o lote velho (ele era de outra ficha).
              data: { fichaId: l.fichaId, fichaNomeSnapshot: l.nome, unidadeSnapshot: l.unidade, quantidadeMilesimos: l.quantidadeMilesimos, ordem, ...(trocouFicha ? { ordemProducaoId: null } : {}) },
            });
          }
        } else {
          await tx.listaProducaoItem.create({ data: { parceiroId: tx.parceiroId, listaId: lista.id, fichaId: l.fichaId, fichaNomeSnapshot: l.nome, unidadeSnapshot: l.unidade, quantidadeMilesimos: l.quantidadeMilesimos, ordem } });
        }
      }
      const nome = nomeDaLista(dia, loja.nome);
      const antesTexto = textoDaProducao(itens);
      const depois = [...fixos, ...lido.linhas];
      await tx.listaProducao.update({ where: { id: lista.id }, data: { versao: { increment: 1 }, atualizadaEm: agora, atualizadaPorNome: autor.nome } });
      if (depois.length === 0) {
        // Apagar = tirar todas as linhas; a lista (e a versão dela) fica.
        await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'ListaProducao', entidadeId: lista.id, acao: 'EXCLUIU', antes: { nome, producaoDoDia: antesTexto }, autorNome: autor.nome } });
        return { ok: true as const, id: lista.id };
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'ListaProducao',
          entidadeId: lista.id,
          acao: vazia ? 'CRIOU' : 'ALTEROU',
          ...(vazia ? {} : { antes: { nome, producaoDoDia: antesTexto } }),
          depois: { nome, producaoDoDia: textoDaProducao(depois) },
          autorNome: autor.nome,
        },
      });
      return { ok: true as const, id: lista.id };
    }),
  );
}

// ================================================================ pôr na lista (o pré-preparo que falta)

/**
 * "Pôr na lista": o pré-preparo que falta produzir (a base que o molho usa) entra na lista do dia, com a quantidade dita
 * (em milésimos, a da conta). Se ele já está numa linha sem lote, a quantidade soma nela. Mesmas regras de salvar; a
 * versão lida tem de bater (o segundo clique encontra a lista mudada e não soma de novo).
 */
export async function porNaListaDoDia(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { dia: unknown; versao: unknown; fichaId: unknown; quantidade: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const versaoLida = typeof entrada.versao === 'string' && entrada.versao.trim() !== '' ? Number(entrada.versao) : null;
  const q = typeof entrada.quantidade === 'string' && /^\d{1,9}$/.test(entrada.quantidade) ? Number(entrada.quantidade) : NaN;
  return comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.planejar');
      if (!loja.ativa) throw new Recusa({ ok: false, erros: { geral: `A ${loja.nome} está desativada.` } });
      const hoje = hojeNoRio(agora);
      const dia = diaDaEscrita(entrada.dia, hoje);
      await conferirDiaAberto(tx, dia);
      const ficha = typeof entrada.fichaId === 'string' && ID.test(entrada.fichaId) ? (await fichasEscolhiveis(tx)).get(entrada.fichaId) : undefined;
      if (!ficha) throw new Recusa({ ok: false, erros: { geral: 'Esse pré-preparo não está mais disponível (desativado ou sem ficha ativa).' } });
      if (!Number.isSafeInteger(q) || q <= 0 || q > TETO_DA_LINHA) throw new Recusa({ ok: false, erros: { geral: `Quanto pôr na lista: de 1 g a ${formatarQuantidade(TETO_DA_LINHA, ficha.unidade)}.` } });
      const existia = await travarLista(tx, lojaId, dia);
      const lista = existia ?? (await criarOuTravar(tx, lojaId, dia, autor, agora));
      const itens = await itensDaLista(tx, lista.id);
      const vazia = itens.length === 0;
      if (vazia ? versaoLida !== null && versaoLida !== lista.versao : versaoLida === null || versaoLida !== lista.versao) {
        throw new Recusa({ ok: false, erros: { geral: vazia ? APAGADA : 'A lista mudou agora há pouco (talvez por este mesmo clique). Confira de novo; nada foi somado.' }, conflito: true });
      }
      const aberta = itens.find((i) => i.estado === 'NA_LISTA' && i.fichaId === ficha.id);
      if (aberta) {
        if (aberta.unidade !== ficha.unidade) throw new Recusa({ ok: false, erros: { geral: `A ficha de ${ficha.nome} mudou de unidade: ajuste a linha dela na lista.` } });
        const soma = aberta.quantidadeMilesimos + q;
        if (soma > TETO_DA_LINHA) throw new Recusa({ ok: false, erros: { geral: `${ficha.nome}: até ${formatarQuantidade(TETO_DA_LINHA, ficha.unidade)} numa linha.` } });
        await tx.listaProducaoItem.update({ where: { id: aberta.id }, data: { quantidadeMilesimos: soma } });
      } else {
        if (itens.filter((i) => i.estado === 'NA_LISTA').length >= TETO_DE_LINHAS) throw new Recusa({ ok: false, erros: { geral: `Até ${TETO_DE_LINHAS} pré-preparos numa lista.` } });
        const ordem = Math.min(999, itens.length ? Math.max(...itens.map((i) => i.ordem)) + 1 : 0);
        await tx.listaProducaoItem.create({ data: { parceiroId: tx.parceiroId, listaId: lista.id, fichaId: ficha.id, fichaNomeSnapshot: ficha.nome, unidadeSnapshot: ficha.unidade, quantidadeMilesimos: q, ordem } });
      }
      await tx.listaProducao.update({ where: { id: lista.id }, data: { versao: { increment: 1 }, atualizadaEm: agora, atualizadaPorNome: autor.nome } });
      const nome = nomeDaLista(dia, loja.nome);
      const depois = itens.map((i) => (aberta && i.id === aberta.id ? { ...i, quantidadeMilesimos: i.quantidadeMilesimos + q } : i));
      if (!aberta) depois.push({ id: '', fichaId: ficha.id, nome: ficha.nome, unidade: ficha.unidade, quantidadeMilesimos: q, ordem: 0, ordemProducaoId: null, estado: 'NA_LISTA', codigoLote: null });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'ListaProducao',
          entidadeId: lista.id,
          acao: vazia ? 'CRIOU' : 'ALTEROU',
          ...(vazia ? {} : { antes: { nome, producaoDoDia: textoDaProducao(itens) } }),
          depois: { nome, producaoDoDia: textoDaProducao(depois) },
          autorNome: autor.nome,
        },
      });
      return { ok: true as const, id: lista.id };
    }),
  );
}

// ================================================================ gerar os lotes

/**
 * Transforma as linhas da lista que ainda não viraram lote em lotes PLANEJADOS, cada um pela regra da 3.1
 * (`planejarProducaoNaTx`: a requisição dos insumos nasce junto; nada sai do estoque aqui), na mesma transação: ou viram
 * todas, ou nenhuma. `linhas` = as linhas em aberto que a tela mostrou (o formulário manda): só elas viram lote, e linha que
 * a pessoa não pediu nunca vira lote sozinha (sem `linhas`, todas as em aberto: o uso por código). `producao.planejar` na
 * loja, estoque aberto, dia de hoje a 14 dias, fora de período fechado, versão lida (cancelar um lote da lista sobe a versão:
 * a aba velha não gera de novo o lote que alguém acabou de cancelar). Gerar de novo (duplo clique, outra aba) = "já feito".
 */
export async function gerarLotesDaLista(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { dia: unknown; versao: unknown; linhas?: readonly unknown[] },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const versaoLida = typeof entrada.versao === 'string' && entrada.versao.trim() !== '' ? Number(entrada.versao) : typeof entrada.versao === 'number' ? entrada.versao : null;
  const pedidas = entrada.linhas ? new Set(entrada.linhas.filter((x): x is string => typeof x === 'string' && ID.test(x))) : null;
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.planejar');
        if (!loja.ativa) throw new Recusa({ ok: false, erros: { geral: `A ${loja.nome} está desativada.` } });
        const hoje = hojeNoRio(agora);
        const dia = diaDaEscrita(entrada.dia, hoje);
        await conferirDiaAberto(tx, dia);
        const lista = await travarLista(tx, lojaId, dia);
        const itens = lista ? await itensDaLista(tx, lista.id) : [];
        if (!lista || itens.length === 0) throw new Recusa({ ok: false, erros: { geral: 'A lista deste dia não existe mais (foi apagada). Confira de novo; nenhum lote foi gerado.' }, conflito: true });
        if (pedidas && pedidas.size === 0) throw new Recusa({ ok: false, erros: { geral: 'Nenhum pré-preparo em aberto para virar lote.' } });
        // Linha pedida que nem está mais na lista: alguém mudou a lista no meio.
        if (pedidas && Array.from(pedidas).some((id) => !itens.some((i) => i.id === id))) throw new Recusa({ ok: false, erros: { geral: MUDOU }, conflito: true });
        const alvo = itens.filter((i) => i.estado === 'NA_LISTA' && (!pedidas || pedidas.has(i.id)));
        // Nada mais a gerar (o clique de antes já gerou): a que valeu fica.
        if (alvo.length === 0) return { ok: true as const, id: lista.id, jaFeito: true };
        if (versaoLida === null || !Number.isSafeInteger(versaoLida) || versaoLida !== lista.versao) throw new Recusa({ ok: false, erros: { geral: MUDOU }, conflito: true });
        await exigirAberto(tx, loja);
        const escolhiveis = await fichasEscolhiveis(tx);
        const nome = nomeDaLista(dia, loja.nome);
        const gerados: { codigo: string; nome: string; unidade: Unidade; quantidadeMilesimos: number }[] = [];
        for (const i of alvo) {
          const ficha = escolhiveis.get(i.fichaId);
          if (!ficha) throw new Recusa({ ok: false, erros: { geral: `${i.nome}: a ficha não está mais disponível (desativada ou sem o insumo que produz). Tire da lista ou reative a ficha; nenhum lote foi gerado.` } });
          if (ficha.unidade !== i.unidade) {
            throw new Recusa({ ok: false, erros: { geral: `${i.nome}: a ficha passou a render em ${UNIDADES[ficha.unidade].sigla} (a linha está em ${UNIDADES[i.unidade].sigla}). Ajuste a quantidade e salve a lista; nenhum lote foi gerado.` } });
          }
          let r: Awaited<ReturnType<typeof planejarProducaoNaTx>>;
          try {
            r = await planejarProducaoNaTx(tx, loja, { fichaId: i.fichaId, quantidade: textoDoCampo(i.quantidadeMilesimos), paraDia: dia, observacao: '', chave: null, daLista: nome }, autor, agora);
          } catch (e) {
            if (e instanceof Recusa && !e.resultado.ok) {
              const msg = Object.values(e.resultado.erros).find(Boolean) ?? 'não deu para planejar';
              throw new Recusa({ ok: false, erros: { geral: `${i.nome}: ${msg} Nenhum lote foi gerado.` }, conflito: e.resultado.conflito });
            }
            throw e;
          }
          await tx.listaProducaoItem.update({ where: { id: i.id }, data: { ordemProducaoId: r.id } });
          gerados.push({ codigo: r.codigo, nome: i.nome, unidade: i.unidade, quantidadeMilesimos: i.quantidadeMilesimos });
        }
        await tx.listaProducao.update({ where: { id: lista.id }, data: { versao: { increment: 1 }, atualizadaEm: agora, atualizadaPorNome: autor.nome } });
        await tx.historicoAlteracao.create({
          data: { parceiroId: tx.parceiroId, entidade: 'ListaProducao', entidadeId: lista.id, acao: 'GEROU_LOTES', depois: { nome, lotesGerados: textoDosLotes(gerados) }, autorNome: autor.nome },
        });
        return { ok: true as const, id: lista.id };
      },
      { timeout: 30_000, maxWait: 10_000 },
    ),
  );
}

// ================================================================ pegar uma linha da lista (3.3)

/**
 * A cozinha pega uma linha de HOJE da lista (3.3, decisão 232): `producao.registrar` na loja; a pessoa do login (o nível 1
 * não pega). A linha que ainda não virou lote vira o lote dela pela regra do "Gerar" (`planejarProducaoNaTx`: a requisição
 * dos insumos nasce junto; nada sai do estoque) e o lote já sai com quem pegou (`pegarNaTx`). A tela manda a linha que
 * mostrou com a ficha e a quantidade: se a gerência mudou a linha nesse meio-tempo, é conflito (ninguém produz o que não
 * viu). Duas pessoas pegando a mesma linha ao mesmo tempo: a lista travada faz uma esperar, e ela lê "Caio pegou às 09:12";
 * a mesma pessoa de novo (duplo toque) = "já feito". A linha que virou lote pelo "Gerar" e está sem ninguém é pega como
 * qualquer lote. Travas: período (o dia da lista, compartilhada) → a lista → as da 3.1.
 */
export async function pegarDaLista(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  entrada: { linha: unknown; ficha: unknown; quantidade: unknown },
  autor: Autor,
  agora = new Date(),
): Promise<ResultadoEstoque> {
  const linhaId = typeof entrada.linha === 'string' && ID.test(entrada.linha) ? entrada.linha : null;
  const quantidadeVista = typeof entrada.quantidade === 'string' && /^\d{1,9}$/.test(entrada.quantidade) ? Number(entrada.quantidade) : NaN;
  return comRecusa(() =>
    cliente.transacao(
      async (tx) => {
        const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.registrar');
        if (alcance.nivel === 'FLOWFOODS' || !autor.userId) throw new Recusa({ ok: false, erros: { geral: NIVEL1_NAO_PEGA } });
        if (!loja.ativa) throw new Recusa({ ok: false, erros: { geral: `A ${loja.nome} está desativada.` } });
        const hoje = hojeNoRio(agora);
        await conferirDiaAberto(tx, hoje);
        const lista = await travarLista(tx, lojaId, hoje);
        const itens = lista ? await itensDaLista(tx, lista.id) : [];
        const linha = linhaId ? itens.find((i) => i.id === linhaId) : undefined;
        if (!lista || !linha) throw new Recusa({ ok: false, erros: { geral: 'Este pré-preparo saiu da lista de hoje agora há pouco. Confira as tarefas de novo; nada foi gravado.' }, conflito: true });
        if (linha.estado === 'FEITA') throw new Recusa({ ok: false, erros: { geral: `${linha.nome} já foi feito hoje (lote ${linha.codigoLote}).` }, conflito: true });
        if (linha.estado === 'EM_LOTE') {
          // Virou lote nesse meio-tempo (outra pessoa pegou, ou a gerência gerou): pega o lote, como qualquer outro.
          const r = await pegarNaTx(tx, lojaId, linha.ordemProducaoId!, null, alcance, autor, agora);
          return { ok: true as const, id: r.id, ...(r.jaFeito ? { jaFeito: true } : {}) };
        }
        if (linha.fichaId !== entrada.ficha || linha.quantidadeMilesimos !== quantidadeVista) {
          throw new Recusa({ ok: false, erros: { geral: `A gerência mudou ${linha.nome} na lista agora há pouco. Confira as tarefas de novo; nada foi gravado.` }, conflito: true });
        }
        await exigirAberto(tx, loja);
        const ficha = (await fichasEscolhiveis(tx)).get(linha.fichaId);
        if (!ficha) throw new Recusa({ ok: false, erros: { geral: `${linha.nome}: a ficha não está mais disponível (desativada ou sem o insumo que produz). Fale com a gerência.` } });
        if (ficha.unidade !== linha.unidade) throw new Recusa({ ok: false, erros: { geral: `${linha.nome}: a ficha passou a render em ${UNIDADES[ficha.unidade].sigla} e a lista está em ${UNIDADES[linha.unidade].sigla}. Fale com a gerência.` } });
        const nome = nomeDaLista(hoje, loja.nome);
        const r = await planejarProducaoNaTx(tx, loja, { fichaId: linha.fichaId, quantidade: textoDoCampo(linha.quantidadeMilesimos), paraDia: hoje, observacao: '', chave: null, daLista: nome }, autor, agora);
        await tx.listaProducaoItem.update({ where: { id: linha.id }, data: { ordemProducaoId: r.id } });
        await tx.listaProducao.update({ where: { id: lista.id }, data: { versao: { increment: 1 }, atualizadaEm: agora, atualizadaPorNome: autor.nome } });
        await tx.historicoAlteracao.create({
          data: {
            parceiroId: tx.parceiroId,
            entidade: 'ListaProducao',
            entidadeId: lista.id,
            acao: 'GEROU_LOTES',
            depois: { nome, lotesGerados: textoDosLotes([{ codigo: r.codigo, nome: linha.nome, unidade: linha.unidade, quantidadeMilesimos: linha.quantidadeMilesimos }]), pegoPor: autor.nome },
            autorNome: autor.nome,
          },
        });
        await pegarNaTx(tx, lojaId, r.id, null, alcance, autor, agora);
        return { ok: true as const, id: r.id };
      },
      { timeout: 20_000, maxWait: 10_000 },
    ),
  );
}
