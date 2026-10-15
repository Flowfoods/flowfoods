/**
 * Contexto de tenant do ERP, num lugar só. Toda página e toda server action do
 * ERP começa aqui:
 *
 * - `exigirNivel1()`: sessão do /rodolfo (hoje o nível 1 é só o Rodolfo; perfis
 *   e permissões por parceiro chegam na 0.3/0.4);
 * - `exigirParceiro(slug)`: sessão + parceiro resolvido pelo slug + o cliente
 *   `doParceiro(id)`. O slug só ESCOLHE; quem libera é a sessão.
 *
 * Parceiro que não está ATIVO (suspenso ou aguardando liberação) recebe um
 * cliente SOMENTE LEITURA: a escrita é recusada no portão e a transação abre
 * read-only no banco. Não depende de a tela esconder o botão nem de a action
 * lembrar de conferir — `podeEscrever` serve para a mensagem, não para a trava.
 */

import { cache } from 'react';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import type { ParceiroFlow } from '@prisma/client';
import { authOptions } from '@/lib/rodolfo/auth';
import { doParceiro, parceiroPorSlug, type ClienteDoParceiro } from './tenant';

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

export const exigirNivel1 = cache(async (): Promise<SessaoErp> => {
  const sessao = await getServerSession(authOptions);
  const user = sessao?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
  if (!user?.id) redirect('/rodolfo/login');
  return { userId: user.id, autorNome: user.name || user.email || 'FlowFoods' };
});

/** Uma ida ao banco por requisição, mesmo com layout + página + action pedindo. */
const parceiroDaRequisicao = cache((slug: string) => parceiroPorSlug(slug));

export function bloqueioDeEscrita(status: ParceiroFlow['status']): string | null {
  if (status === 'SUSPENSO') return 'Parceiro suspenso: insumos, lojas e marcas ficam bloqueados até reativar.';
  if (status === 'RASCUNHO') return 'Parceiro aguardando liberação: insumos, lojas e marcas abrem quando ele for ativado.';
  return null;
}

export async function exigirParceiro(slug: string): Promise<ContextoDoParceiro> {
  const sessao = await exigirNivel1();
  const parceiro = await parceiroDaRequisicao(slug);
  if (!parceiro) notFound();
  const bloqueio = bloqueioDeEscrita(parceiro.status);
  return {
    sessao,
    parceiro,
    podeEscrever: bloqueio === null,
    bloqueio,
    cliente: doParceiro(parceiro.id, undefined, { somenteLeitura: bloqueio !== null }),
  };
}

/** Só leitura, sempre: para telas do nível 1 que somam números de vários parceiros. */
export function leituraDoParceiro(parceiroId: string): ClienteDoParceiro {
  return doParceiro(parceiroId, undefined, { somenteLeitura: true });
}
