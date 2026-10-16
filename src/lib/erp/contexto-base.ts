/**
 * Parte do contexto de tenant sem Next nem React (testável com banco de teste):
 * tipos, a regra de "somente leitura" e o contexto montado a partir da sessão
 * da pessoa do parceiro. Quem usa nas telas é `contexto.ts`.
 */

import type { ParceiroFlow, PrismaClient } from '@prisma/client';
import type { SessaoValida } from './credenciais';
import type { Alcance } from './permissoes';
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
  /**
   * O que quem está na tela pode (0.4): nível 1 = tudo; pessoa do parceiro =
   * perfil + ajustes + lojas do vínculo DESTE parceiro. Toda página e action
   * confere com `exigirPermissao(ctx, ...)` (permissoes.ts).
   */
  alcance: Alcance;
}

export function bloqueioDeEscrita(status: ParceiroFlow['status']): string | null {
  if (status === 'SUSPENSO') return 'Parceiro suspenso: insumos, fichas técnicas, lojas e marcas ficam bloqueados até reativar.';
  if (status === 'RASCUNHO') return 'Parceiro aguardando liberação: insumos, fichas técnicas, lojas e marcas abrem quando ele for ativado.';
  return null;
}

export interface ContextoDaPessoa extends ContextoDoParceiro {
  pessoa: SessaoValida;
}

/**
 * Puro sobre a sessão já validada (testável com banco de teste): o parceiro é o
 * DA SESSÃO (a sessão só tem parceiro em que a pessoa tem vínculo ATIVO), o
 * alcance é o do vínculo dela NESTE parceiro, e o cliente é `doParceiro` dele —
 * somente leitura se o parceiro não está ATIVO (mesma regra do nível 1).
 */
export function contextoDaSessao(pessoa: SessaoValida & { parceiro: ParceiroFlow }, base?: PrismaClient): ContextoDaPessoa {
  // Sessão com parceiro sempre tem alcance (vêm do mesmo vínculo); sem ele, nada passa.
  if (!pessoa.alcance) throw new Error('[permissões] sessão sem alcance no parceiro.');
  const bloqueio = bloqueioDeEscrita(pessoa.parceiro.status);
  return {
    alcance: pessoa.alcance,
    pessoa,
    sessao: { userId: pessoa.usuario.id, autorNome: pessoa.usuario.nome },
    parceiro: pessoa.parceiro,
    podeEscrever: bloqueio === null,
    bloqueio,
    cliente: doParceiro(pessoa.parceiro.id, base, { somenteLeitura: bloqueio !== null }),
  };
}

