/**
 * Metas e comparação do DRE (2.2b) — a CONTA e as regras de leitura, puras (sem
 * banco e sem Next): ler a meta digitada, comparar o realizado com a meta, e comparar
 * a receita com o mesmo período do ano passado.
 *
 * Decisões 149 a 151:
 *  - a meta é um percentual (pontos-base) da RECEITA BRUTA, de 0 a 100,00 %, com até
 *    duas casas; vazio é "sem meta" e "0" é uma meta (de zero);
 *  - receita bruta e receita por canal não recebem meta: a base é 100 %;
 *  - o desvio é realizado menos meta, em pontos-base; a palavra sai do SENTIDO da linha
 *    ("melhor que a meta" / "pior que a meta"), e menos de 5 pontos-base é "na meta";
 *  - sem cor: o farol e as cores são da 2.4;
 *  - o ano passado só existe na RECEITA, com as mesmas datas menos um ano (29/02 compara
 *    com 28/02), e a variação só aparece quando há dado completo dos dois lados.
 */

import { diasEntre } from './contagem-campos';
import { CHAVE_CMV_COMPRA, CHAVE_CMV_REAL, dividirExato, montarDre, textoDosPontos, type LinhaDoDre } from './dre-campos';
import { SEM_CMV } from './cmv-campos';
import { CODIGO, codigoDoSubtotal, type LinhaDoPlano, type SentidoDaLinha } from './dre-plano';
import type { CanalVenda } from './canal-campos';
import { lerPontosBase } from './unidades';

/** A meta vai de 0 a 100,00 % (pontos-base). */
export const META_MAXIMA_BP = 10_000;

/** Abaixo disto, em pontos-base, o realizado está "na meta" (a tela mostra 0,0 pp). */
export const NA_META_ABAIXO_DE_BP = 5;

/** As linhas em que a base é 100 % (receita bruta e por canal) e as duas de detalhe do CMV (2.3): a meta é da linha CMV. */
const SEM_META_POR_DEFINICAO: ReadonlySet<string> = new Set([codigoDoSubtotal('RECEITA'), CODIGO.receitaLoja, CODIGO.receitaDelivery, CODIGO.receitaIfood, CHAVE_CMV_COMPRA, CHAVE_CMV_REAL]);

/** A linha (pela chave: `codigo` ou `id:<id>`) aceita meta? */
export const aceitaMeta = (chave: string) => !SEM_META_POR_DEFINICAO.has(chave);

/**
 * Na visão de UMA loja, estas duas linhas não mostram meta: a loja não carrega as
 * despesas da rede, então comparar o resultado dela com a meta da rede mentiria.
 */
const SEM_META_NA_LOJA: ReadonlySet<string> = new Set([CODIGO.operacional, CODIGO.resultado]);
export const metaApareceNaLoja = (chave: string) => !SEM_META_NA_LOJA.has(chave);

export const FRASE_DA_META = 'Meta de 0 a 100 %, com até duas casas (ex.: 12,5). Deixe em branco para ficar sem meta.';

export type LeituraDaMeta = { ok: true; bp: number | null } | { ok: false; erro: string };

/**
 * O texto do campo → pontos-base. "12,5" e "12,55 %" valem; vazio é "sem meta" (null); "0" é meta.
 * Negativo, notação científica, letra, terceira casa e mais de 100 % são recusados com frase.
 */
export function lerMetaDigitada(texto: unknown): LeituraDaMeta {
  if (typeof texto !== 'string') return { ok: false, erro: FRASE_DA_META };
  const t = texto.trim();
  if (t === '') return { ok: true, bp: null };
  if (t.length > 12) return { ok: false, erro: FRASE_DA_META };
  const bp = lerPontosBase(t);
  if (bp === null) return { ok: false, erro: FRASE_DA_META };
  if (bp > META_MAXIMA_BP) return { ok: false, erro: 'A meta vai até 100 %.' };
  return { ok: true, bp };
}

/** "25,0 %" · "12,55 %": uma casa, ou duas quando a meta tem. */
export function textoDaMeta(bp: number): string {
  return `${(bp / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`;
}

/** Pontos-base de volta para o campo: 1250 = "12,5"; 3000 = "30". */
export function metaParaCampo(bp: number): string {
  return (bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
}

// ============================================================ realizado × meta

export type PalavraDaMeta = 'melhor que a meta' | 'pior que a meta' | 'na meta';

export interface ComparacaoComMeta {
  metaBp: number;
  /** Meta × receita bruta, um arredondamento. Nulo sem receita. */
  metaCentavos: number | null;
  /** Realizado menos meta, em pontos-base. Nulo quando não há realizado para comparar. */
  desvioBp: number | null;
  /** "+1,0 pp" · "−0,5 pp". */
  desvioTexto: string | null;
  palavra: PalavraDaMeta | null;
  /** Por que não compara ("sem lançamento", "sem faturamento", "sem valor apurado"). */
  semComparacao: string | null;
}

interface LinhaParaComparar {
  valorCentavos: number | null;
  percentualBp: number | null;
  tipo: string;
  sentido: SentidoDaLinha;
}

/**
 * Compara o realizado de uma linha com a meta. Valor nulo (CMV, taxa), receita zero e
 * linha de despesa sem lançamento NÃO comparam: o desvio e a meta em R$ ficam em "—", nunca em zero
 * (ausência de dado não é um resultado bom).
 */
export function compararComMeta(linha: LinhaParaComparar, metaBp: number, receitaBrutaCentavos: number): ComparacaoComMeta {
  const metaCentavos = receitaBrutaCentavos > 0 ? dividirExato(BigInt(metaBp) * BigInt(receitaBrutaCentavos), 10_000n) : null;
  const sem = (motivo: string): ComparacaoComMeta => ({ metaBp, metaCentavos, desvioBp: null, desvioTexto: null, palavra: null, semComparacao: motivo });
  if (receitaBrutaCentavos <= 0) return sem('sem faturamento');
  if (linha.valorCentavos === null || linha.percentualBp === null) return sem('sem valor apurado');
  // Zero numa linha de despesa ou subtotal é "nada lançado"; só o resultado pode fechar em zero de verdade.
  if (linha.valorCentavos === 0 && linha.tipo !== 'resultado') return sem('sem lançamento');
  const desvioBp = linha.percentualBp - metaBp;
  let palavra: PalavraDaMeta = 'na meta';
  if (Math.abs(desvioBp) >= NA_META_ABAIXO_DE_BP) {
    const acima = desvioBp > 0;
    palavra = (linha.sentido === 'MAIOR_MELHOR') === acima ? 'melhor que a meta' : 'pior que a meta';
  }
  return { metaBp, metaCentavos, desvioBp, desvioTexto: textoDosPontos(desvioBp), palavra, semComparacao: null };
}

// ============================================================ ano passado

const ehBissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** A mesma data um ano antes; 29/02 compara com 28/02. */
export function mesmaDataNoAnoPassado(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  const ano = a - 1;
  const dia = m === 2 && d === 29 && !ehBissexto(ano) ? 28 : d;
  return `${String(ano).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export type ChaveDaReceita = 'bruta' | CanalVenda;

export interface LinhaDoAnoPassado {
  chave: ChaveDaReceita;
  atualCentavos: number;
  /** Nulo = nenhum lançamento no ano passado ("sem lançamento", nunca R$ 0,00). */
  anteriorCentavos: number | null;
  /** Variação em pontos-base; nula quando falta dado dos dois lados. */
  variacaoBp: number | null;
}

export interface AnoPassado {
  de: string;
  ate: string;
  /** Dias do recorte do ano passado com algum lançamento no escopo, e quantos dias o recorte tem. */
  diasComLancamento: number;
  diasDoRecorte: number;
  /** A frase que explica por que não há variação (nula quando há). */
  semVariacaoPorque: string | null;
  linhas: LinhaDoAnoPassado[];
}

export interface GraoDoAnoPassado {
  data: string;
  canal: CanalVenda;
  valorCentavos: number;
}

/**
 * Compara a receita do recorte [de, ate] com as mesmas datas um ano antes. A variação em % só sai
 * quando o ano passado tem lançamento em TODOS os dias do recorte e o período atual não tem
 * lançamento faltando; senão ficam os dois números e a razão ("ano passado: 12 de 31 dias").
 */
export function compararComOAnoPassado(entrada: {
  de: string;
  ate: string;
  atual: Record<CanalVenda, number>;
  graosDoAnoPassado: readonly GraoDoAnoPassado[];
  faltasNoPeriodoAtual: number;
}): AnoPassado {
  const de = mesmaDataNoAnoPassado(entrada.de);
  const ate = mesmaDataNoAnoPassado(entrada.ate);
  const diasDoRecorte = ate < de ? 0 : diasEntre(de, ate) + 1;
  const diasComLancamento = new Set(entrada.graosDoAnoPassado.map((g) => g.data)).size;
  const total = diasDoRecorte > 0 && diasComLancamento >= diasDoRecorte;
  const temAlgum = entrada.graosDoAnoPassado.length > 0;
  const antes: Record<CanalVenda, number | null> = { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null };
  for (const g of entrada.graosDoAnoPassado) antes[g.canal] = (antes[g.canal] ?? 0) + g.valorCentavos;
  const bruta = temAlgum ? (antes.LOJA ?? 0) + (antes.DELIVERY_PROPRIO ?? 0) + (antes.IFOOD ?? 0) : null;
  const atualBruta = entrada.atual.LOJA + entrada.atual.DELIVERY_PROPRIO + entrada.atual.IFOOD;

  let semVariacaoPorque: string | null = null;
  if (!temAlgum) semVariacaoPorque = 'Sem lançamento de faturamento no mesmo período do ano passado.';
  else if (!total) semVariacaoPorque = `Ano passado: ${diasComLancamento} de ${diasDoRecorte} dias com lançamento. Sem a cobertura inteira a variação não é justa.`;
  else if (entrada.faltasNoPeriodoAtual > 0) semVariacaoPorque = 'O período de agora tem lançamento de faturamento faltando: a variação sai quando ele estiver completo.';

  const variacao = (atual: number, anterior: number | null): number | null =>
    semVariacaoPorque === null && anterior !== null && anterior > 0 ? dividirExato(BigInt(atual - anterior) * 10_000n, BigInt(anterior)) : null;
  const canais: CanalVenda[] = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'];
  return {
    de,
    ate,
    diasComLancamento,
    diasDoRecorte,
    semVariacaoPorque,
    linhas: [
      { chave: 'bruta', atualCentavos: atualBruta, anteriorCentavos: bruta, variacaoBp: variacao(atualBruta, bruta) },
      ...canais.map((c) => ({ chave: c, atualCentavos: entrada.atual[c], anteriorCentavos: antes[c], variacaoBp: variacao(entrada.atual[c], antes[c]) })),
    ],
  };
}

/** "+12,5 %" · "−3,0 %" (variação da receita, em pontos-base). */
export function textoDaVariacao(bp: number): string {
  const v = (Math.abs(bp) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${bp < 0 ? '−' : '+'}${v} %`;
}

// ============================================================ a tela das metas


export interface LinhaDeMeta {
  chave: string;
  nome: string;
  tipo: LinhaDoDre['tipo'];
  nivel: 0 | 1;
  /** A linha aceita meta? (receita bruta e por canal, não.) */
  aceita: boolean;
  /** A linha está oculta do formulário de despesa (continua no DRE se tem valor). */
  oculta: boolean;
}

/**
 * As linhas do DRE, na ordem em que aparecem, para a tela das metas: a estrutura de um DRE sem
 * nenhum número (todas as linhas do plano, até as ocultas).
 */
export function linhasDeMeta(plano: readonly LinhaDoPlano[]): LinhaDeMeta[] {
  const todasVisiveis = plano.map((l) => ({ ...l, ativa: true }));
  const vazio = montarDre({ escopo: { tipo: 'rede' }, plano: todasVisiveis, receitas: [], taxaIfood: null, despesas: [], cmv: SEM_CMV });
  const oculta = new Map(plano.map((l) => [l.codigo ?? `id:${l.id}`, !l.ativa]));
  return vazio.linhas.filter((l) => l.chave !== CHAVE_CMV_COMPRA && l.chave !== CHAVE_CMV_REAL).map((l) => ({ chave: l.chave, nome: l.nome, tipo: l.tipo, nivel: l.nivel, aceita: aceitaMeta(l.chave), oculta: oculta.get(l.chave) === true }));
}

/**
 * O realizado × meta de cada linha do DRE de um escopo. `metas` = chave → pontos-base (só as que
 * têm meta). Na visão de uma loja, os dois "Resultado" ficam sem meta. Linha sem meta não entra.
 */
export function compararLinhas(
  linhas: readonly LinhaDoDre[],
  metas: ReadonlyMap<string, number>,
  receitaBrutaCentavos: number,
  daLoja: boolean,
): Record<string, ComparacaoComMeta> {
  const out: Record<string, ComparacaoComMeta> = {};
  for (const l of linhas) {
    const bp = metas.get(l.chave);
    if (bp === undefined || !aceitaMeta(l.chave) || (daLoja && !metaApareceNaLoja(l.chave))) continue;
    out[l.chave] = compararComMeta(l, bp, receitaBrutaCentavos);
  }
  return out;
}
