/**
 * Rascunho local da contagem (herança b da 1.6): o número que FALHOU ao
 * salvar (sem sinal na câmara fria) fica guardado no aparelho, por contagem,
 * PESSOA e item (aparelho compartilhado não reenvia o número de A em nome de
 * B), com a VERSÃO do item e a HORA em que a pessoa digitou (decisão 76: o
 * reenvio diz há quanto tempo foi digitado, e o servidor compara com o livro
 * daquele instante — a nota que entrou enquanto não havia sinal não some). Quando o sinal volta (ou
 * a página abre de novo), a tela reenvia com essa versão: se alguém salvou
 * depois, o servidor devolve conflito (o número dele e o nome) em vez de
 * aceitar o velho por cima — nada mais novo é sobrescrito em silêncio.
 * Salvou = o rascunho sai. Tudo em try/catch: sem localStorage (aba privada,
 * bloqueado), a tela funciona igual, só sem a memória.
 */

import type { ContagemDigitada } from '@/lib/erp/estoque-campos';

export interface Rascunho {
  campos: ContagemDigitada;
  /** Versão do item em que a pessoa digitou (a que vai no reenvio). */
  versao: number;
  /** Quando a pessoa DIGITOU (ms, relógio do aparelho; o reenvio manda a idade = agora − em). */
  em: number;
}

/** Rascunho com mais de 2 dias não volta (a contagem já fechou ou venceu). */
export const VALIDADE_DO_RASCUNHO_MS = 2 * 24 * 60 * 60 * 1000;

type Armazem = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Chave da memória: contagem + pessoa. */
export const chaveDoRascunho = (contagemId: string, pessoa: string) => `${contagemId}:${pessoa}`;
const chaveDe = (chave: string) => `ff-contagem:${chave}`;

function armazem(): Armazem | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function lerTudo(contagemId: string, a: Armazem | null = armazem()): Record<string, Rascunho> {
  if (!a) return {};
  try {
    const bruto = JSON.parse(a.getItem(chaveDe(contagemId)) ?? '{}') as unknown;
    if (!bruto || typeof bruto !== 'object') return {};
    const certos: Record<string, Rascunho> = {};
    for (const [id, r] of Object.entries(bruto as Record<string, Partial<Rascunho>>)) {
      const c = r?.campos;
      if (!c || typeof c.embalagens !== 'string' || typeof c.solto !== 'string' || typeof c.escala !== 'string') continue;
      if (typeof r.versao !== 'number' || typeof r.em !== 'number') continue;
      certos[id] = { campos: { embalagens: c.embalagens, solto: c.solto, escala: c.escala }, versao: r.versao, em: r.em };
    }
    return certos;
  } catch {
    return {};
  }
}

function gravarTudo(contagemId: string, tudo: Record<string, Rascunho>, a: Armazem | null = armazem()) {
  if (!a) return;
  try {
    if (Object.keys(tudo).length === 0) a.removeItem(chaveDe(contagemId));
    else a.setItem(chaveDe(contagemId), JSON.stringify(tudo));
  } catch {
    // Cheio ou bloqueado: segue sem a memória local.
  }
}

/** Os rascunhos ainda válidos desta contagem (os vencidos são apagados). */
export function lerRascunhos(contagemId: string, agora = Date.now(), a: Armazem | null = armazem()): Record<string, Rascunho> {
  const tudo = lerTudo(contagemId, a);
  const validos = Object.fromEntries(Object.entries(tudo).filter(([, r]) => agora - r.em <= VALIDADE_DO_RASCUNHO_MS));
  if (Object.keys(validos).length !== Object.keys(tudo).length) gravarTudo(contagemId, validos, a);
  return validos;
}

export function guardarRascunho(contagemId: string, itemId: string, r: Rascunho, a: Armazem | null = armazem()) {
  const tudo = lerTudo(contagemId, a);
  tudo[itemId] = { ...r };
  gravarTudo(contagemId, tudo, a);
}

export function apagarRascunho(contagemId: string, itemId: string, a: Armazem | null = armazem()) {
  const tudo = lerTudo(contagemId, a);
  if (!(itemId in tudo)) return;
  delete tudo[itemId];
  gravarTudo(contagemId, tudo, a);
}

const iguais = (x: ContagemDigitada, y: ContagemDigitada) => x.embalagens.trim() === y.embalagens.trim() && x.solto.trim() === y.solto.trim() && x.escala === y.escala;

/**
 * O que fazer com um rascunho ao abrir a contagem, diante do item como está
 * no servidor: o servidor já tem o mesmo número = descartar (salvou antes de a
 * rede cair); senão, reenviar com a versão do rascunho: se o item andou
 * (outra pessoa, outra aba), o servidor responde conflito e a pessoa escolhe.
 */
export function destinoDoRascunho(r: Rascunho, item: { campos: ContagemDigitada; versao: number }): 'descartar' | 'reenviar' {
  if (iguais(r.campos, item.campos)) return 'descartar';
  if (r.versao > item.versao) return 'descartar'; // versão do futuro: rascunho de outra contagem com o mesmo id (impossível na prática)
  return 'reenviar';
}
