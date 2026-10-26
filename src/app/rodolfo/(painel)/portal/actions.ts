'use server';

/**
 * Ações do painel do Portal. Mesma regra das demais ações do /rodolfo: confere
 * a sessão antes de tudo, porque server action é um POST que qualquer um pode
 * chamar sabendo o id.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/rodolfo/auth';
import { prisma } from '@/lib/db';
import { zerarCliente } from '@/lib/portal/dados';
import { cadastrarCliente, lerNovoCliente } from '@/lib/portal/cadastro';
import { QUESTIONARIOS_DISPONIVEIS, questionario } from '@/lib/portal/questionario';
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

/**
 * Cadastra um cliente no Portal (decisão 477): nome e questionário (entre os do código); o endereço e o link nascem aqui.
 * Abre a página do cliente, com o link para copiar.
 */
export async function acaoCadastrarCliente(_anterior: unknown, form: FormData): Promise<Resposta> {
  const userId = await exigirSessao();
  const disponiveis = QUESTIONARIOS_DISPONIVEIS.flatMap((chave) => {
    const q = questionario(chave);
    return q ? [{ chave, marca: q.marca }] : [];
  });
  let id: string;
  try {
    const existentes = (await prisma.portalCliente.findMany({ select: { nome: true } })).map((c) => c.nome);
    const lido = lerNovoCliente({ nome: form.get('nome'), questionario: form.get('questionario'), confirmaMarca: form.get('confirmaMarca') }, disponiveis, existentes);
    if (!lido.ok) return { ok: false, mensagem: lido.erro };
    // O cadastro e o registro de quem cadastrou vão juntos (mesma transação).
    id = (await cadastrarCliente(lido.nome, lido.questionario, QUESTIONARIOS_DISPONIVEIS, { userId })).id;
  } catch (e) {
    // Erro do banco não troca a tela por uma página de erro: o que foi digitado fica no formulário. O erro vai para o log.
    console.error('[portal] cadastro de cliente falhou:', e);
    return { ok: false, mensagem: 'Não deu para cadastrar agora. Tente de novo em instantes.' };
  }
  revalidatePath('/rodolfo/portal');
  redirect(`/rodolfo/portal/${id}?feito=cadastrado`);
}
