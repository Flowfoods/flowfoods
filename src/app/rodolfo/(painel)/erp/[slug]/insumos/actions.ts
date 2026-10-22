'use server';

/**
 * Ações de insumo do nível 1 dentro de um parceiro. Toda ação abre com
 * `exigirParceiro(slug)`: sessão do /rodolfo + parceiro resolvido no servidor
 * + cliente do portão; confere a permissão (`recusaDaAcao`, a mesma regra; o
 * nível 1 sempre pode) e o bloqueio. O slug só escolhe: o id do insumo é lido
 * pelo portão DESTE parceiro, então insumo de outro não é alcançado. Cada
 * gravação deixa rastro no auditLog do /rodolfo.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarInsumo, editarInsumo, mudarSituacaoInsumo, type ResultadoCadastro } from '@/lib/erp/insumos';
import { cadastrarVariante, editarVariante, mudarSituacaoVariante, type ResultadoVariante } from '@/lib/erp/variantes';
import { criarCategoria, excluirCategoria, moverCategoria, mudarSituacaoCategoria, renomearCategoria, type ResultadoCategoria } from '@/lib/erp/categorias';
import { aplicarClassificacao, classificarEmLote, reverterLote } from '@/lib/erp/classificar';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';
import { concluir, entradaDe, querAtivo, recusado } from '@/components/erp/telas/cadastro/executar';
import { concluirNaTela, voltarDaClassificacao, voltarDoMover } from '@/components/erp/telas/insumos/executar-categorias';

async function paraEditar(slug: string) {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, 'insumos.editar') ?? ctx.bloqueio;
  return { ctx, negado, base: `/rodolfo/erp/${ctx.parceiro.slug}/insumos` };
}

type Ctx = Awaited<ReturnType<typeof exigirParceiro>>;

async function auditar(ctx: Ctx, evento: string, r: ResultadoCadastro | ResultadoVariante | ResultadoCategoria, extra: Record<string, string> = {}) {
  if (!r.ok) return;
  await prisma.auditLog.create({
    data: { userId: ctx.sessao.userId, evento, dados: { parceiroId: ctx.parceiro.id, id: r.id, ...extra } },
  });
}

export async function acaoCadastrarInsumo(slug: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const r = await cadastrarInsumo(ctx.cliente, entradaDe(form), ctx.sessao.autorNome);
  await auditar(ctx, 'erp_insumo_criado', r);
  return concluir(r, anterior, base, { mudou: 'criado', repetido: 'criado-repetido' });
}

export async function acaoEditarInsumo(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const r = await editarInsumo(ctx.cliente, String(id), entradaDe(form), ctx.sessao.autorNome);
  await auditar(ctx, 'erp_insumo_alterado', r);
  return concluir(r, anterior, base, { mudou: 'editado', igual: 'igual' });
}

export async function acaoSituacaoInsumo(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const ativo = querAtivo(form);
  const r = await mudarSituacaoInsumo(ctx.cliente, String(id), ativo, form.get('motivo'), ctx.sessao.autorNome);
  await auditar(ctx, ativo ? 'erp_insumo_reativado' : 'erp_insumo_desativado', r);
  return concluir(r, anterior, base, { mudou: ativo ? 'reativado' : 'desativado' });
}

/** `varianteId` vazio = embalagem nova. */
export async function acaoSalvarEmbalagem(
  slug: string,
  insumoId: string,
  varianteId: string,
  anterior: EstadoCadastro,
  form: FormData,
): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const r = varianteId
    ? await editarVariante(ctx.cliente, String(insumoId), String(varianteId), entradaDe(form), ctx.sessao.autorNome)
    : await cadastrarVariante(ctx.cliente, String(insumoId), entradaDe(form), ctx.sessao.autorNome);
  await auditar(ctx, varianteId ? 'erp_embalagem_alterada' : 'erp_embalagem_criada', r, { insumoId: String(insumoId) });
  const feito = varianteId ? { mudou: 'embalagem-editada', igual: 'embalagem-igual' } : { mudou: 'embalagem-criada' };
  return concluir(r, anterior, base, feito, String(insumoId));
}

export async function acaoSituacaoEmbalagem(
  slug: string,
  insumoId: string,
  varianteId: string,
  anterior: EstadoCadastro,
  form: FormData,
): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const ativo = querAtivo(form);
  const r = await mudarSituacaoVariante(ctx.cliente, String(insumoId), String(varianteId), ativo, form.get('motivo'), ctx.sessao.autorNome);
  await auditar(ctx, ativo ? 'erp_embalagem_reativada' : 'erp_embalagem_desativada', r, { insumoId: String(insumoId) });
  return concluir(r, anterior, base, { mudou: ativo ? 'embalagem-reativada' : 'embalagem-desativada' }, String(insumoId));
}

// ---------------------------------------------------------------- categorias (I.1a)

async function paraGerirCategorias(slug: string) {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, 'insumos.categorias') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/insumos`;
  return { ctx, negado, base, categorias: `${base}/categorias`, classificar: `${base}/classificar` };
}

export async function acaoCriarCategoria(slug: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base, categorias } = await paraGerirCategorias(slug);
  if (negado) return recusado(anterior, negado);
  const r = await criarCategoria(ctx.cliente, entradaDe(form), ctx.sessao.autorNome);
  await auditar(ctx, 'erp_categoria_criada', r);
  return concluirNaTela(r, anterior, categorias, { mudou: 'criada' }, base);
}

export async function acaoRenomearCategoria(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base, categorias } = await paraGerirCategorias(slug);
  if (negado) return recusado(anterior, negado);
  const r = await renomearCategoria(ctx.cliente, String(id), entradaDe(form), ctx.sessao.autorNome);
  await auditar(ctx, 'erp_categoria_renomeada', r);
  return concluirNaTela(r, anterior, categorias, { mudou: 'renomeada', igual: 'igual' }, base);
}

export async function acaoSituacaoCategoria(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base, categorias } = await paraGerirCategorias(slug);
  if (negado) return recusado(anterior, negado);
  const ativo = querAtivo(form);
  const r = await mudarSituacaoCategoria(ctx.cliente, String(id), ativo, form.get('motivo'), ctx.sessao.autorNome);
  await auditar(ctx, ativo ? 'erp_categoria_reativada' : 'erp_categoria_desativada', r);
  return concluirNaTela(r, anterior, categorias, { mudou: ativo ? 'reativada' : 'desativada' }, base);
}

export async function acaoExcluirCategoria(slug: string, id: string, anterior: EstadoCadastro): Promise<EstadoCadastro> {
  const { ctx, negado, base, categorias } = await paraGerirCategorias(slug);
  if (negado) return recusado(anterior, negado);
  const r = await excluirCategoria(ctx.cliente, String(id), ctx.sessao.autorNome);
  await auditar(ctx, 'erp_categoria_excluida', r);
  if (r.ok) {
    revalidatePath(base, 'layout');
    redirect(`${categorias}?feito=excluida`);
  }
  return { ok: false, erros: r.erros, vez: (anterior?.vez ?? 0) + 1 };
}

export async function acaoMoverCategoria(slug: string, id: string, direcao: 'subir' | 'descer'): Promise<void> {
  const { ctx, negado, base, categorias } = await paraGerirCategorias(slug);
  if (negado) redirect(`${categorias}?feito=nao-moveu`);
  const r = await moverCategoria(ctx.cliente, String(id), direcao === 'subir' ? 'subir' : 'descer', ctx.sessao.autorNome);
  await auditar(ctx, 'erp_categoria_reordenada', r);
  voltarDoMover(r, categorias, base);
}

// ------------------------------------------------------- classificação (I.1a)

export async function acaoAplicarClassificacao(slug: string): Promise<void> {
  const { ctx, negado, base, classificar } = await paraGerirCategorias(slug);
  if (negado) voltarDaClassificacao(classificar, base, 'recusado');
  const r = await aplicarClassificacao(ctx.cliente, ctx.sessao.autorNome);
  if (!r.lote) voltarDaClassificacao(classificar, base, 'nada');
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento: 'erp_classificacao_aplicada', dados: { parceiroId: ctx.parceiro.id, lote: r.lote, n: r.classificados } } });
  voltarDaClassificacao(classificar, base, 'aplicado', { n: r.classificados, outros: r.emOutros, lote: r.lote });
}

export async function acaoReverterLote(slug: string, form: FormData): Promise<void> {
  const { ctx, negado, base, classificar } = await paraGerirCategorias(slug);
  if (negado) voltarDaClassificacao(classificar, base, 'recusado');
  const r = await reverterLote(ctx.cliente, form.get('lote'), ctx.sessao.autorNome);
  if (!r.ok) voltarDaClassificacao(classificar, base, 'sem-lote');
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento: 'erp_classificacao_revertida', dados: { parceiroId: ctx.parceiro.id, lote: String(form.get('lote')), n: r.voltaram } } });
  voltarDaClassificacao(classificar, base, 'revertido', { n: r.voltaram, mantidos: r.mantidos });
}

export async function acaoClassificarEmLote(slug: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const r = await classificarEmLote(ctx.cliente, form.getAll('ids').filter((x): x is string => typeof x === 'string'), form.get('categoriaId'), ctx.sessao.autorNome);
  if (!r.ok) return recusado(anterior, r.erro);
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento: 'erp_insumos_classificados_em_lote', dados: { parceiroId: ctx.parceiro.id, n: r.classificados } } });
  voltarDaClassificacao(`${base}/classificar`, base, 'lote', { n: r.classificados, iguais: r.iguais });
}
