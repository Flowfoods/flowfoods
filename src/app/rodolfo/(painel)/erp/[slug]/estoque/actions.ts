'use server';

/**
 * Ações de estoque do nível 1 dentro de um parceiro. Toda ação abre com
 * `exigirParceiro(slug)`: sessão do /rodolfo + parceiro resolvido no servidor
 * + cliente do portão; confere a permissão (`recusaDaAcao`, a mesma regra; o
 * nível 1 sempre pode) e o bloqueio. O slug só escolhe: a loja é lida pelo
 * portão DESTE parceiro. Abrir, concluir e descartar deixam rastro no auditLog.
 */

import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import type { ResultadoDoItem } from '@/lib/erp/estoque';
import type { Permissao } from '@/lib/erp/permissoes';
import type { EstadoEstoque, ItemParaSalvar } from '@/components/erp/telas/estoque/estado';
import { executarConcluir, executarContar, executarDescartar, executarIniciar, recusadoNoEstoque } from '@/components/erp/telas/estoque/executar';

async function preparar(slug: string, lojaId: string, permissao: Permissao) {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, permissao, { lojaId: String(lojaId) }) ?? ctx.bloqueio;
  return { ctx, negado, base: `/rodolfo/erp/${ctx.parceiro.slug}/estoque` };
}

async function auditar(ctx: Awaited<ReturnType<typeof exigirParceiro>>, evento: string, lojaId: string) {
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento, dados: { parceiroId: ctx.parceiro.id, lojaId: String(lojaId) } } });
}

export async function acaoIniciarAbertura(slug: string, lojaId: string, anterior: EstadoEstoque): Promise<EstadoEstoque> {
  const { ctx, negado, base } = await preparar(slug, lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_estoque_abertura_iniciar', lojaId);
  return executarIniciar(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), anterior, base);
}

export async function acaoContarItem(slug: string, lojaId: string, item: ItemParaSalvar): Promise<ResultadoDoItem> {
  const { ctx, negado } = await preparar(slug, lojaId, 'estoque.contar');
  if (negado) return { ok: false, erros: { geral: negado } };
  return executarContar(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), item);
}

export async function acaoConcluirAbertura(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base } = await preparar(slug, lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_estoque_abertura_concluir', lojaId);
  return executarConcluir(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), anterior, form, base);
}

export async function acaoDescartarAbertura(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base } = await preparar(slug, lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_estoque_abertura_descartar', lojaId);
  return executarDescartar(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), anterior, form, base);
}
