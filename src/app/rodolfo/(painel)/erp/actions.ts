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
import { ligarCustoMedio } from '@/lib/erp/custo-medio';
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

/**
 * N.1: liga o custo médio ponderado numa loja do parceiro (só nível 1). Pede a confirmação de que o relatório de
 * impacto foi lido. A troca vale daqui para a frente; nada é recalculado.
 */
export async function acaoLigarCustoMedio(slug: string, lojaId: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { sessao, cliente, podeEscrever } = await exigirParceiro(slug);
  const vez = (anterior?.vez ?? 0) + 1;
  if (!podeEscrever) return { ok: false, erros: { geral: 'Parceiro suspenso ou em rascunho: nada muda até reativar.' }, vez };
  if (form.get('li') !== 'sim') return { ok: false, erros: { li: 'Confirme que leu o impacto desta loja.' }, vez };
  const r = await ligarCustoMedio(cliente, lojaId, sessao.autorNome);
  if (!r.ok) return { ok: false, erros: { geral: r.erro }, vez };
  await auditar(sessao.userId, 'erp_custo_medio_ligado', { slug, lojaId });
  revalidatePath(`/rodolfo/erp/${slug}/custo-medio`);
  return { ok: true, mensagem: r.jaFeito ? 'Esta loja já estava no custo médio.' : 'Custo médio ligado nesta loja a partir de agora.', vez };
}
