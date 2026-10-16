'use server';

/**
 * Ações do painel do Portal. Mesma regra das demais ações do /rodolfo: confere
 * a sessão antes de tudo, porque server action é um POST que qualquer um pode
 * chamar sabendo o id.
 */

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/rodolfo/auth';
import { prisma } from '@/lib/db';
import { zerarCliente } from '@/lib/portal/dados';
import type { Resposta } from '../actions';

async function exigirSessao(): Promise<string> {
  const sessao = await getServerSession(authOptions);
  const id = (sessao?.user as { id?: string } | undefined)?.id;
  if (!id) throw new Error('Sem sessão.');
  return id;
}

/** Limpa respostas e arquivos de teste. O cadastro e o link continuam valendo. */
export async function acaoZerarPortal(clienteId: string): Promise<Resposta> {
  const userId = await exigirSessao();
  const r = await zerarCliente(clienteId);
  await prisma.auditLog.create({
    data: { userId, evento: 'portal_zerado', dados: { clienteId, ...r } },
  });
  revalidatePath('/rodolfo/portal');
  revalidatePath(`/rodolfo/portal/${clienteId}`);
  return {
    ok: true,
    mensagem: `Apagadas ${r.respostas} respostas e ${r.arquivos} arquivos. O link continua o mesmo.`,
  };
}
