/**
 * A cozinha pega a tarefa (3.3) — as LEITURAS com banco: a tela da cozinha (as tarefas de hoje de uma loja), o histórico da
 * produção (o quê, quanto, por quem, quando) e os indicadores por pessoa. As escritas moram onde a produção mora: pegar,
 * soltar e passar em `producao.ts` (`pegarProducao`, `soltarProducao`, `passarProducao`); pegar uma linha da lista em
 * `producao-lista.ts` (`pegarDaLista`). A conta pura (período, desfecho, tempo, indicadores, frases) em
 * `producao-equipe-campos.ts`.
 *
 * Permissões (sempre com a LOJA; fora do alcance = não encontrado): a tela da cozinha = `producao.registrar` (é a tela de
 * quem produz); o histórico = `producao.ver` (a cozinha já vê no quadro quem concluiu cada lote); os indicadores por pessoa =
 * `producao.planejar` (a gerência; decisão 236). O custo do lote no histórico só sai do servidor para quem tem
 * `insumos.ver` (o contrato do lote da 3.1); os indicadores não têm R$.
 */

import type { ClienteDoParceiro } from './tenant';
import { pode, type Alcance, type Permissao } from './permissoes';
import { hojeNoRio } from './compra-campos';
import { somarDias } from './contagem-campos';
import { aberturasDe, comRecusa, lojaDoAlcance } from './estoque';
import { datasEmPeriodoFechado } from './periodo-trava';
import { diasDeAtrasoDoLote, type StatusDaProducao } from './producao-campos';
import { passadosPor } from './producao';
import { estadoDaLinha, rotuloDoDia } from './producao-lista-campos';
import { desfechoDoLote, diaDoEncerramento, indicadoresPorPessoa, lerFiltroId, lerPeriodoDoHistorico, resumoDoHistorico, tempoDoLote, type LoteEncerrado, type PeriodoDoHistorico } from './producao-equipe-campos';
import type { StatusDaRequisicao } from './requisicao-campos';
import type { Unidade } from './unidades';

/** Início de um dia do Rio (UTC−3) como instante. */
const inicioDoDia = (dia: string) => new Date(`${dia}T03:00:00.000Z`);
const dataDe = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ================================================================ as lojas (entrada das abas)

/**
 * Lojas do alcance com a permissão da aba, e (para a tela da cozinha) o que há hoje: quantas tarefas para pegar e
 * quantas em produção. Uma loja só = a página vai direto para ela.
 */
export async function lojasDaEquipe(cliente: ClienteDoParceiro, alcance: Alcance, permissao: Extract<Permissao, 'producao.ver' | 'producao.registrar' | 'producao.planejar'>, agora = new Date()) {
  return cliente.transacao(async (tx) => {
    const lojas = (await tx.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } })).filter((l) => pode(alcance, permissao, { lojaId: l.id }));
    if (lojas.length === 0 || permissao !== 'producao.registrar') return lojas.map((l) => ({ ...l }));
    const hoje = hojeNoRio(agora);
    const [lotes, listas] = await Promise.all([
      tx.ordemProducao.findMany({ where: { lojaId: { in: lojas.map((l) => l.id) }, status: { in: ['PLANEJADA', 'EM_EXECUCAO'] }, dataPlanejada: { lte: dataDe(hoje) } }, select: { lojaId: true, responsavelDesde: true } }),
      tx.listaProducao.findMany({ where: { lojaId: { in: lojas.map((l) => l.id) }, dia: dataDe(hoje) }, select: { lojaId: true, itens: { select: { ordemProducao: { select: { status: true } } } } } }),
    ]);
    return lojas.map((l) => {
      const daLoja = lotes.filter((o) => o.lojaId === l.id);
      const linhas = (listas.find((x) => x.lojaId === l.id)?.itens ?? []).filter((i) => estadoDaLinha(i.ordemProducao ? { status: i.ordemProducao.status as StatusDaProducao } : null) === 'NA_LISTA').length;
      return { ...l, paraPegar: daLoja.filter((o) => !o.responsavelDesde).length + linhas, emProducao: daLoja.filter((o) => !!o.responsavelDesde).length };
    });
  });
}

// ================================================================ a tela da cozinha

export interface LoteDaTarefa {
  tipo: 'LOTE';
  id: string;
  codigo: string;
  nome: string;
  unidade: Unidade;
  planejadoMilesimos: number;
  status: Extract<StatusDaProducao, 'PLANEJADA' | 'EM_EXECUCAO'>;
  versao: number;
  dataPlanejada: string;
  atrasoDias: number;
  /** Quem pegou; `comigo` = é quem lê; `passadoPor` = recebeu da gerência (quem passou), em vez de pegar. */
  responsavel: { nome: string; desde: Date; comigo: boolean; passadoPor: string | null } | null;
  /** A requisição dos insumos (concluir só com ela atendida). */
  requisicaoDoLote: { status: StatusDaRequisicao; numero: number | null } | null;
  daLista: boolean;
}

export interface LinhaDaTarefa {
  tipo: 'LINHA';
  linhaId: string;
  fichaId: string;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
  /** A ficha ainda vira lote (pré-preparo ativo, na mesma unidade da linha). */
  disponivel: boolean;
}

export interface FeitaHoje {
  id: string;
  codigo: string;
  nome: string;
  unidade: Unidade;
  planejadoMilesimos: number;
  produzidoMilesimos: number;
  concluidaEm: Date;
  feitoPor: string | null;
}

/**
 * As tarefas de HOJE da loja para a tela da cozinha: as minhas (lotes que peguei), as para pegar (lotes de hoje ou
 * atrasados sem ninguém, e as linhas da lista de hoje que ainda não viraram lote), as que estão com outras pessoas e as
 * feitas hoje. `eu` = o login de quem lê (null no nível 1, que não pega). Também diz por que ninguém pega agora (estoque
 * não aberto, período fechado) e o que a pessoa pode (pegar; a gerência solta e passa).
 */
export async function tarefasDoDia(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, eu: string | null, agora = new Date()) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.registrar');
      const hoje = hojeNoRio(agora);
      const abertura = (await aberturasDe(tx, [lojaId])).get(lojaId);
      const aberto = !!abertura && abertura.status === 'FECHADA' && !!abertura.fechadaEm;
      const periodoFechado = (await datasEmPeriodoFechado(tx, [hoje])).get(hoje) ?? null;
      const [pendentes, lista, feitas, depois] = await Promise.all([
        tx.ordemProducao.findMany({
          where: { lojaId, status: { in: ['PLANEJADA', 'EM_EXECUCAO'] }, dataPlanejada: { lte: dataDe(hoje) } },
          orderBy: [{ dataPlanejada: 'asc' }, { codigoLote: 'asc' }],
          select: {
            id: true,
            codigoLote: true,
            fichaNomeSnapshot: true,
            unidadeSnapshot: true,
            planejadoMilesimos: true,
            status: true,
            versao: true,
            dataPlanejada: true,
            responsavelUsuarioId: true,
            responsavelNomeSnapshot: true,
            responsavelDesde: true,
            requisicao: { select: { status: true, numero: true } },
            itemDaLista: { select: { id: true } },
          },
        }),
        tx.listaProducao.findFirst({
          where: { lojaId, dia: dataDe(hoje) },
          select: { itens: { orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }, { id: 'asc' }], select: { id: true, fichaId: true, fichaNomeSnapshot: true, unidadeSnapshot: true, quantidadeMilesimos: true, ordemProducao: { select: { status: true } } } } },
        }),
        tx.ordemProducao.findMany({
          where: { lojaId, status: 'CONCLUIDA', concluidaEm: { gte: inicioDoDia(hoje) } },
          orderBy: { concluidaEm: 'desc' },
          take: 30,
          select: { id: true, codigoLote: true, fichaNomeSnapshot: true, unidadeSnapshot: true, planejadoMilesimos: true, produzidoMilesimos: true, concluidaEm: true, responsavelNomeSnapshot: true },
        }),
        tx.ordemProducao.count({ where: { lojaId, status: { in: ['PLANEJADA', 'EM_EXECUCAO'] }, dataPlanejada: { gt: dataDe(hoje) } } }),
      ]);
      const passados = await passadosPor(
        tx,
        pendentes.filter((o) => o.responsavelDesde).map((o) => o.id),
      );
      const lotes: LoteDaTarefa[] = pendentes.map((o) => {
        const status = o.status as LoteDaTarefa['status'];
        const dataPlanejada = iso(o.dataPlanejada);
        return {
          tipo: 'LOTE',
          id: o.id,
          codigo: o.codigoLote,
          nome: o.fichaNomeSnapshot,
          unidade: (o.unidadeSnapshot ?? 'KG') as Unidade,
          planejadoMilesimos: o.planejadoMilesimos,
          status,
          versao: o.versao,
          dataPlanejada,
          atrasoDias: diasDeAtrasoDoLote({ status, dataPlanejada }, hoje),
          responsavel:
            o.responsavelDesde && o.responsavelNomeSnapshot
              ? { nome: o.responsavelNomeSnapshot, desde: o.responsavelDesde, comigo: !!eu && eu === o.responsavelUsuarioId, passadoPor: passados.get(o.id) ?? null }
              : null,
          requisicaoDoLote: o.requisicao ? { status: o.requisicao.status as StatusDaRequisicao, numero: o.requisicao.numero } : null,
          daLista: !!o.itemDaLista,
        };
      });
      const abertas = (lista?.itens ?? []).filter((i) => estadoDaLinha(i.ordemProducao ? { status: i.ordemProducao.status as StatusDaProducao } : null) === 'NA_LISTA');
      const escolhiveis = abertas.length
        ? new Map((await tx.fichaTecnica.findMany({ where: { id: { in: abertas.map((i) => i.fichaId) }, tipo: 'PRE_PREPARO', ativa: true, insumoProduzidoId: { not: null } }, select: { id: true, unidadeRendimento: true } })).map((f) => [f.id, f.unidadeRendimento]))
        : new Map<string, string>();
      const linhas: LinhaDaTarefa[] = abertas.map((i) => ({
        tipo: 'LINHA',
        linhaId: i.id,
        fichaId: i.fichaId,
        nome: i.fichaNomeSnapshot,
        unidade: i.unidadeSnapshot as Unidade,
        quantidadeMilesimos: i.quantidadeMilesimos,
        disponivel: escolhiveis.get(i.fichaId) === i.unidadeSnapshot,
      }));
      const nivel1 = alcance.nivel === 'FLOWFOODS' || !eu;
      // Por que a linha da lista não vira lote agora (o lote que já existe se pega igual: pegar não mexe no estoque).
      const naoGeraLinha = !loja.ativa
        ? `A ${loja.nome} está desativada.`
        : !aberto
          ? `O estoque da ${loja.nome} ainda não foi aberto: o lote baixa os insumos do estoque, que começa depois da contagem de abertura.`
          : periodoFechado
            ? 'Hoje está num período fechado do DRE: a lista não vira lote.'
            : null;
      return {
        loja,
        hoje,
        rotuloDeHoje: rotuloDoDia(hoje, hoje),
        aberto,
        periodoFechado,
        comigo: lotes.filter((l) => l.responsavel?.comigo),
        // Para pegar: os atrasados primeiro, depois os lotes de hoje e as linhas da lista (na ordem da lista).
        paraPegar: [...lotes.filter((l) => !l.responsavel).sort((a, b) => b.atrasoDias - a.atrasoDias), ...linhas] as (LoteDaTarefa | LinhaDaTarefa)[],
        comOutros: lotes.filter((l) => l.responsavel && !l.responsavel.comigo),
        feitasHoje: feitas.map<FeitaHoje>((o) => ({
          id: o.id,
          codigo: o.codigoLote,
          nome: o.fichaNomeSnapshot,
          unidade: (o.unidadeSnapshot ?? 'KG') as Unidade,
          planejadoMilesimos: o.planejadoMilesimos,
          produzidoMilesimos: o.produzidoMilesimos ?? 0,
          concluidaEm: o.concluidaEm!,
          feitoPor: o.responsavelNomeSnapshot,
        })),
        /** Lotes planejados para depois de hoje (ficam em Lotes). */
        depois,
        naoGeraLinha,
        pode: {
          /** Pegar é da pessoa da equipe (o nível 1 não pega). */
          pegar: !nivel1,
          /** A gerência solta qualquer lote e passa para outra pessoa. */
          gerenciar: pode(alcance, 'producao.planejar', { lojaId }),
        },
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type TarefasDoDia = NonNullable<Awaited<ReturnType<typeof tarefasDoDia>>>;

// ================================================================ os lotes encerrados (histórico e indicadores)

/** Até quantos lotes uma leitura traz (92 dias de uma cozinha cabem com folga). */
const TETO_DA_LEITURA = 3000;

/**
 * Os lotes encerrados da loja no período: concluídos (e estornados) pela data da conclusão; cancelados pela do cancelamento.
 * `equipe` = os logins com vínculo (qualquer situação) com o parceiro (`idsDaEquipe`, das credenciais): o responsável gravado
 * que não está nela é a FlowFoods (o nível 1 da 3.1 gravava o próprio login ao concluir; o gatilho do lote concluído não deixa
 * corrigir a linha) e NÃO vira pessoa — nem nos indicadores, nem no filtro (polimento da 3.3, Guardião M1).
 */
async function lotesEncerrados(tx: ClienteDoParceiro, lojaId: string, p: PeriodoDoHistorico, equipe: ReadonlySet<string>) {
  const de = inicioDoDia(p.de);
  const ate = inicioDoDia(somarDias(p.ate, 1));
  const linhas = await tx.ordemProducao.findMany({
    where: {
      lojaId,
      OR: [
        { status: { in: ['CONCLUIDA', 'CANCELADA'] }, concluidaEm: { gte: de, lt: ate } },
        { status: 'CANCELADA', concluidaEm: null, canceladaEm: { gte: de, lt: ate } },
      ],
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: TETO_DA_LEITURA + 1,
    select: {
      id: true,
      codigoLote: true,
      fichaId: true,
      fichaNomeSnapshot: true,
      unidadeSnapshot: true,
      status: true,
      planejadoMilesimos: true,
      produzidoMilesimos: true,
      responsavelUsuarioId: true,
      responsavelNomeSnapshot: true,
      responsavelDesde: true,
      iniciadaEm: true,
      concluidaEm: true,
      concluidaPorNome: true,
      canceladaEm: true,
      canceladaPorNome: true,
      motivoCancelamento: true,
      motivoRendimento: true,
      custoTotalCentavos: true,
      insumosSemPreco: true,
      requisicao: { select: { atendidaEm: true } },
    },
  });
  const cortado = linhas.length > TETO_DA_LEITURA;
  const lotes = linhas.slice(0, TETO_DA_LEITURA).map((o) => ({
    lote: {
      id: o.id,
      codigo: o.codigoLote,
      fichaId: o.fichaId,
      fichaNome: o.fichaNomeSnapshot,
      unidade: (o.unidadeSnapshot ?? 'KG') as Unidade,
      status: o.status as 'CONCLUIDA' | 'CANCELADA',
      planejadoMilesimos: o.planejadoMilesimos,
      produzidoMilesimos: o.produzidoMilesimos,
      responsavel: o.responsavelUsuarioId && o.responsavelNomeSnapshot && equipe.has(o.responsavelUsuarioId) ? { id: o.responsavelUsuarioId, nome: o.responsavelNomeSnapshot } : null,
      responsavelDesde: o.responsavelDesde,
      insumosEntreguesEm: o.requisicao?.atendidaEm ?? null,
      iniciadaEm: o.iniciadaEm,
      concluidaEm: o.concluidaEm,
      concluidaPorNome: o.concluidaPorNome,
      canceladaEm: o.canceladaEm,
      canceladaPorNome: o.canceladaPorNome,
      motivoCancelamento: o.motivoCancelamento,
      motivoRendimento: o.motivoRendimento,
    } satisfies LoteEncerrado,
    custoTotalCentavos: o.custoTotalCentavos,
    insumosSemPreco: o.insumosSemPreco ?? 0,
  }));
  // Mais recente primeiro (pela conclusão ou pelo cancelamento).
  lotes.sort((a, b) => (b.lote.concluidaEm ?? b.lote.canceladaEm)!.getTime() - (a.lote.concluidaEm ?? a.lote.canceladaEm)!.getTime());
  return { lotes, cortado };
}

/** Uma linha do histórico da produção, pronta para a tela. Sem `custo` para quem não vê custos (o servidor não manda). */
export interface LinhaDoHistoricoDaProducao extends LoteEncerrado {
  dia: string;
  desfecho: ReturnType<typeof desfechoDoLote>;
  tempoMin: number | null;
  /** R$ que saíram do estoque pelos insumos (só concluídos e estornados, só para quem vê custos); `incompleto` = algum sem preço. */
  custo?: { totalCentavos: number; incompleto: boolean } | null;
  /** Polimento: a pessoa RECEBEU o lote da gerência (quem passou), em vez de pegar; null = pegou (ou não pegou pelo ERP). */
  passadoPor: string | null;
}

/** Quantas linhas a tela mostra (o resumo conta todas). */
export const LINHAS_NA_TELA = 300;

/**
 * O histórico da produção da loja no período: os lotes encerrados (o quê, quanto planejado × produzido, rendimento, quem
 * fez, quem concluiu, quando pegou e quando terminou), com os filtros de pessoa e ficha, as opções dos filtros (as pessoas
 * e as fichas que aparecem no período) e o resumo. `producao.ver` na loja. Custo só para `insumos.ver`.
 */
export async function historicoDaProducao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  filtro: { periodo?: unknown; de?: unknown; ate?: unknown; pessoa?: unknown; ficha?: unknown },
  /** Os logins com vínculo com o parceiro (`idsDaEquipe`): quem fez e não está aqui é a FlowFoods, não uma pessoa. */
  equipe: ReadonlySet<string>,
  agora = new Date(),
) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.ver');
      const hoje = hojeNoRio(agora);
      const periodo = lerPeriodoDoHistorico(filtro, hoje);
      const { lotes, cortado } = await lotesEncerrados(tx, lojaId, periodo, equipe);
      const pessoas = opcoes(lotes.map((l) => l.lote.responsavel).filter((x): x is { id: string; nome: string } => !!x));
      const fichas = opcoes(lotes.map((l) => ({ id: l.lote.fichaId, nome: l.lote.fichaNome })));
      const pessoa = lerFiltroId(filtro.pessoa);
      const ficha = lerFiltroId(filtro.ficha);
      const filtrados = lotes.filter((l) => (!pessoa || l.lote.responsavel?.id === pessoa) && (!ficha || l.lote.fichaId === ficha));
      const verCustos = pode(alcance, 'insumos.ver');
      const naTela = filtrados.slice(0, LINHAS_NA_TELA);
      const passados = await passadosPor(
        tx,
        naTela.filter((l) => l.lote.responsavel && l.lote.responsavelDesde).map((l) => l.lote.id),
      );
      const linhas: LinhaDoHistoricoDaProducao[] = naTela.map(({ lote, custoTotalCentavos, insumosSemPreco }) => {
        const desfecho = desfechoDoLote(lote);
        return {
          ...lote,
          dia: diaDoEncerramento(lote),
          desfecho,
          tempoMin: tempoDoLote(lote),
          passadoPor: passados.get(lote.id) ?? null,
          ...(verCustos ? { custo: desfecho === 'CANCELADO' || custoTotalCentavos === null ? null : { totalCentavos: custoTotalCentavos, incompleto: insumosSemPreco > 0 } } : {}),
        };
      });
      return {
        loja,
        hoje,
        periodo,
        filtro: { pessoa, ficha },
        pessoas,
        fichas,
        resumo: resumoDoHistorico(filtrados.map((l) => l.lote)),
        linhas,
        /** Quantos ficaram de fora da tela (o resumo conta todos). */
        foraDaTela: Math.max(0, filtrados.length - LINHAS_NA_TELA),
        cortado,
        verCustos,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type HistoricoDaProducao = NonNullable<Awaited<ReturnType<typeof historicoDaProducao>>>;

/** As opções de um filtro (pessoa ou ficha) que aparecem no período: sem repetir, o nome mais recente, ordem alfabética. */
function opcoes(itens: readonly { id: string; nome: string }[]): { id: string; nome: string }[] {
  const m = new Map<string, string>();
  for (const i of itens) if (!m.has(i.id)) m.set(i.id, i.nome);
  return Array.from(m.entries())
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Os indicadores por pessoa da loja no período (a gerência: `producao.planejar` na loja): lotes, quanto produziu de cada
 * ficha, rendimento médio contra o planejado, fora da faixa, tempo médio, perdidos, cancelados e estornados, sempre com a
 * amostra (`indicadoresPorPessoa`). Sem R$. Também diz quantos lotes concluídos não têm hora de pegar (o tempo deles não
 * existe) e quantos encerrados ficaram sem ninguém.
 */
export async function indicadoresDaProducao(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  lojaId: string,
  filtro: { periodo?: unknown; de?: unknown; ate?: unknown },
  /** Os logins com vínculo com o parceiro (`idsDaEquipe`): quem fez e não está aqui é a FlowFoods, fora das pessoas. */
  equipe: ReadonlySet<string>,
  agora = new Date(),
) {
  const r = await comRecusa(() =>
    cliente.transacao(async (tx) => {
      const loja = await lojaDoAlcance(tx, alcance, lojaId, 'producao.planejar');
      const hoje = hojeNoRio(agora);
      const periodo = lerPeriodoDoHistorico(filtro, hoje);
      const { lotes, cortado } = await lotesEncerrados(tx, lojaId, periodo, equipe);
      const encerrados = lotes.map((l) => l.lote);
      const { pessoas, semPessoa, daFlowFoods } = indicadoresPorPessoa(encerrados);
      const concluidos = encerrados.filter((l) => l.concluidaEm && l.status === 'CONCLUIDA');
      return {
        loja,
        hoje,
        periodo,
        pessoas,
        semPessoa,
        daFlowFoods,
        resumo: resumoDoHistorico(encerrados),
        /** Concluídos por uma pessoa da equipe sem hora de pegar (lote da 3.1, ou concluído direto): entram em tudo, menos no tempo. */
        semHoraDePegar: concluidos.filter((l) => !l.responsavelDesde && l.responsavel).length,
        cortado,
      };
    }),
  );
  return 'ok' in r ? null : r;
}

export type IndicadoresDaProducao = NonNullable<Awaited<ReturnType<typeof indicadoresDaProducao>>>;
