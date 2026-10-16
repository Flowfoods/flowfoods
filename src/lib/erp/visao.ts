/**
 * Visão do ERP (topo do shell): "Rede Completa" ou uma loja. Puro, sem Next.
 *
 * A visão NUNCA concede nada: as opções são só as lojas que o alcance da
 * pessoa já alcança (`listarLojasDoAlcance`, regra da 0.4), e o valor do
 * cookie `ff_visao` é conferido contra elas a cada requisição. Valor forjado,
 * de outro parceiro ou de loja que saiu do alcance cai na primeira opção
 * permitida. Quem decide o que a pessoa pode continua sendo `exigirPermissao`.
 *
 * Cookie: `<parceiroId>:<rede | lojaId>`. O parceiro no valor impede que a
 * escolha feita num parceiro valha em outro (pessoa com dois parceiros, ou o
 * nível 1 trocando de parceiro).
 */

import type { Alcance } from './permissoes';

export const COOKIE_VISAO = 'ff_visao';

export type Visao = { tipo: 'rede' } | { tipo: 'loja'; lojaId: string; nome: string } | { tipo: 'nenhuma' };

export interface OpcaoDeVisao {
  /** 'rede' ou o id da loja. */
  valor: string;
  rotulo: string;
  ativa: boolean;
}

export interface LojaDaVisao {
  id: string;
  nome: string;
  ativa: boolean;
}

export const ROTULO_REDE = 'Rede Completa';

/** Rede Completa só para quem tem a rede inteira; depois, as lojas do alcance. */
export function opcoesDeVisao(alcance: Pick<Alcance, 'lojas'>, lojas: readonly LojaDaVisao[]): OpcaoDeVisao[] {
  const permitidas =
    alcance.lojas === 'todas' ? lojas : lojas.filter((l) => (alcance.lojas as readonly string[]).includes(l.id));
  const daLoja = permitidas.map((l) => ({ valor: l.id, rotulo: l.nome, ativa: l.ativa }));
  return alcance.lojas === 'todas' ? [{ valor: 'rede', rotulo: ROTULO_REDE, ativa: true }, ...daLoja] : daLoja;
}

/** O que está gravado no cookie para ESTE parceiro (ou undefined). */
export function escolhaDoCookie(parceiroId: string, cookie: string | undefined | null): string | undefined {
  if (!cookie) return undefined;
  const i = cookie.indexOf(':');
  if (i <= 0 || cookie.slice(0, i) !== parceiroId) return undefined;
  return cookie.slice(i + 1) || undefined;
}

export function valorDoCookieDeVisao(parceiroId: string, escolha: string): string {
  return `${parceiroId}:${escolha}`;
}

/** A escolha está entre as opções permitidas? (A action recusa o que não estiver.) */
export function escolhaPermitida(
  alcance: Pick<Alcance, 'lojas'>,
  lojas: readonly LojaDaVisao[],
  escolha: unknown,
): escolha is string {
  return typeof escolha === 'string' && opcoesDeVisao(alcance, lojas).some((o) => o.valor === escolha);
}

/**
 * Visão desta requisição: a do cookie se ainda for permitida; senão a primeira
 * opção (Rede Completa para quem tem a rede; a primeira loja para quem não tem).
 */
export function resolverVisao(
  parceiroId: string,
  alcance: Pick<Alcance, 'lojas'>,
  lojas: readonly LojaDaVisao[],
  cookie: string | undefined | null,
): { visao: Visao; opcoes: OpcaoDeVisao[]; valor: string | null } {
  const opcoes = opcoesDeVisao(alcance, lojas);
  const pedida = escolhaDoCookie(parceiroId, cookie);
  const escolhida = opcoes.find((o) => o.valor === pedida) ?? opcoes[0];
  if (!escolhida) return { visao: { tipo: 'nenhuma' }, opcoes, valor: null };
  const visao: Visao =
    escolhida.valor === 'rede' ? { tipo: 'rede' } : { tipo: 'loja', lojaId: escolhida.valor, nome: escolhida.rotulo };
  return { visao, opcoes, valor: escolhida.valor };
}

/** "Rede Completa", "Loja Tijuca", "Sem loja no seu acesso". */
export function rotuloDaVisao(visao: Visao): string {
  if (visao.tipo === 'rede') return ROTULO_REDE;
  if (visao.tipo === 'loja') return visao.nome;
  return 'Sem loja no seu acesso';
}
