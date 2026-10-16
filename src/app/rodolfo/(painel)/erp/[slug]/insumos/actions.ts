'use server';

/**
 * Ações de insumo do nível 1 dentro de um parceiro. Toda ação abre com
 * `exigirParceiro(slug)`: sessão do /rodolfo + parceiro resolvido no servidor
 * + cliente do portão; confere a permissão (`recusaDaAcao`, a mesma regra; o
 * nível 1 sempre pode) e o bloqueio. O slug só escolhe: o id do insumo é lido
 * pelo portão DESTE parceiro, então insumo de outro não é alcançado. Cada
 * gravação deixa rastro no auditLog do /rodolfo.
 */

import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarInsumo, editarInsumo, mudarSituacaoInsumo, type ResultadoCadastro } from '@/lib/erp/insumos';
import { cadastrarVariante, editarVariante, mudarSituacaoVariante, type ResultadoVariante } from '@/lib/erp/variantes';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';
import { concluir, entradaDe, querAtivo, recusado } from '@/components/erp/telas/cadastro/executar';

async function paraEditar(slug: string) {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, 'insumos.editar') ?? ctx.bloqueio;
  return { ctx, negado, base: `/rodolfo/erp/${ctx.parceiro.slug}/insumos` };
}

type Ctx = Awaited<ReturnType<typeof exigirParceiro>>;

async function auditar(ctx: Ctx, evento: string, r: ResultadoCadastro | ResultadoVariante, extra: Record<string, string> = {}) {
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
  return concluir(r, anterior, base, { mudou: 'criado' });
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
