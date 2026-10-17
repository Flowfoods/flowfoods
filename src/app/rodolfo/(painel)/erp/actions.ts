'use server';

/**
 * Ações do nível 1 (FlowFoods) sobre o Parceiro Flow: renomear e
 * ativar/suspender (criar é a ativação de um pedido, em `onboarding/actions.ts`). Sessão e parceiro resolvidos por `src/lib/erp/contexto.ts`;
 * o formulário só manda texto. Cada mudança grava antes/depois no histórico do
 * parceiro (em `src/lib/erp/parceiros.ts`, na mesma transação).
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { exigirNivel1, exigirParceiro } from '@/lib/erp/contexto';
import { mudarStatusParceiro, renomearParceiro, type ResultadoParceiro } from '@/lib/erp/parceiros';
import type { EstadoForm } from '@/components/erp/ui/campos';

function paraEstado(r: ResultadoParceiro, vez: number): NonNullable<EstadoForm> {
  return r.ok ? { ok: true, mensagem: r.mensagem, vez } : { ok: false, erros: r.erros, vez };
}

async function auditar(userId: string, evento: string, dados: Record<string, string>) {
  await prisma.auditLog.create({ data: { userId, evento, dados } });
}

export async function acaoRenomearParceiro(slug: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { sessao, parceiro } = await exigirParceiro(slug);
  const vez = (anterior?.vez ?? 0) + 1;
  const r = await renomearParceiro(parceiro.id, Object.fromEntries(form), sessao.autorNome);
  if (r.ok) {
    await auditar(sessao.userId, 'erp_parceiro_renomeado', { parceiroId: parceiro.id });
    revalidatePath('/rodolfo', 'layout');
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
    revalidatePath('/rodolfo', 'layout');
  }
  return paraEstado(r, vez);
}
