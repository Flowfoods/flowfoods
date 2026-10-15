/**
 * Parte do contexto de tenant sem Next nem React (testável com banco de teste):
 * tipos, a regra de "somente leitura" e o contexto montado a partir da sessão
 * da pessoa do parceiro. Quem usa nas telas é `contexto.ts`.
 */

import type { ParceiroFlow, PrismaClient } from '@prisma/client';
import type { SessaoValida } from './credenciais';
import { doParceiro, type ClienteDoParceiro } from './tenant';

export interface SessaoErp {
  userId: string;
  /** Snapshot de quem fez, para o histórico. */
  autorNome: string;
}

export interface ContextoDoParceiro {
  sessao: SessaoErp;
  parceiro: ParceiroFlow;
  cliente: ClienteDoParceiro;
  podeEscrever: boolean;
  /** Por que não pode escrever (null se pode). */
  bloqueio: string | null;
}

export function bloqueioDeEscrita(status: ParceiroFlow['status']): string | null {
  if (status === 'SUSPENSO') return 'Parceiro suspenso: insumos, lojas e marcas ficam bloqueados até reativar.';
  if (status === 'RASCUNHO') return 'Parceiro aguardando liberação: insumos, lojas e marcas abrem quando ele for ativado.';
  return null;
}

export interface ContextoDaPessoa extends ContextoDoParceiro {
  pessoa: SessaoValida;
}

/**
 * Puro sobre a sessão já validada (testável com banco de teste): o parceiro é o
 * DA SESSÃO, e o cliente é `doParceiro` dele — somente leitura se o parceiro
 * não está ATIVO (mesma regra do nível 1).
 */
export function contextoDaSessao(pessoa: SessaoValida & { parceiro: ParceiroFlow }, base?: PrismaClient): ContextoDaPessoa {
  const bloqueio = bloqueioDeEscrita(pessoa.parceiro.status);
  return {
    pessoa,
    sessao: { userId: pessoa.usuario.id, autorNome: pessoa.usuario.nome },
    parceiro: pessoa.parceiro,
    podeEscrever: bloqueio === null,
    bloqueio,
    cliente: doParceiro(pessoa.parceiro.id, base, { somenteLeitura: bloqueio !== null }),
  };
}

