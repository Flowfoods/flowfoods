'use server';

/**
 * Ações do ERP. Mesma regra do resto do /rodolfo: sessão antes de tudo. O
 * parceiro vem do slug, resolvido aqui no servidor; o formulário nunca diz
 * "grave no parceiro X" — ele só manda texto.
 */

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/rodolfo/auth';
import { prisma } from '@/lib/db';
import { doParceiro, parceiroPorSlug } from '@/lib/erp/tenant';
import { cadastrarInsumo, type ResultadoCadastro } from '@/lib/erp/insumos';

export type EstadoCadastro = (ResultadoCadastro & { vez: number }) | null;

export async function acaoCadastrarInsumo(
  slug: string,
  anterior: EstadoCadastro,
  form: FormData,
): Promise<EstadoCadastro> {
  const sessao = await getServerSession(authOptions);
  const userId = (sessao?.user as { id?: string } | undefined)?.id;
  if (!userId) throw new Error('Sem sessão.');

  const vez = (anterior?.vez ?? 0) + 1;
  const parceiro = await parceiroPorSlug(slug);
  if (!parceiro) return { ok: false, erros: { geral: 'Parceiro não encontrado.' }, vez };
  if (parceiro.status !== 'ATIVO') {
    return { ok: false, erros: { geral: 'Parceiro ainda não liberado para operar.' }, vez };
  }

  const r = await cadastrarInsumo(doParceiro(parceiro.id), Object.fromEntries(form));
  if (r.ok) {
    await prisma.auditLog.create({
      data: { userId, evento: 'erp_insumo_criado', dados: { parceiroId: parceiro.id, insumoId: r.id } },
    });
    revalidatePath(`/rodolfo/erp/${slug}`);
    revalidatePath('/rodolfo/erp');
  }
  return { ...r, vez };
}
