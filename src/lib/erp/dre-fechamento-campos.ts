/**
 * Fechar o período (2.2b) — o que é PURO: as condições, as ressalvas, a justificativa, o motivo de
 * reabrir e a ponte entre o DRE montado e as linhas da fotografia (sem banco e sem Next).
 *
 * Decisão 152: o período fecha quando o resultado dele já não depende de ninguém lançar mais nada.
 * As condições de dois tipos:
 *  - DURAS não aceitam justificativa — o fechamento só passa quando elas somem (período em curso,
 *    faturamento faltando, venda no iFood sem a taxa configurada, estoque em contagem de fechamento,
 *    rede sem nenhum lançamento);
 *  - RESSALVAS são confirmáveis uma a uma, com UMA justificativa de 10 a 300 letras que vai para a
 *    fotografia e para o histórico (despesa recorrente sem o mês lançado, loja sem o fechamento de
 *    estoque aplicado, loja sem nenhum lançamento).
 */

import type { CanalVenda } from './canal-campos';
import type { Escopo, LinhaDoDre, ResultadoDoDre, TipoDaLinha } from './dre-campos';
import { CODIGO, codigoDoSubtotal, type GrupoDoDre, type SentidoDaLinha } from './dre-plano';
import { limparTexto } from './texto-limpo';

export const LIMITES_DO_FECHAMENTO = {
  justificativaMin: 10,
  justificativaMax: 300,
  motivoMin: 3,
  motivoMax: 200,
} as const;

// ============================================================ condições

export type CodigoDaCondicaoDura = 'EM_CURSO' | 'FALTA_FATURAMENTO' | 'SEM_TAXA_IFOOD' | 'ESTOQUE_EM_ANDAMENTO' | 'REDE_SEM_LANCAMENTO';

export interface CondicaoDura {
  codigo: CodigoDaCondicaoDura;
  titulo: string;
  detalhe: string;
  /** Onde resolver: o caminho relativo à raiz do ERP. */
  resolverEm?: { rotulo: string; caminho: string };
}

export type TipoDeRessalva = 'RECORRENTE' | 'ESTOQUE' | 'LOJA_SEM_LANCAMENTO';

export interface Ressalva {
  /** Estável entre a tela e o fechamento: `recorrente:<origem>`, `estoque:<loja>`, `sem-lancamento:<loja>`. */
  id: string;
  tipo: TipoDeRessalva;
  lojaId: string | null;
  lojaNome: string | null;
  titulo: string;
  detalhe: string;
  /** Só na recorrente: a despesa de origem, o mês que falta e o valor do mês passado. */
  origemId?: string;
  mesAlvo?: string;
  valorCentavos?: number;
}

export interface CondicoesParaFechar {
  duras: CondicaoDura[];
  ressalvas: Ressalva[];
  /** O que a tela viu: o fechamento confere (mudou = "algo mudou, confira de novo"). */
  impressao: string;
}

/** Cálculo barato e estável (cyrb53) da impressão: o mesmo texto dá a mesma impressão, no servidor e no teste. */
export function impressaoDoTexto(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function impressaoDasCondicoes(inicio: string, fim: string, duras: readonly CondicaoDura[], ressalvas: readonly Ressalva[]): string {
  return impressaoDoTexto([inicio, fim, ...duras.map((d) => `${d.codigo}:${d.detalhe}`), ...ressalvas.map((r) => `${r.id}:${r.detalhe}`)].join('|'));
}

export const rotuloDaRessalva: Record<TipoDeRessalva, string> = {
  RECORRENTE: 'Despesa que repete todo mês sem o mês lançado',
  ESTOQUE: 'Estoque sem o fechamento aplicado',
  LOJA_SEM_LANCAMENTO: 'Loja sem nenhum lançamento de faturamento',
};

/** A frase da recusa de fechar quando há condição dura (numa linha só, com os números). */
export function fraseDaRecusaDeFechar(duras: readonly CondicaoDura[]): string {
  return `Ainda não dá para fechar: ${duras.map((d) => d.titulo).join('; ')}.`;
}

export const MENSAGEM_DE_ALGO_MUDOU = 'Algo mudou desde que você conferiu as condições. Confira de novo; nada foi fechado.';

export type LeituraDeTexto = { ok: true; texto: string } | { ok: false; erro: string };

/** A justificativa de fechar com ressalvas: texto limpo de 10 a 300 letras. */
export function lerJustificativa(bruto: unknown): LeituraDeTexto {
  const texto = limparTexto(bruto);
  const { justificativaMin: min, justificativaMax: max } = LIMITES_DO_FECHAMENTO;
  if (texto.length < min) return { ok: false, erro: `Explique por que fecha assim, em pelo menos ${min} letras.` };
  if (texto.length > max) return { ok: false, erro: `A justificativa tem no máximo ${max} letras.` };
  return { ok: true, texto };
}

/** O motivo de reabrir: de 3 a 200 letras. */
export function lerMotivoDaReabertura(bruto: unknown): LeituraDeTexto {
  const texto = limparTexto(bruto);
  const { motivoMin: min, motivoMax: max } = LIMITES_DO_FECHAMENTO;
  if (texto.length < min) return { ok: false, erro: `Diga por que reabre, em pelo menos ${min} letras.` };
  if (texto.length > max) return { ok: false, erro: `O motivo tem no máximo ${max} letras.` };
  return { ok: true, texto };
}

// ============================================================ a ponte DRE ↔ fotografia

/** Uma linha como a fotografia a guarda (e como ela volta para a tela). `lojaId` nulo é a rede. */
export interface LinhaGravada {
  lojaId: string | null;
  lojaNome: string | null;
  ordem: number;
  chave: string;
  codigo: string | null;
  linhaId: string | null;
  nome: string;
  grupo: GrupoDoDre;
  tipo: TipoDaLinha;
  nivel: 0 | 1;
  sentido: SentidoDaLinha;
  valorCentavos: number | null;
  percentualBp: number | null;
  metaBp: number | null;
  semContar: string[];
  nota: string | null;
  oculta: boolean;
}

/** O DRE montado de um escopo → as linhas para gravar (com a meta da época em cada uma). */
export function linhasParaGravar(r: ResultadoDoDre, lojaId: string | null, lojaNome: string | null, metaDe: (l: LinhaDoDre) => number | null): LinhaGravada[] {
  return r.linhas.map((l, ordem) => ({
    lojaId,
    lojaNome,
    ordem,
    chave: l.chave,
    codigo: l.codigo,
    linhaId: l.linhaId,
    nome: l.nome,
    grupo: l.grupo,
    tipo: l.tipo,
    nivel: l.nivel,
    sentido: l.sentido,
    valorCentavos: l.valorCentavos,
    percentualBp: l.percentualBp,
    metaBp: metaDe(l),
    semContar: l.semContar,
    nota: l.nota,
    oculta: l.oculta,
  }));
}

/** As linhas gravadas de um escopo → o resultado do DRE, sem recalcular nada. */
export function dreDaFotografia(linhas: readonly LinhaGravada[], escopo: Escopo): ResultadoDoDre {
  const ordenadas = [...linhas].sort((a, b) => a.ordem - b.ordem);
  const valor = (chave: string) => ordenadas.find((l) => l.chave === chave)?.valorCentavos ?? 0;
  const porCanal: Record<CanalVenda, number> = { LOJA: valor(CODIGO.receitaLoja), DELIVERY_PROPRIO: valor(CODIGO.receitaDelivery), IFOOD: valor(CODIGO.receitaIfood) };
  const bruta = valor(codigoDoSubtotal('RECEITA'));
  const taxa = ordenadas.find((l) => l.chave === CODIGO.taxasIfood);
  return {
    escopo,
    receitaBrutaCentavos: bruta,
    semFaturamento: bruta === 0,
    porCanal,
    faltaConfigurarTaxa: !!taxa && taxa.valorCentavos === null,
    linhas: ordenadas.map((l) => ({
      chave: l.chave,
      codigo: l.codigo,
      linhaId: l.linhaId,
      nome: l.nome,
      grupo: l.grupo,
      sentido: l.sentido,
      tipo: l.tipo,
      nivel: l.nivel,
      valorCentavos: l.valorCentavos,
      percentualBp: l.percentualBp,
      semContar: l.semContar,
      nota: l.nota,
      oculta: l.oculta,
    })),
  };
}

/** As metas gravadas de uma linha → mapa chave → pontos-base (só as que têm meta). */
export function metasDasLinhas(linhas: readonly LinhaGravada[]): Map<string, number> {
  return new Map(linhas.filter((l) => l.metaBp !== null).map((l) => [l.chave, l.metaBp!]));
}
