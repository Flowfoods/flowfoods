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
import { pessoasQueProduzem } from '@/lib/erp/credenciais';
import { executarCancelarLote, executarConcluir, executarEstornar, executarGerarLotes, executarPassar, executarPegarDaLista, executarPegarLote, executarPlanejar, executarPorNaLista, executarSalvarLista, executarSoltar } from '@/components/erp/telas/producao/executar';

async function preparar(slug: string, lojaId: string, permissao: Permissao) {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, permissao, { lojaId: String(lojaId) }) ?? ctx.bloqueio;
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

// ================================================================ a cozinha pega a tarefa (3.3): o nível 1 não pega (a regra recusa), mas começa, solta e passa

export async function acaoPegarLote(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_pegar', lojaId);
  return executarPegarLote(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, base);
}

export async function acaoPegarDaLista(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_pegar_da_lista', lojaId);
  return executarPegarDaLista(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, base);
}

export async function acaoSoltarLote(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_soltar', lojaId);
  return executarSoltar(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, base);
}

export async function acaoPassarLote(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_passar', lojaId);
  const pessoas = await pessoasQueProduzem(ctx.parceiro.id, String(lojaId));
  return executarPassar(ctx.cliente, ctx.alcance, autor, String(lojaId), pessoas, anterior, form, base);
}

export async function acaoConcluirProducao(slug: string, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_concluir', lojaId);
  return executarConcluir(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, base);
}

export async function acaoCancelarProducao(slug: string, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.registrar');
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

// ================================================================ a lista do dia (3.2)

export async function acaoSalvarListaDoDia(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_lista_salvar', lojaId);
  return executarSalvarLista(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, base);
}

export async function acaoGerarLotesDaLista(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_lista_gerar', lojaId);
  return executarGerarLotes(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, base);
}

export async function acaoPorNaListaDoDia(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_producao_lista_por', lojaId);
  return executarPorNaLista(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, base);
}
