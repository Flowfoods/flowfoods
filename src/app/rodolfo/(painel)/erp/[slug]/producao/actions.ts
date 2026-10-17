'use server';

/**
 * Ações de produção do nível 1 dentro de um parceiro (3.1). Toda ação abre com `exigirParceiro(slug)`: sessão do /rodolfo +
 * parceiro resolvido no servidor + cliente do portão; confere a permissão (`recusaDaAcao`, a mesma regra; o nível 1 sempre
 * pode) e o bloqueio. O slug só escolhe: a loja é lida pelo portão DESTE parceiro. Cada ação deixa rastro no auditLog.
 */

import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import type { Permissao } from '@/lib/erp/permissoes';
import type { EstadoEstoque } from '@/components/erp/telas/estoque/estado';
import { recusadoNoEstoque } from '@/components/erp/telas/estoque/executar';
import { executarCancelarLote, executarConcluir, executarConfirmarLista, executarEstornar, executarIniciar, executarPlanejar } from '@/components/erp/telas/producao/executar';

/** `permissao` pode ser uma lista: passa quem tem QUALQUER uma (cancelar: o lote avulso pede "registrar", o da lista pede "definir"). */
async function preparar(slug: string, lojaId: string, permissao: Permissao | readonly Permissao[]) {
  const ctx = await exigirParceiro(slug);
  const recusas = (typeof permissao === 'string' ? [permissao] : permissao).map((p) => recusaDaAcao(ctx, p, { lojaId: String(lojaId) }));
  const negado = (recusas.every(Boolean) ? recusas[0] : null) ?? ctx.bloqueio;
  return { ctx, negado, base: `/rodolfo/erp/${ctx.parceiro.slug}/producao`, autor: { nome: ctx.sessao.autorNome, userId: ctx.sessao.userId } };
}

async function auditar(ctx: Awaited<ReturnType<typeof exigirParceiro>>, evento: string, lojaId: string) {
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento, dados: { parceiroId: ctx.parceiro.id, lojaId: String(lojaId) } } });
}

export async function acaoPlanejarProducao(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_planejar', lojaId);
  return executarPlanejar(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, base);
}

export async function acaoIniciarProducao(slug: string, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_iniciar', lojaId);
  return executarIniciar(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, base);
}

export async function acaoConcluirProducao(slug: string, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_concluir', lojaId);
  return executarConcluir(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, base);
}

/** Confirmar a lista do dia (3.2): "definir a lista do dia" NA loja. */
export async function acaoConfirmarLista(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_confirmar_lista', lojaId);
  return executarConfirmarLista(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, base);
}

export async function acaoCancelarProducao(slug: string, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, ['producao.registrar', 'producao.planejar']);
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_cancelar', lojaId);
  return executarCancelarLote(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, base);
}

export async function acaoEstornarProducao(slug: string, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_estornar', lojaId);
  return executarEstornar(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, base);
}
