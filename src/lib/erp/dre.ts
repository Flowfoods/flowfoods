/**
 * O DRE realizado, ao vivo (2.2a) — a leitura com banco. Junta o que cada
 * módulo já sabe e entrega a `montarDre` (a conta pura):
 *
 *  - o PERÍODO vem de `periodos.ts` (a regra, versionada, e os registrados);
 *  - a RECEITA, só de `faturamentoDosGraos` (a leitura única da 2.1: a
 *    integração vence a digitação) e a FALTA de `faltasDoIntervalo`;
 *  - a taxa do iFood, de `CanalConfig` (de HOJE, estimada);
 *  - as despesas, apropriadas dia a dia ao centavo no recorte apurado;
 *  - o plano, do banco completado pelo padrão (nada é gravado para ler).
 *
 * PARCIAL AO VIVO (decisão 145): o período em curso mostra até ONTEM — hoje
 * está em aberto, como na 2.1 — com as despesas apropriadas por dia (o aluguel
 * de 31 dias no dia 16 entra 15/31), por isso o % de cada linha já é
 * comparável no meio do mês. SEM projeção: ritmo × dias restantes ignora fim
 * de semana e dia de pagamento, e não é honesto.
 *
 * CMV (2.3): em cada loja vale o real (período encerrado, com os dois estoques) ou o de compra, com o selo da fonte;
 * o painel "compra × real" sai do mesmo `CmvDoDre` (ao vivo, ou lido da fotografia v2). A fotografia v1, de antes do
 * CMV, diz "não apurado neste fechamento" e nunca é recalculada.
 *
 * FECHADO (2.2b, decisão 153): o período FECHADO é lido SÓ da fotografia vigente (a conta, a
 * taxa do iFood, a meta e o plano da época); nada é recalculado. Aberto ou em curso é ao vivo, pela
 * mesma leitura (`entradaDoDre`) que o fechamento usa: por isso o fechado bate centavo a centavo.
 *
 * REDE × LOJA (decisão 146): a rede é a soma das lojas mais as despesas da
 * rede e só abre para quem tem a rede inteira; a loja traz só o que é dela
 * (resultado antes das despesas da rede, sem rateio). Quem não tem `dre.ver`
 * não recebe nada daqui.
 */

import { hojeNoRio } from './compra-campos';
import { FRASE_DO_CMV_ANTIGO, SEM_CMV, type CmvDoDre } from './cmv-campos';
import { painelDoCmv, type PainelDoCmv } from './cmv-comparacao';
import { diasEntre, somarDias } from './contagem-campos';
import type { RecorrenteEmFalta } from './despesas';
import { montarDre, type Escopo, type ResultadoDoDre } from './dre-campos';
import { entradaDoDre } from './dre-entrada';
import { dreDaFotografia, metasDasLinhas, type Ressalva } from './dre-fechamento-campos';
import { lerCanaisDaFotografia, lerCmvDaFotografia, lerFotografiaVigente } from './dre-fotografia';
import { metasDoPeriodo } from './dre-metas';
import { conjuntosVigentes, metaTotalDaLoja } from './metas-categorias';
import { compararComOAnoPassado, compararComOAnoPassadoPorLoja, compararLinhas, lerAnoPassadoGuardado, mesmaDataNoAnoPassado, type AnoPassado, type ComparacaoComMeta } from './dre-metas-campos';
import { faixasDaVersao, FAIXAS_DO_FAROL, VERSAO_DAS_FAIXAS } from './farol-campos';
import { canaisDoPeriodo, farolDoDre, pedidosPorCanal, type CanalDoPeriodo, type FarolDoDre, type RecorrenteSemMes } from './farol-dre-campos';
import { CODIGO, codigoDoSubtotal } from './dre-plano';
import { faturamentoDosGraos, lojasDoFaturamento, type LojaDoFaturamento } from './faturamento';
import { PRIMEIRO_DIA_DO_ERP, type Periodo } from './periodo-campos';
import { periodoDe } from './periodos';
import { alcancaLoja, recusa, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';

export type PedidoDoEscopo = { tipo: 'rede' } | { tipo: 'loja'; lojaId: string };

export interface ResumoDaLoja {
  loja: LojaDoFaturamento;
  receitaBrutaCentavos: number;
  resultadoCentavos: number;
  resultadoBp: number | null;
  semContar: string[];
  faltas: number;
}

/** O CMV do período para a tela (2.3): o painel compra × real e se a fotografia é de antes do CMV. */
export interface CmvDoPeriodo {
  /** Só no período encerrado e com a fotografia nova; nulo caso contrário. */
  painel: PainelDoCmv | null;
  /** Fotografia v1: fechada antes do CMV. */
  antigo: boolean;
}

/** O que a tela diz de um período fechado: a fotografia que ela lê (nada mais). */
export interface FechamentoDoPeriodo {
  versao: number;
  /** A fotografia que a tela lê e a versão da conta dela (I.2a: o CMV por categoria só existe a partir da 4). */
  fotografiaId: string;
  versaoDaConta: number;
  fechadoEm: Date;
  fechadoPorNome: string;
  /** As ressalvas que a pessoa pode ver (o gerente de uma loja, só as da loja dele). */
  ressalvas: Ressalva[];
  /** Quantas ressalvas o fechamento tem ao todo; nulo para quem não tem a rede inteira. */
  totalDeRessalvas: number | null;
  /** A justificativa de fechar com ressalvas; só a rede inteira lê. */
  justificativa: string | null;
}

export interface DreDoPeriodo {
  /** Frase quando a data pedida na URL não vale e a tela mostrou o período de hoje (preenchida pela página). */
  avisoDaData?: string | null;
  periodo: Periodo;
  hoje: string;
  /** O último dia que entrou na conta (até ontem no período em curso); nulo = nenhum dia apurado ainda. */
  ate: string | null;
  /** O período contém hoje: o parcial ao vivo. */
  emCurso: boolean;
  /** O período já terminou (todos os dias entram). */
  encerrado: boolean;
  diasDoPeriodo: number;
  /** Em que dia do período hoje cai (1..N); nulo se hoje não está nele. */
  diaDeHoje: number | null;
  /** Dias que entraram na conta (0 se nenhum). */
  diasApurados: number;
  status: 'ABERTO' | 'FECHADO' | null;
  escopo: Escopo;
  resultado: ResultadoDoDre;
  /** Só na visão da rede. */
  porLoja: ResumoDaLoja[] | null;
  faltas: { total: number };
  faltaLancar: RecorrenteEmFalta[];
  taxaConfigurada: boolean;
  anterior: Periodo | null;
  proximo: Periodo | null;
  lojasDoEscopo: LojaDoFaturamento[];
  /** Realizado × meta (2.2b), por chave de linha: só as linhas com meta. Fechado: a meta da época. */
  metas: Record<string, ComparacaoComMeta>;
  /** A receita × o mesmo período do ano passado (2.2b); nulo quando não há dia apurado. */
  anoPassado: AnoPassado | null;
  /** Período FECHADO lido da fotografia; nulo no DRE ao vivo. */
  fechamento: FechamentoDoPeriodo | null;
  /** O painel compra × real (2.3). */
  cmv: CmvDoPeriodo;
  /** O CMV de cada loja do escopo (compra e real), ao vivo ou lido da fotografia; vazio na fotografia de antes do CMV. A I.2b abre o real por categoria daqui. */
  cmvDasLojas: CmvDoDre;
  /** I.2b: na visão de UMA loja ao vivo, de onde vem a meta do CMV dela (a própria, que a loja personalizou, ou a da rede); nulo na rede e no fechado. */
  metaDoCmvDaLoja: 'loja' | 'rede' | null;
  /** I.2b: na visão da rede, as lojas com meta própria do CMV diferente da meta da rede (a rede segue a da rede; elas, a delas). */
  lojasComMetaPropria: { nome: string; bp: number }[];
  /** O farol de cada linha com meta e a contagem por faixa (2.4). Sem `dre.ver` ninguém chega aqui. */
  farol: FarolDoDre;
  /** Um bloco por canal que o escopo vende (2.4). */
  canais: CanalDoPeriodo[];
  /** Período fechado antes do farol (fotografia v1 ou v2): a receita é "não apurada neste fechamento". */
  farolAntigo: boolean;
}

/** A frase da recusa de abrir o DRE do escopo, ou null se pode. Rede: rede inteira. Loja: `dre.ver` na loja. */
export function recusaDoDre(alcance: Alcance, escopo: PedidoDoEscopo): string | null {
  if (escopo.tipo === 'rede') {
    if (alcance.lojas !== 'todas') return 'Só quem tem a rede inteira vê o DRE da rede. Escolha uma loja no topo.';
    return recusa(alcance, 'dre.ver');
  }
  return recusa(alcance, 'dre.ver', { lojaId: escopo.lojaId });
}

const resumoDaLoja = (loja: LojaDoFaturamento, r: ResultadoDoDre, faltas: number): ResumoDaLoja => {
  const fim = r.linhas.find((l) => l.codigo === CODIGO.resultado)!;
  return { loja, receitaBrutaCentavos: r.receitaBrutaCentavos, resultadoCentavos: fim.valorCentavos ?? 0, resultadoBp: fim.percentualBp, semContar: fim.semContar, faltas };
};

/** A receita do recorte × o mesmo recorte um ano antes, no escopo da pessoa. */
async function anoPassadoDe(tx: ClienteDoParceiro, alcance: Alcance, periodo: Periodo, ate: string, r: ResultadoDoDre, faltas: number, lojas: readonly LojaDoFaturamento[], lojaId?: string): Promise<AnoPassado> {
  const graos = await faturamentoDosGraos(tx, alcance, { de: mesmaDataNoAnoPassado(periodo.inicio), ate: mesmaDataNoAnoPassado(ate), lojaId });
  return compararComOAnoPassado({
    de: periodo.inicio,
    ate,
    atual: r.porCanal,
    graosDoAnoPassado: graos.map((g) => ({ data: g.data, canal: g.canal, valorCentavos: g.valorCentavos, lojaId: g.lojaId })),
    faltasNoPeriodoAtual: faltas,
    // A cobertura é POR LOJA: cada loja ativa do escopo precisa ter todos os dias (e cada canal que vende), senão a rede não tem cor.
    lojas,
  });
}

/**
 * O DRE de um período. `data` é qualquer dia dentro dele. Loja fora do alcance, ou sem `dre.ver`:
 * null (a página responde 404/volta ao hub). Não escreve nada.
 *
 * Período FECHADO é lido SÓ da fotografia vigente (nome, taxa, meta e plano da época, nada
 * recalculado). Aberto ou em curso é ao vivo, pela MESMA leitura (`entradaDoDre`) que o fechamento usa.
 */
export async function dreDoPeriodo(cliente: ClienteDoParceiro, alcance: Alcance, pedido: PedidoDoEscopo, data: string, hoje = hojeNoRio()): Promise<DreDoPeriodo | null> {
  if (recusaDoDre(alcance, pedido)) return null;
  if (pedido.tipo === 'loja' && !alcancaLoja(alcance, pedido.lojaId)) return null;
  return cliente.transacao((tx) => dreDoPeriodoNaTx(tx, alcance, pedido, data, hoje));
}

/**
 * O mesmo DRE dentro de uma transação que a pessoa que chama já abriu (I.2a): o painel de CMV por categoria lê o DRE e as compras
 * por categoria no MESMO instante, para a soma das categorias bater com a linha do CMV ao centavo. Mesmas recusas.
 */
export async function dreDoPeriodoNaTx(tx: ClienteDoParceiro, alcance: Alcance, pedido: PedidoDoEscopo, data: string, hoje = hojeNoRio()): Promise<DreDoPeriodo | null> {
  if (recusaDoDre(alcance, pedido)) return null;
  if (pedido.tipo === 'loja' && !alcancaLoja(alcance, pedido.lojaId)) return null;
  const todas = await lojasDoFaturamento(tx, alcance);
  const lojaPedida = pedido.tipo === 'loja' ? todas.find((l) => l.id === pedido.lojaId) : undefined;
  if (pedido.tipo === 'loja' && !lojaPedida) return null;

  const periodo = await periodoDe(tx, data > hoje ? hoje : data);
  const ontem = somarDias(hoje, -1);
  const emCurso = periodo.inicio <= hoje && hoje <= periodo.fim;
  const encerrado = periodo.fim < hoje;
  const ate = encerrado ? periodo.fim : ontem >= periodo.inicio ? (ontem < periodo.fim ? ontem : periodo.fim) : null;
  const escopo: Escopo = pedido.tipo === 'rede' ? { tipo: 'rede' } : { tipo: 'loja', lojaId: pedido.lojaId, nome: lojaPedida!.nome };
  const lojasDoEscopo = pedido.tipo === 'rede' ? todas : [lojaPedida!];
  const lojaId = pedido.tipo === 'loja' ? pedido.lojaId : undefined;
  const daLoja = pedido.tipo === 'loja';
  const anterior = periodo.inicio > PRIMEIRO_DIA_DO_ERP ? await periodoDe(tx, somarDias(periodo.inicio, -1)) : null;
  const proximo = encerrado ? await periodoDe(tx, somarDias(periodo.fim, 1)) : null;
  const registro = await tx.periodoApuracao.findFirst({ where: { inicio: new Date(`${periodo.inicio}T00:00:00.000Z`), fim: new Date(`${periodo.fim}T00:00:00.000Z`) }, select: { id: true, status: true } });
  const diasDoPeriodo = diasEntre(periodo.inicio, periodo.fim) + 1;

  // ---- fechado: só a fotografia
  if (registro?.status === 'FECHADO') {
    const foto = await lerFotografiaVigente(tx, alcance, registro.id);
    if (foto) {
      const doEscopo = foto.linhas.filter((l) => l.lojaId === (pedido.tipo === 'loja' ? pedido.lojaId : null));
      if (doEscopo.length === 0) return null;
      const antigo = foto.versaoDaConta < 2;
      const farolAntigo = foto.versaoDaConta < 3;
      const lida = dreDaFotografia(doEscopo, escopo);
      // Fotografia de antes do CMV guardou "Em breve": hoje a tela diz a verdade, sem inventar número.
      const resultado = antigo ? { ...lida, linhas: lida.linhas.map((l) => (l.tipo === 'cmv' ? { ...l, nota: FRASE_DO_CMV_ANTIGO } : l)) } : lida;
      // A visão de UMA loja recebe só aquela loja (o alcance pode ter outras): o painel do fechado é igual ao do ao vivo.
      const cmvFoto = antigo ? null : await lerCmvDaFotografia(tx, pedido.tipo === 'loja' ? { lojas: [pedido.lojaId] } : alcance, foto.id);
      const receitaFoto = (id: string) => Number(foto.linhas.find((l) => l.lojaId === id && l.chave === codigoDoSubtotal('RECEITA'))?.valorCentavos ?? 0);
      let porLoja: ResumoDaLoja[] | null = null;
      if (pedido.tipo === 'rede') {
        const ids = Array.from(new Set(foto.linhas.filter((l) => l.lojaId !== null).map((l) => l.lojaId!)));
        porLoja = ids.map((id) => {
          const linhas = foto.linhas.filter((l) => l.lojaId === id);
          const loja = todas.find((x) => x.id === id) ?? { id, nome: linhas[0].lojaNome ?? '', ativa: true, canais: [] };
          // O nome é o da época da fotografia.
          return resumoDaLoja({ ...loja, nome: linhas[0].lojaNome ?? loja.nome }, dreDaFotografia(linhas, { tipo: 'loja', lojaId: id, nome: linhas[0].lojaNome ?? '' }), 0);
        });
      }
      // Fotografia v3 (2.4): o ano passado, a cobertura por loja, os pedidos e a versão das faixas saem SÓ dela (editar o faturamento de um
      // período antigo depois não muda o fechado). As lojas que a pessoa alcança; na visão de UMA loja, só aquela.
      const lojasLidas = pedido.tipo === 'loja' ? { lojas: [pedido.lojaId] } : alcance;
      const canaisFoto = farolAntigo ? null : await lerCanaisDaFotografia(tx, lojasLidas, foto.id);
      const guardado = canaisFoto ? lerAnoPassadoGuardado(canaisFoto.anoPassado, lojasLidas.lojas) : null;
      const anoPassado = guardado
        ? compararComOAnoPassadoPorLoja({ de: periodo.inicio, ate: periodo.fim, atual: resultado.porCanal, lojas: guardado, faltasNoPeriodoAtual: 0 })
        : await anoPassadoDe(tx, alcance, periodo, periodo.fim, resultado, 0, lojasDoEscopo, lojaId); // v1 e v2: o painel de 2.2b segue lendo ao vivo (herança), mas SEM farol
      // A versão das faixas é a que a fotografia gravou (v1 e v2: a 1, a única que existia); versão que não conhecemos não vira cor.
      const versaoDasFaixas = farolAntigo ? 1 : canaisFoto?.versaoDasFaixas ?? VERSAO_DAS_FAIXAS;
      const faixas = faixasDaVersao(versaoDasFaixas);
      const metas = compararLinhas(resultado.linhas, metasDasLinhas(doEscopo), resultado.receitaBrutaCentavos, daLoja, farolAntigo ? null : anoPassado, faixas ?? FAIXAS_DO_FAROL);
      const doEscopoDasRessalvas = foto.ressalvas.filter((r) => pedido.tipo === 'rede' || r.lojaId === pedido.lojaId);
      const recorrentes: RecorrenteSemMes[] = doEscopoDasRessalvas.filter((r) => r.tipo === 'RECORRENTE').map((r) => ({ grupo: r.grupo ?? null, linhaId: r.linhaId ?? null }));
      // Loja que fechou sem nenhum lançamento de faturamento (ressalva confirmada): a receita do escopo que a contém é incompleta, e não tem cor.
      const lojasSemLancamento = doEscopoDasRessalvas.filter((r) => r.tipo === 'LOJA_SEM_LANCAMENTO').length;
      const farol = farolDoDre({ linhas: resultado.linhas, metas, faltasDeFaturamento: lojasSemLancamento, recorrentes, receitaNaoApurada: farolAntigo, versaoDasFaixas, faixasDesconhecidas: faixas === null });
      return {
        periodo,
        hoje,
        ate: periodo.fim,
        emCurso: false,
        encerrado: true,
        diasDoPeriodo,
        diaDeHoje: null,
        diasApurados: diasDoPeriodo,
        status: 'FECHADO',
        escopo,
        resultado,
        porLoja,
        faltas: { total: 0 },
        faltaLancar: [],
        taxaConfigurada: foto.taxa !== null,
        anterior,
        proximo,
        lojasDoEscopo,
        metas,
        anoPassado,
        cmv: { antigo, painel: cmvFoto ? painelDoCmv(cmvFoto, receitaFoto) : null },
        cmvDasLojas: cmvFoto ?? SEM_CMV,
        metaDoCmvDaLoja: null,
        lojasComMetaPropria: pedido.tipo === 'rede' ? lojasComMetaPropriaDaFotografia(foto.linhas) : [],
        fechamento: { versao: foto.versao, fotografiaId: foto.id, versaoDaConta: foto.versaoDaConta, fechadoEm: foto.criadoEm, fechadoPorNome: foto.fechadoPorNome, ressalvas: foto.ressalvas, totalDeRessalvas: foto.totalDeRessalvas, justificativa: foto.justificativa },
        farol,
        // No fechado só entra o canal com receita (ou ano passado): a configuração de hoje não reescreve o passado.
        canais: canaisDoPeriodo({ porCanal: resultado.porCanal, receitaBrutaCentavos: resultado.receitaBrutaCentavos, pedidos: pedidosPorCanal(canaisFoto?.receitas ?? []), anoPassado: farolAntigo ? null : anoPassado, metas, farol, vendidos: [] }),
        farolAntigo,
      } satisfies DreDoPeriodo;
    }
  }

  // ---- ao vivo
  const leitura = await entradaDoDre(tx, alcance, periodo, ate, { hoje, lojaId });
  const metas = await metasDoPeriodo(tx, leitura.plano, periodo.inicio);
  // I.2b: a loja que personalizou a meta TOTAL do CMV a tem na linha CMV do DRE dela (e no orçamento); a rede segue a meta da rede.
  const metaDaRede = metas.get(CODIGO.cmv) ?? null;
  const vigentes = await conjuntosVigentes(tx, lojasDoEscopo.map((l) => l.id), periodo.inicio);
  const metaDoCmvDaLoja = pedido.tipo === 'loja' ? metaTotalDaLoja(vigentes, pedido.lojaId, metaDaRede) : null;
  if (metaDoCmvDaLoja?.origem === 'loja') metas.set(CODIGO.cmv, metaDoCmvDaLoja.bp!);
  const lojasComMetaPropria =
    pedido.tipo === 'rede'
      ? lojasDoEscopo.flatMap((l) => {
          const t = metaTotalDaLoja(vigentes, l.id, metaDaRede);
          return t.origem === 'loja' && t.bp !== null && t.bp !== metaDaRede ? [{ nome: l.nome, bp: t.bp }] : [];
        })
      : [];
  const entrada = (e: Escopo) => ({ escopo: e, plano: leitura.plano, receitas: leitura.receitas, taxaIfood: leitura.taxaIfood, despesas: leitura.despesas, cmv: leitura.cmv });
  const resultado = montarDre(entrada(escopo));

  let porLoja: ResumoDaLoja[] | null = null;
  if (pedido.tipo === 'rede') {
    const faltasDe = new Map(leitura.faltas.porLoja.map((f) => [f.loja.id, f.faltas]));
    porLoja = lojasDoEscopo
      .map((loja) => resumoDaLoja(loja, montarDre(entrada({ tipo: 'loja', lojaId: loja.id, nome: loja.nome })), faltasDe.get(loja.id) ?? 0))
      // Loja desativada sem nada no período não é linha: só pesa quem vendeu ou lançou.
      .filter((l) => l.loja.ativa || l.receitaBrutaCentavos !== 0 || l.resultadoCentavos !== 0);
  }

  const anoPassado = ate ? await anoPassadoDe(tx, alcance, periodo, ate, resultado, leitura.faltas.total, lojasDoEscopo, lojaId) : null;
  const metasComparadas = compararLinhas(resultado.linhas, metas, resultado.receitaBrutaCentavos, daLoja, anoPassado);
  // A loja só cobra o que é dela; a rede, tudo (inclusive a despesa sem loja).
  const faltaLancarDoEscopo = pedido.tipo === 'rede' ? leitura.faltaLancar : leitura.faltaLancar.filter((f) => f.lojaId === pedido.lojaId);
  const farol = farolDoDre({
    linhas: resultado.linhas,
    metas: metasComparadas,
    faltasDeFaturamento: leitura.faltas.total,
    recorrentes: faltaLancarDoEscopo.map((f) => ({ grupo: f.grupo, linhaId: f.linhaId })),
    receitaNaoApurada: false,
  });
  return {
    periodo,
    hoje,
    ate,
    emCurso,
    encerrado,
    diasDoPeriodo,
    diaDeHoje: emCurso ? diasEntre(periodo.inicio, hoje) + 1 : null,
    diasApurados: ate ? diasEntre(periodo.inicio, ate) + 1 : 0,
    status: registro?.status ?? null,
    escopo,
    resultado,
    porLoja,
    faltas: { total: leitura.faltas.total },
    faltaLancar: faltaLancarDoEscopo,
    taxaConfigurada: leitura.taxaIfood !== null,
    anterior,
    proximo,
    lojasDoEscopo,
    metas: metasComparadas,
    anoPassado,
    fechamento: null,
    cmvDasLojas: leitura.cmv,
    metaDoCmvDaLoja: metaDoCmvDaLoja?.origem ?? null,
    lojasComMetaPropria,
    cmv: { antigo: false, painel: encerrado ? painelDoCmv(leitura.cmv, (id) => leitura.receitas.filter((r) => r.lojaId === id).reduce((t, r) => t + r.valorCentavos, 0)) : null },
    farol,
    canais: canaisDoPeriodo({
      porCanal: resultado.porCanal,
      receitaBrutaCentavos: resultado.receitaBrutaCentavos,
      pedidos: pedidosPorCanal(leitura.receitas.filter((r) => pedido.tipo === 'rede' || r.lojaId === pedido.lojaId)),
      anoPassado,
      metas: metasComparadas,
      farol,
      vendidos: Array.from(new Set(lojasDoEscopo.flatMap((l) => l.canais))),
    }),
    farolAntigo: false,
  } satisfies DreDoPeriodo;

}

/** Fechado: as lojas cuja linha CMV foi fotografada com meta diferente da da rede (a rede segue a da rede; elas, a delas). */
function lojasComMetaPropriaDaFotografia(linhas: readonly { lojaId: string | null; lojaNome: string | null; chave: string; metaBp: number | null }[]): { nome: string; bp: number }[] {
  const rede = linhas.find((l) => l.lojaId === null && l.chave === CODIGO.cmv)?.metaBp ?? null;
  return linhas
    .filter((l) => l.lojaId !== null && l.chave === CODIGO.cmv && l.metaBp !== null && l.metaBp !== rede)
    .map((l) => ({ nome: l.lojaNome ?? '', bp: l.metaBp! }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
