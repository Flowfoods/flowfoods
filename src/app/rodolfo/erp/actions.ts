'use server';

/**
 * Ações do nível 1 (FlowFoods) sobre o Parceiro Flow: criar, renomear,
 * ativar/suspender. Sessão e parceiro resolvidos por `src/lib/erp/contexto.ts`;
 * o formulário só manda texto. Cada mudança grava antes/depois no histórico do
 * parceiro (em `src/lib/erp/parceiros.ts`, na mesma transação).
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { exigirNivel1, exigirParceiro } from '@/lib/erp/contexto';
import { criarParceiro, mudarStatusParceiro, renomearParceiro, type ResultadoParceiro } from '@/lib/erp/parceiros';
import type { EstadoForm } from './campos';

function paraEstado(r: ResultadoParceiro, vez: number): NonNullable<EstadoForm> {
  return r.ok ? { ok: true, mensagem: r.mensagem, vez } : { ok: false, erros: r.erros, vez };
}

async function auditar(userId: string, evento: string, dados: Record<string, string>) {
  await prisma.auditLog.create({ data: { userId, evento, dados } });
}

export async function acaoCriarParceiro(anterior: EstadoForm, form: FormData): Promise<EstadoForm & { slug?: string }> {
  const { userId, autorNome } = await exigirNivel1();
  const vez = (anterior?.vez ?? 0) + 1;
  const r = await criarParceiro(Object.fromEntries(form), autorNome);
  if (r.ok) {
    await auditar(userId, 'erp_parceiro_criado', { parceiroId: r.id, slug: r.slug });
    revalidatePath('/rodolfo/erp');
    return { ...paraEstado(r, vez), slug: r.slug };
  }
  return paraEstado(r, vez);
}

export async function acaoRenomearParceiro(slug: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { sessao, parceiro } = await exigirParceiro(slug);
  const vez = (anterior?.vez ?? 0) + 1;
  const r = await renomearParceiro(parceiro.id, Object.fromEntries(form), sessao.autorNome);
  if (r.ok) {
    await auditar(sessao.userId, 'erp_parceiro_renomeado', { parceiroId: parceiro.id });
    revalidatePath('/rodolfo/erp', 'layout');
  }
  return paraEstado(r, vez);
}

export async function acaoMudarStatusParceiro(slug: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { sessao, parceiro } = await exigirParceiro(slug);
  const vez = (anterior?.vez ?? 0) + 1;
  const novo = form.get('status');
  if (novo !== 'ATIVO' && novo !== 'SUSPENSO') return { ok: false, erros: { geral: 'Status inválido.' }, vez };
  const r = await mudarStatusParceiro(parceiro.id, novo, form.get('motivo'), sessao.autorNome);
  if (r.ok) {
    await auditar(sessao.userId, novo === 'SUSPENSO' ? 'erp_parceiro_suspenso' : 'erp_parceiro_ativado', {
      parceiroId: parceiro.id,
    });
    revalidatePath('/rodolfo/erp', 'layout');
  }
  return paraEstado(r, vez);
}
