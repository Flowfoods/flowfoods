/**
 * O farol do DRE (2.4) — a regra de QUANDO uma comparação com a meta vira cor, pura (sem banco e sem Next).
 *
 * `compararLinhas` dá o desvio e a faixa que ele sozinho produz. Aqui se decide se o dado FECHA o bastante para
 * o desvio valer uma cor (decisão 175): cor é uma afirmação, e a regra da casa é "sem número é hipótese". Sem cor,
 * a linha mostra o desvio em texto e o MOTIVO por extenso, nunca uma cor:
 *  - a comparação não existe (sem faturamento, sem valor apurado, sem lançamento, ano passado incompleto ou zero);
 *  - falta lançamento de faturamento no escopo (receita baixa infla todo percentual): nenhuma linha daquele escopo tem cor;
 *  - a linha diz "sem contar o CMV de Centro" (margem e resultados sem o maior custo da casa);
 *  - uma despesa que repete todo mês ainda não foi lançada: a linha dela, o grupo e os resultados abaixo não têm cor
 *    (senão o "gastou menos que a meta" seria só uma conta esquecida);
 *  - período fechado antes do farol: a receita é "não apurada neste fechamento".
 * O CMV "pelas compras · parcial" ou "misto" TEM cor: o selo da fonte fica ao lado dele.
 *
 * O farol só existe onde o número nasce: a receita de cada canal tem o dela (crescimento sobre o ano passado);
 * CMV e despesa são da loja, não do canal, e não são rateados (decisão 173).
 */

import type { CanalVenda } from './canal-campos';
import { CODIGO, codigoDoSubtotal, GRUPOS_DE_DESPESA, type GrupoDoDre } from './dre-plano';
import { percentualDaReceita, dividirExato, type LinhaDoDre } from './dre-campos';
import type { AnoPassado, ComparacaoComMeta } from './dre-metas-campos';
import { CORES_DO_FAROL, rotuloDoFarol, VERSAO_DAS_FAIXAS, type CorDoFarol, type EscalaDoFarol } from './farol-campos';

export type FarolDaLinha =
  | {
      tipo: 'cor';
      escala: EscalaDoFarol;
      cor: CorDoFarol;
      posicao: 1 | 2 | 3 | 4 | 5;
      palavra: string;
      /** Só no azul de uma linha em que menos é melhor. */
      confira: string | null;
      desvioTexto: string;
      /** O que o leitor de tela lê: a palavra, o desvio e a casa da régua. */
      rotulo: string;
    }
  | { tipo: 'sem'; motivo: string; desvioTexto: string | null };

export const MOTIVO_DE_ANTES_DO_FAROL = 'não apurado neste fechamento (fechado antes do farol)';
export const MOTIVO_FALTA_FATURAMENTO = 'faltam lançamentos de faturamento';
export const MOTIVO_RECORRENTE = 'falta lançar despesa que repete todo mês';

/** Uma despesa que repete todo mês e ainda não tem o mês lançado. `grupo` nulo = não se sabe qual (fotografia de antes da 2.4). */
export interface RecorrenteSemMes {
  grupo: GrupoDoDre | null;
  linhaId: string | null;
}

export interface EntradaDoFarol {
  linhas: readonly LinhaDoDre[];
  /** A comparação com a meta, por chave (`compararLinhas`): só as linhas com meta. */
  metas: Readonly<Record<string, ComparacaoComMeta>>;
  /** Lançamentos de faturamento faltando no escopo (0 no período fechado: fechar exige tudo lançado). */
  faltasDeFaturamento: number;
  recorrentes: readonly RecorrenteSemMes[];
  /** Período fechado antes do farol (fotografia v1 ou v2): a receita não tem farol e não se recalcula. */
  receitaNaoApurada: boolean;
}

export interface FaixaContada {
  cor: CorDoFarol;
  linhas: { chave: string; nome: string }[];
}

export interface FarolDoDre {
  versaoDasFaixas: number;
  /** Só as linhas com meta (e, no fechado antigo, as de receita). */
  porLinha: Record<string, FarolDaLinha>;
  /** As 5 faixas na ordem, com as linhas que caíram em cada uma. */
  contagem: FaixaContada[];
  /** As linhas com meta que ficaram sem cor, com o motivo. */
  semCor: { chave: string; nome: string; motivo: string }[];
  /** O motivo que tira a cor de TODAS as linhas do escopo, quando existe. */
  motivoGeral: string | null;
}

/** Os resultados na ordem da conta; uma despesa de um grupo mexe nele e em tudo que vem depois. */
const RESULTADOS = [CODIGO.receitaLiquida, CODIGO.margem, CODIGO.operacional, CODIGO.resultado] as const;
const PRIMEIRO_RESULTADO_ATINGIDO: Partial<Record<GrupoDoDre, number>> = {
  DEDUCAO: 0,
  DESPESA_VARIAVEL: 1,
  PESSOAL: 2,
  OCUPACAO: 2,
  UTILIDADES: 2,
  ADMINISTRATIVA: 2,
  MARKETING: 2,
  OUTRAS: 2,
  FINANCEIRA: 3,
};

/** A recorrente em falta atinge esta linha? A dela, o subtotal do grupo e os resultados abaixo. */
function atinge(r: RecorrenteSemMes, l: LinhaDoDre): boolean {
  const resultado = (RESULTADOS as readonly string[]).indexOf(l.chave);
  if (resultado >= 0) return r.grupo === null ? true : resultado >= (PRIMEIRO_RESULTADO_ATINGIDO[r.grupo] ?? 99);
  if (l.tipo === 'subtotal') {
    const grupo = l.codigo?.replace('grupo:', '') as GrupoDoDre | undefined;
    return !!grupo && (r.grupo === null ? GRUPOS_DE_DESPESA.includes(grupo) : grupo === r.grupo);
  }
  if (l.tipo === 'linha' || l.tipo === 'taxa') {
    if (r.grupo === null) return GRUPOS_DE_DESPESA.includes(l.grupo);
    return l.linhaId !== null && l.linhaId === r.linhaId;
  }
  return false;
}

/** O nome da linha na lista de faróis: a receita de um canal precisa dizer que é receita ("Loja" sozinho não diz nada). */
const nomeNoPainel = (l: LinhaDoDre) => (l.tipo === 'receita' ? `Receita · ${l.nome}` : l.nome);

/** Do desvio e do contexto do dado ao farol de cada linha com meta. */
export function farolDoDre(e: EntradaDoFarol): FarolDoDre {
  const porLinha: Record<string, FarolDaLinha> = {};
  const motivoGeral = e.faltasDeFaturamento > 0 ? MOTIVO_FALTA_FATURAMENTO : null;
  for (const l of e.linhas) {
    const c = e.metas[l.chave];
    if (l.tipo === 'receita' || l.chave === codigoDoSubtotal('RECEITA')) {
      if (e.receitaNaoApurada) {
        porLinha[l.chave] = { tipo: 'sem', motivo: MOTIVO_DE_ANTES_DO_FAROL, desvioTexto: null };
        continue;
      }
    }
    if (!c) continue;
    const sem = (motivo: string): FarolDaLinha => ({ tipo: 'sem', motivo, desvioTexto: c.desvioTexto });
    if (motivoGeral) porLinha[l.chave] = sem(motivoGeral);
    else if (!c.faixa || c.desvioTexto === null) porLinha[l.chave] = sem(c.semComparacao ?? 'sem comparação');
    else if (l.semContar.length > 0) porLinha[l.chave] = sem(`sem contar ${l.semContar.join(' e ')}`);
    else if (e.recorrentes.some((r) => atinge(r, l))) porLinha[l.chave] = sem(MOTIVO_RECORRENTE);
    else porLinha[l.chave] = { tipo: 'cor', escala: c.tipo === 'crescimento' ? 'receita' : 'custo', cor: c.faixa.cor, posicao: c.faixa.posicao, palavra: c.faixa.palavra, confira: c.faixa.confira, desvioTexto: c.desvioTexto, rotulo: rotuloDoFarol(c.faixa, c.desvioTexto) };
  }
  const contagem: FaixaContada[] = CORES_DO_FAROL.map((cor) => ({ cor, linhas: [] }));
  const semCor: FarolDoDre['semCor'] = [];
  for (const l of e.linhas) {
    const f = porLinha[l.chave];
    if (!f) continue;
    if (f.tipo === 'cor') contagem.find((x) => x.cor === f.cor)!.linhas.push({ chave: l.chave, nome: nomeNoPainel(l) });
    else if (e.metas[l.chave]) semCor.push({ chave: l.chave, nome: nomeNoPainel(l), motivo: f.motivo });
  }
  return { versaoDasFaixas: VERSAO_DAS_FAIXAS, porLinha, contagem, semCor, motivoGeral };
}

// ============================================================ o painel por canal

const CHAVE_DO_CANAL: Record<CanalVenda, string> = { LOJA: CODIGO.receitaLoja, DELIVERY_PROPRIO: CODIGO.receitaDelivery, IFOOD: CODIGO.receitaIfood };
export const NOME_DO_CANAL: Record<CanalVenda, string> = { LOJA: 'Loja', DELIVERY_PROPRIO: 'Delivery próprio', IFOOD: 'iFood' };
const CANAIS: readonly CanalVenda[] = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'];

export interface CanalDoPeriodo {
  canal: CanalVenda;
  nome: string;
  chave: string;
  receitaCentavos: number;
  /** Participação na receita bruta, em pontos-base. Nulo sem receita. */
  participacaoBp: number | null;
  /** Nulo = pedidos não informados (a casa só digitou o valor). */
  pedidos: number | null;
  ticketCentavos: number | null;
  /** Mesmas datas do ano passado; nulo = nenhum lançamento do canal. */
  anteriorCentavos: number | null;
  variacaoBp: number | null;
  /** A meta de crescimento do canal; nula = sem meta. */
  metaBp: number | null;
  metaCentavos: number | null;
  /** Nulo = sem meta de crescimento (sem farol); sem cor traz o motivo. */
  farol: FarolDaLinha | null;
}

/**
 * Um bloco por canal que o escopo vende: o que vendeu (ou vendia no ano passado, ou está configurado para vender).
 * Pedidos e ticket só quando a casa informou os pedidos; o farol é o do crescimento da receita do canal.
 */
export function canaisDoPeriodo(p: {
  porCanal: Record<CanalVenda, number>;
  receitaBrutaCentavos: number;
  /** Pedidos somados do canal; nulo = ninguém informou. */
  pedidos: Record<CanalVenda, number | null>;
  anoPassado: AnoPassado | null;
  metas: Readonly<Record<string, ComparacaoComMeta>>;
  farol: FarolDoDre;
  /** Os canais em que as lojas do escopo vendem (configuração). */
  vendidos: readonly CanalVenda[];
}): CanalDoPeriodo[] {
  const out: CanalDoPeriodo[] = [];
  for (const canal of CANAIS) {
    const antes = p.anoPassado?.linhas.find((l) => l.chave === canal);
    const vende = p.vendidos.includes(canal) || p.porCanal[canal] > 0 || (antes?.anteriorCentavos ?? 0) > 0;
    if (!vende) continue;
    const chave = CHAVE_DO_CANAL[canal];
    const receita = p.porCanal[canal];
    const pedidos = p.pedidos[canal] !== null && (p.pedidos[canal] ?? 0) > 0 ? p.pedidos[canal] : null;
    const meta = p.metas[chave];
    out.push({
      canal,
      nome: NOME_DO_CANAL[canal],
      chave,
      receitaCentavos: receita,
      participacaoBp: percentualDaReceita(receita, p.receitaBrutaCentavos),
      pedidos,
      ticketCentavos: pedidos !== null && receita > 0 ? dividirExato(BigInt(receita), BigInt(pedidos)) : null,
      anteriorCentavos: antes?.anteriorCentavos ?? null,
      variacaoBp: antes?.variacaoBp ?? null,
      metaBp: meta?.metaBp ?? null,
      metaCentavos: meta?.metaCentavos ?? null,
      farol: p.farol.porLinha[chave] ?? null,
    });
  }
  return out;
}

/** Os pedidos somados por canal; nulo quando nenhuma linha trazia o número. */
export function pedidosPorCanal(receitas: readonly { canal: CanalVenda; pedidos?: number }[]): Record<CanalVenda, number | null> {
  const out: Record<CanalVenda, number | null> = { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null };
  for (const r of receitas) if (r.pedidos !== undefined) out[r.canal] = (out[r.canal] ?? 0) + r.pedidos;
  return out;
}
