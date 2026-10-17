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
import { diasEntre, somarDias } from './contagem-campos';
import type { RecorrenteEmFalta } from './despesas';
import { montarDre, type Escopo, type ResultadoDoDre } from './dre-campos';
import { entradaDoDre } from './dre-entrada';
import { dreDaFotografia, metasDasLinhas, type Ressalva } from './dre-fechamento-campos';
import { lerFotografiaVigente } from './dre-fotografia';
import { metasDoPeriodo } from './dre-metas';
import { compararComOAnoPassado, compararLinhas, mesmaDataNoAnoPassado, type AnoPassado, type ComparacaoComMeta } from './dre-metas-campos';
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

/** O que a tela diz de um período fechado: a fotografia que ela lê (nada mais). */
export interface FechamentoDoPeriodo {
  versao: number;
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
async function anoPassadoDe(tx: ClienteDoParceiro, alcance: Alcance, periodo: Periodo, ate: string, r: ResultadoDoDre, faltas: number, lojaId?: string): Promise<AnoPassado> {
  const graos = await faturamentoDosGraos(tx, alcance, { de: mesmaDataNoAnoPassado(periodo.inicio), ate: mesmaDataNoAnoPassado(ate), lojaId });
  return compararComOAnoPassado({
    de: periodo.inicio,
    ate,
    atual: r.porCanal,
    graosDoAnoPassado: graos.map((g) => ({ data: g.data, canal: g.canal, valorCentavos: g.valorCentavos })),
    faltasNoPeriodoAtual: faltas,
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
  return cliente.transacao(async (tx) => {
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
        const resultado = dreDaFotografia(doEscopo, escopo);
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
          metas: compararLinhas(resultado.linhas, metasDasLinhas(doEscopo), resultado.receitaBrutaCentavos, daLoja),
          anoPassado: await anoPassadoDe(tx, alcance, periodo, periodo.fim, resultado, 0, lojaId),
          fechamento: { versao: foto.versao, fechadoEm: foto.criadoEm, fechadoPorNome: foto.fechadoPorNome, ressalvas: foto.ressalvas, totalDeRessalvas: foto.totalDeRessalvas, justificativa: foto.justificativa },
        } satisfies DreDoPeriodo;
      }
    }

    // ---- ao vivo
    const leitura = await entradaDoDre(tx, alcance, periodo, ate, { hoje, lojaId });
    const metas = await metasDoPeriodo(tx, leitura.plano, periodo.inicio);
    const entrada = (e: Escopo) => ({ escopo: e, plano: leitura.plano, receitas: leitura.receitas, taxaIfood: leitura.taxaIfood, despesas: leitura.despesas });
    const resultado = montarDre(entrada(escopo));

    let porLoja: ResumoDaLoja[] | null = null;
    if (pedido.tipo === 'rede') {
      const faltasDe = new Map(leitura.faltas.porLoja.map((f) => [f.loja.id, f.faltas]));
      porLoja = lojasDoEscopo
        .map((loja) => resumoDaLoja(loja, montarDre(entrada({ tipo: 'loja', lojaId: loja.id, nome: loja.nome })), faltasDe.get(loja.id) ?? 0))
        // Loja desativada sem nada no período não é linha: só pesa quem vendeu ou lançou.
        .filter((l) => l.loja.ativa || l.receitaBrutaCentavos !== 0 || l.resultadoCentavos !== 0);
    }

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
      // A loja só cobra o que é dela; a rede, tudo (inclusive a despesa sem loja).
      faltaLancar: pedido.tipo === 'rede' ? leitura.faltaLancar : leitura.faltaLancar.filter((f) => f.lojaId === pedido.lojaId),
      taxaConfigurada: leitura.taxaIfood !== null,
      anterior,
      proximo,
      lojasDoEscopo,
      metas: compararLinhas(resultado.linhas, metas, resultado.receitaBrutaCentavos, daLoja),
      anoPassado: ate ? await anoPassadoDe(tx, alcance, periodo, ate, resultado, leitura.faltas.total, lojaId) : null,
      fechamento: null,
    } satisfies DreDoPeriodo;
  });
}
