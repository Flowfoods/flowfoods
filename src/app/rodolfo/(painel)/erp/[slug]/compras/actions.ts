'use server';

/**
 * Ações de compras do nível 1 dentro de um parceiro. Toda ação abre com
 * `exigirParceiro(slug)`: sessão do /rodolfo + parceiro resolvido no servidor
 * + cliente do portão; confere a permissão (`recusaDaAcao`, a mesma regra; o
 * nível 1 sempre pode) e o bloqueio. O slug só escolhe: nota e fornecedor são
 * lidos pelo portão DESTE parceiro. Cada gravação deixa rastro no auditLog.
 */

import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarFornecedor, editarFornecedor, mudarSituacaoFornecedor, type ResultadoCompras } from '@/lib/erp/compras';
import type { EstadoNota } from '@/components/erp/telas/compras/estado';
import { concluirCompra, executarCancelamento, executarNota, recusadoNaNota } from '@/components/erp/telas/compras/executar';
import { entradaDe, querAtivo } from '@/components/erp/telas/cadastro/executar';

type Ctx = Awaited<ReturnType<typeof exigirParceiro>>;

async function preparar(slug: string, permissao: 'compras.lancar' | 'fornecedores.editar') {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, permissao) ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/compras`;
  return { ctx, negado, notas: base, fornecedores: `${base}/fornecedores` };
}

async function auditar(ctx: Ctx, evento: string, r: ResultadoCompras) {
  if (!r.ok) return;
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento, dados: { parceiroId: ctx.parceiro.id, id: r.id } } });
}

export async function acaoSalvarNota(slug: string, notaId: string, anterior: EstadoNota, form: FormData): Promise<EstadoNota> {
  const { ctx, negado, notas } = await preparar(slug, 'compras.lancar');
  if (negado) return recusadoNaNota(anterior, negado);
  if (form.get('intencao') !== 'conferir') {
    await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento: notaId ? 'erp_nota_editar' : 'erp_nota_lancar', dados: { parceiroId: ctx.parceiro.id, id: String(notaId) } } });
  }
  return executarNota(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(notaId), anterior, form, notas);
}

export async function acaoCancelarNota(slug: string, notaId: string, anterior: EstadoNota, form: FormData): Promise<EstadoNota> {
  const { ctx, negado, notas } = await preparar(slug, 'compras.lancar');
  if (negado) return recusadoNaNota(anterior, negado);
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento: 'erp_nota_cancelar', dados: { parceiroId: ctx.parceiro.id, id: String(notaId) } } });
  return executarCancelamento(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(notaId), anterior, form, notas);
}

export async function acaoCadastrarFornecedor(slug: string, anterior: EstadoNota, form: FormData): Promise<EstadoNota> {
  const { ctx, negado, fornecedores } = await preparar(slug, 'fornecedores.editar');
  if (negado) return recusadoNaNota(anterior, negado);
  const r = await cadastrarFornecedor(ctx.cliente, entradaDe(form), ctx.sessao.autorNome);
  await auditar(ctx, 'erp_fornecedor_criado', r);
  return concluirCompra(r, anterior, fornecedores, { mudou: 'criado' });
}

export async function acaoEditarFornecedor(slug: string, id: string, anterior: EstadoNota, form: FormData): Promise<EstadoNota> {
  const { ctx, negado, fornecedores } = await preparar(slug, 'fornecedores.editar');
  if (negado) return recusadoNaNota(anterior, negado);
  const r = await editarFornecedor(ctx.cliente, String(id), entradaDe(form), ctx.sessao.autorNome);
  await auditar(ctx, 'erp_fornecedor_editado', r);
  return concluirCompra(r, anterior, fornecedores, { mudou: 'editado', igual: 'igual' });
}

export async function acaoSituacaoFornecedor(slug: string, id: string, anterior: EstadoNota, form: FormData): Promise<EstadoNota> {
  const { ctx, negado, fornecedores } = await preparar(slug, 'fornecedores.editar');
  if (negado) return recusadoNaNota(anterior, negado);
  const ativo = querAtivo(form);
  const r = await mudarSituacaoFornecedor(ctx.cliente, String(id), ativo, form.get('motivo'), ctx.sessao.autorNome);
  await auditar(ctx, ativo ? 'erp_fornecedor_reativado' : 'erp_fornecedor_desativado', r);
  return concluirCompra(r, anterior, fornecedores, { mudou: ativo ? 'reativado' : 'desativado' });
}
