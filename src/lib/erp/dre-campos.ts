/**
 * O DRE realizado (2.2a) — a CONTA, pura (sem banco e sem Next): recebe o que
 * o banco leu (receita por loja e canal, a taxa do iFood, as despesas já
 * apropriadas ao recorte, o plano) e devolve as linhas do DRE na ordem fixa
 * (ver `dre-plano.ts`). Os mesmos números alimentam a tela da rede e a da loja.
 *
 * Regras que a conta cumpre (decisões 136, 142, 143, 145, 146):
 *  - o % de toda linha é sobre a RECEITA BRUTA; receita zero é "sem faturamento",
 *    nunca 0 % nem divisão por zero;
 *  - a taxa do iFood é ESTIMADA: faturamento do iFood × (comissão + pagamento)
 *    da configuração de HOJE, por loja, com um arredondamento só (metade para
 *    cima) em cada loja; sem a configuração a linha é "falta configurar a taxa"
 *    (nunca R$ 0,00) e a receita líquida e os resultados saem com o selo
 *    "sem contar a taxa do iFood";
 *  - o CMV (2.3) é o que vale em cada loja: o real quando apurado, senão o de compra, com o selo da fonte
 *    (`cmv-campos.ts`); ele é SUBTRAÍDO da receita líquida na margem de contribuição e dali segue para os resultados; loja
 *    sem nota e sem real é NULA e margem e resultados saem "sem contar o CMV de <lojas>" (um
 *    resultado sem o maior custo da casa não é o resultado: é o que dá para dizer hoje); abaixo da linha
 *    vão as duas de detalhe, `cmv:compra` e `cmv:real` (fora do plano de contas: sem meta e sem despesa);
 *  - a rede é a soma das lojas + as despesas da rede (sem loja); a visão de uma
 *    loja traz só o que é dela, sem rateio da rede (decisão 141).
 */

import type { CanalVenda } from './canal-campos';
import { cmvDoEscopo, type CmvDoDre } from './cmv-campos';
import { CANAIS_EM_ORDEM } from './faturamento-campos';
import {
  CODIGO,
  codigoDoSubtotal,
  GRUPOS_ANTES_DA_MARGEM,
  GRUPOS_ANTES_DO_OPERACIONAL,
  ROTULO_DO_GRUPO,
  type GrupoDoDre,
  type LinhaDoPlano,
  type SentidoDaLinha,
} from './dre-plano';

export type Escopo = { tipo: 'rede' } | { tipo: 'loja'; lojaId: string; nome: string };

export interface ReceitaLida {
  lojaId: string;
  canal: CanalVenda;
  valorCentavos: number;
  /** Pedidos do canal no recorte (2.4, para o ticket do painel). Ausente nas fotografias de antes da v3. */
  pedidos?: number;
}

export interface DespesaApropriada {
  linhaId: string;
  /** Nulo = despesa da rede. */
  lojaId: string | null;
  /** O que cabe no recorte apurado, em centavos. */
  centavos: number;
}

export interface TaxaDoIfood {
  comissaoBp: number;
  pagamentoBp: number;
}

export interface EntradaDoDre {
  escopo: Escopo;
  plano: readonly LinhaDoPlano[];
  receitas: readonly ReceitaLida[];
  /** Nulo = a taxa do iFood não foi configurada. */
  taxaIfood: TaxaDoIfood | null;
  despesas: readonly DespesaApropriada[];
  /** O CMV de cada loja (2.3): compra e real. Sem lojas = nenhum CMV (tudo "sem nota de compra"). */
  cmv: CmvDoDre;
}

export type TipoDaLinha = 'receita' | 'taxa' | 'linha' | 'subtotal' | 'cmv' | 'resultado';

export interface LinhaDoDre {
  /** Código do padrão, ou `id:<id>` de linha da casa: serve de chave na tela. */
  chave: string;
  codigo: string | null;
  linhaId: string | null;
  nome: string;
  grupo: GrupoDoDre;
  /** Para que lado o desvio da meta é bom (2.2b): receita e resultados, maior; custo e despesa, menor. */
  sentido: SentidoDaLinha;
  tipo: TipoDaLinha;
  /** Recuo na tabela: 0 = linha de grupo ou resultado, 1 = linha dentro do grupo. */
  nivel: 0 | 1;
  /** Nulo = não dá para calcular (CMV sem nota nem estoque, taxa sem configuração). Zero numa linha de despesa é "sem lançamento". */
  valorCentavos: number | null;
  /** Pontos-base da receita bruta; nulo se não há receita ou não há valor. */
  percentualBp: number | null;
  /** O que ficou de fora e o leitor precisa saber ("o CMV", "a taxa do iFood"). */
  semContar: string[];
  /** Frase curta ao lado do valor ("falta configurar a taxa", o selo da fonte do CMV). */
  nota: string | null;
  oculta: boolean;
}

export interface ResultadoDoDre {
  escopo: Escopo;
  receitaBrutaCentavos: number;
  /** Receita bruta zero: o DRE diz "sem faturamento" no lugar dos percentuais. */
  semFaturamento: boolean;
  porCanal: Record<CanalVenda, number>;
  /** Há receita no iFood mas a taxa não foi configurada. */
  faltaConfigurarTaxa: boolean;
  linhas: LinhaDoDre[];
}

const SEM_TAXA = 'a taxa do iFood';

/** As duas linhas de detalhe do CMV: não são do plano de contas (ninguém lança despesa nelas e não têm meta). */
export const CHAVE_CMV_COMPRA = 'cmv:compra';
export const CHAVE_CMV_REAL = 'cmv:real';

/** Divisão inteira com arredondamento metade para cima, exata (BigInt), para numerador qualquer e denominador positivo. */
export function dividirExato(num: bigint, den: bigint): number {
  const negativo = num < 0n;
  const abs = negativo ? -num : num;
  const q = (2n * abs + den) / (2n * den);
  return Number(negativo ? -q : q);
}

/** Pontos-base da receita bruta: valor × 10.000 ÷ receita, um arredondamento. Nulo sem receita. */
export function percentualDaReceita(valorCentavos: number, receitaBrutaCentavos: number): number | null {
  if (receitaBrutaCentavos <= 0) return null;
  return dividirExato(BigInt(valorCentavos) * 10_000n, BigInt(receitaBrutaCentavos));
}

/** A taxa do iFood de UMA loja: faturamento × (comissão + pagamento) ÷ 10.000, um arredondamento. */
export function taxaDoIfoodDaLoja(receitaIfoodCentavos: number, taxa: TaxaDoIfood): number {
  return dividirExato(BigInt(receitaIfoodCentavos) * BigInt(taxa.comissaoBp + taxa.pagamentoBp), 10_000n);
}

/** "26,0 %" a partir de pontos-base (uma casa). */
export function textoDoPercentual(bp: number): string {
  return `${(bp / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}\u00a0%`;
}

/** "+1,0 pp" / "−0,5 pp" (diferença entre dois percentuais, em pontos-base). */
export function textoDosPontos(bp: number): string {
  const v = (Math.abs(bp) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${bp < 0 ? '−' : '+'}${v}\u00a0pp`;
}

/** O que ficou de fora de um resultado: a taxa primeiro, depois o CMV (inteiro, ou só de algumas lojas: "o CMV de Centro"). */
const unir = (...listas: readonly (readonly string[])[]) => {
  const s = new Set(listas.flat());
  return [...(s.has(SEM_TAXA) ? [SEM_TAXA] : []), ...Array.from(s).filter((x) => x !== SEM_TAXA)];
};

/** O DRE de um escopo (a rede toda, ou uma loja). */
export function montarDre(e: EntradaDoDre): ResultadoDoDre {
  const doEscopo = (lojaId: string | null) => (e.escopo.tipo === 'rede' ? true : lojaId === e.escopo.lojaId);
  const receitas = e.receitas.filter((r) => doEscopo(r.lojaId));
  const porCanal: Record<CanalVenda, number> = { LOJA: 0, DELIVERY_PROPRIO: 0, IFOOD: 0 };
  for (const r of receitas) porCanal[r.canal] += r.valorCentavos;
  const bruta = porCanal.LOJA + porCanal.DELIVERY_PROPRIO + porCanal.IFOOD;

  // Taxa do iFood: por loja, um arredondamento em cada uma; a rede é a soma.
  const ifoodPorLoja = new Map<string, number>();
  for (const r of receitas) if (r.canal === 'IFOOD') ifoodPorLoja.set(r.lojaId, (ifoodPorLoja.get(r.lojaId) ?? 0) + r.valorCentavos);
  const haIfood = porCanal.IFOOD > 0;
  const faltaTaxa = haIfood && e.taxaIfood === null;
  const taxa: number | null = e.taxaIfood ? Array.from(ifoodPorLoja.values()).reduce((s, v) => s + taxaDoIfoodDaLoja(v, e.taxaIfood!), 0) : haIfood ? null : 0;

  const despesaDaLinha = new Map<string, number>();
  for (const d of e.despesas) if (doEscopo(d.lojaId)) despesaDaLinha.set(d.linhaId, (despesaDaLinha.get(d.linhaId) ?? 0) + d.centavos);
  const valorDe = (l: LinhaDoPlano) => (l.id ? despesaDaLinha.get(l.id) ?? 0 : 0);

  const linhas: LinhaDoDre[] = [];
  const pct = (v: number | null) => (v === null ? null : percentualDaReceita(v, bruta));
  const empurrar = (l: Omit<LinhaDoDre, 'percentualBp' | 'oculta'> & { oculta?: boolean }) => linhas.push({ oculta: false, ...l, percentualBp: pct(l.valorCentavos) });
  const doPlano = (codigo: string) => e.plano.find((l) => l.codigo === codigo)!;
  const linhaPlano = (l: LinhaDoPlano) => ({ chave: l.codigo ?? `id:${l.id}`, codigo: l.codigo, linhaId: l.id, nome: l.nome, grupo: l.grupo, sentido: l.sentido });

  /** As linhas lançáveis de um grupo, as com valor e (se a casa não as ocultou) as sem. */
  const lancaveis = (g: GrupoDoDre) => e.plano.filter((l) => l.grupo === g && !l.calculada && (l.ativa || valorDe(l) > 0));
  const somaDoGrupo = (g: GrupoDoDre) => lancaveis(g).reduce((s, l) => s + valorDe(l), 0);

  // --- Receita
  const nomeDoCanal: Record<CanalVenda, string> = { LOJA: CODIGO.receitaLoja, DELIVERY_PROPRIO: CODIGO.receitaDelivery, IFOOD: CODIGO.receitaIfood };
  const subtotalDe = (g: GrupoDoDre) => ({ ...linhaPlano(doPlano(codigoDoSubtotal(g))), nome: ROTULO_DO_GRUPO[g] });
  empurrar({ ...subtotalDe('RECEITA'), tipo: 'subtotal', nivel: 0, valorCentavos: bruta, semContar: [], nota: bruta === 0 ? 'sem faturamento' : null });
  for (const c of CANAIS_EM_ORDEM) {
    empurrar({ ...linhaPlano(doPlano(nomeDoCanal[c])), tipo: 'receita', nivel: 1, valorCentavos: porCanal[c], semContar: [], nota: null });
  }

  // --- Deduções
  const manuaisDeducao = somaDoGrupo('DEDUCAO');
  const semTaxa = faltaTaxa ? [SEM_TAXA] : [];
  const deducoes = taxa === null ? manuaisDeducao : manuaisDeducao + taxa;
  empurrar({ ...subtotalDe('DEDUCAO'), tipo: 'subtotal', nivel: 0, valorCentavos: deducoes, semContar: semTaxa, nota: null });
  empurrar({
    ...linhaPlano(doPlano(CODIGO.taxasIfood)),
    tipo: 'taxa',
    nivel: 1,
    valorCentavos: taxa,
    semContar: [],
    nota: faltaTaxa ? 'falta configurar a taxa' : taxa ? 'estimada pela taxa configurada' : null,
  });
  for (const l of lancaveis('DEDUCAO')) empurrar({ ...linhaPlano(l), tipo: 'linha', nivel: 1, valorCentavos: valorDe(l), semContar: [], nota: l.ativa ? null : 'oculta', oculta: !l.ativa });

  const liquida = bruta - deducoes;
  empurrar({ ...linhaPlano(doPlano(CODIGO.receitaLiquida)), tipo: 'resultado', nivel: 0, valorCentavos: liquida, semContar: unir(semTaxa), nota: null });

  // --- CMV (2.3): o que vale em cada loja, e abaixo as duas leituras (compra e real)
  const receitaDaLoja = (id: string) => e.receitas.filter((r) => r.lojaId === id).reduce((s, r) => s + r.valorCentavos, 0);
  const cmv = cmvDoEscopo(e.cmv, e.escopo.tipo === 'rede' ? { tipo: 'rede' } : { tipo: 'loja', lojaId: e.escopo.lojaId }, receitaDaLoja);
  empurrar({ ...linhaPlano(doPlano(CODIGO.cmv)), tipo: 'cmv', nivel: 0, valorCentavos: cmv.centavos, semContar: [], nota: cmv.nota });
  const detalheDoCmv = { codigo: null, linhaId: null, grupo: 'CMV' as const, sentido: 'MENOR_MELHOR' as const, tipo: 'linha' as const, nivel: 1 as const, semContar: [] as string[] };
  empurrar({ ...detalheDoCmv, chave: CHAVE_CMV_COMPRA, nome: 'Pelas compras (data da nota)', valorCentavos: cmv.compra.centavos, nota: cmv.compra.nota });
  empurrar({ ...detalheDoCmv, chave: CHAVE_CMV_REAL, nome: 'Real (contagem)', valorCentavos: cmv.real.centavos, nota: cmv.real.nota });

  // --- Variáveis → margem de contribuição
  const bloco = (g: GrupoDoDre) => {
    const soma = somaDoGrupo(g);
    empurrar({ ...subtotalDe(g), tipo: 'subtotal', nivel: 0, valorCentavos: soma, semContar: [], nota: null });
    for (const l of lancaveis(g)) empurrar({ ...linhaPlano(l), tipo: 'linha', nivel: 1, valorCentavos: valorDe(l), semContar: [], nota: l.ativa ? null : 'oculta', oculta: !l.ativa });
    return soma;
  };
  const variaveis = GRUPOS_ANTES_DA_MARGEM.reduce((s, g) => s + bloco(g), 0);
  // A margem de contribuição é a receita líquida MENOS o CMV (o que vale em cada loja) menos as variáveis. Loja sem CMV não entra na conta: o aviso diz quais.
  const margem = liquida - (cmv.centavos ?? 0) - variaveis;
  const semAteAqui = unir(semTaxa, cmv.semTexto ? [cmv.semTexto] : []);
  empurrar({ ...linhaPlano(doPlano(CODIGO.margem)), tipo: 'resultado', nivel: 0, valorCentavos: margem, semContar: semAteAqui, nota: null });

  // --- Despesas fixas → resultado operacional
  const fixas = GRUPOS_ANTES_DO_OPERACIONAL.reduce((s, g) => s + bloco(g), 0);
  const operacional = margem - fixas;
  empurrar({ ...linhaPlano(doPlano(CODIGO.operacional)), tipo: 'resultado', nivel: 0, valorCentavos: operacional, semContar: semAteAqui, nota: null });

  // --- Financeiras → resultado do período
  const financeiras = bloco('FINANCEIRA');
  empurrar({ ...linhaPlano(doPlano(CODIGO.resultado)), tipo: 'resultado', nivel: 0, valorCentavos: operacional - financeiras, semContar: semAteAqui, nota: null });

  return { escopo: e.escopo, receitaBrutaCentavos: bruta, semFaturamento: bruta === 0, porCanal, faltaConfigurarTaxa: faltaTaxa, linhas };
}
