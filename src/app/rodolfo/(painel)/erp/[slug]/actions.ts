'use server';

/**
 * Ações do espaço de um parceiro (lojas e marcas; insumos em `insumos/actions.ts`). Toda ação abre com
 * `exigirParceiro(slug)`: sessão + parceiro resolvido no servidor + cliente do
 * portão, e confere a permissão (`recusaDaAcao`, a mesma regra de
 * `exigirPermissao`; o nível 1 sempre pode). Parceiro suspenso/não liberado devolve a mensagem aqui; e mesmo que
 * uma ação esquecesse de conferir, o cliente dele é somente leitura (portão e
 * banco recusam a escrita).
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarLoja, cadastrarMarca } from '@/lib/erp/estrutura';
import type { EstadoForm } from '@/components/erp/ui/campos';
import type { EstadoDosCanais } from '@/components/erp/telas/faturamento/estado';
import { executarCanaisDaLoja } from '@/components/erp/telas/faturamento/executar';

async function cadastrarEstrutura(
  tipo: 'loja' | 'marca',
  slug: string,
  anterior: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const { sessao, parceiro, cliente, bloqueio } = ctx;
  const vez = (anterior?.vez ?? 0) + 1;
  const negado = recusaDaAcao(ctx, 'lojas.gerir');
  if (negado) return { ok: false, erros: { geral: negado }, vez };
  if (bloqueio) return { ok: false, erros: { geral: bloqueio }, vez };

  const cadastrar = tipo === 'loja' ? cadastrarLoja : cadastrarMarca;
  const r = await cadastrar(cliente, Object.fromEntries(form), sessao.autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, vez };

  await prisma.auditLog.create({
    data: { userId: sessao.userId, evento: `erp_${tipo}_criada`, dados: { parceiroId: parceiro.id, id: r.id } },
  });
  revalidatePath(`/rodolfo/erp/${slug}`, 'layout');
  revalidatePath('/rodolfo/erp');
  return { ok: true, mensagem: `“${r.nome}” cadastrada.`, vez };
}

export async function acaoCadastrarLoja(slug: string, anterior: EstadoForm, form: FormData) {
  return cadastrarEstrutura('loja', slug, anterior, form);
}

export async function acaoCadastrarMarca(slug: string, anterior: EstadoForm, form: FormData) {
  return cadastrarEstrutura('marca', slug, anterior, form);
}

/** 2.1: em quais canais a loja vende (o nível 1 sempre pode; fica no auditLog). */
export async function acaoSalvarCanaisDaLoja(slug: string, lojaId: string, anterior: EstadoDosCanais, form: FormData): Promise<EstadoDosCanais> {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, 'lojas.gerir') ?? ctx.bloqueio;
  if (negado) return { ok: false, erros: { geral: negado }, vez: (anterior?.vez ?? 0) + 1 };
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento: 'erp_loja_canais', dados: { parceiroId: ctx.parceiro.id, id: String(lojaId) } } });
  return executarCanaisDaLoja(ctx.cliente, ctx.sessao.autorNome, String(lojaId), anterior, form, `/rodolfo/erp/${slug}`);
}
