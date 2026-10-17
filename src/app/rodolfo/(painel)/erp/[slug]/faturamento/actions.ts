'use server';

/**
 * Ações de faturamento do nível 1 dentro de um parceiro (2.1). Toda ação abre
 * com `exigirParceiro(slug)`: sessão do /rodolfo + parceiro resolvido no
 * servidor + cliente do portão; confere a permissão (`recusaDaAcao`, a mesma
 * regra; o nível 1 sempre pode) e o bloqueio. O slug só escolhe: a loja é lida
 * pelo portão DESTE parceiro. Cada gravação deixa rastro no auditLog.
 */

import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import type { EstadoDaImportacao, EstadoDoDia } from '@/components/erp/telas/faturamento/estado';
import {
  executarImportacaoDoFaturamento,
  executarPreviaDoFaturamento,
  executarRemover,
  executarSalvarDia,
  recusadoNoDia,
} from '@/components/erp/telas/faturamento/executar';

async function preparar(slug: string, lojaId?: string) {
  const ctx = await exigirParceiro(slug);
  const alvo = lojaId === undefined ? {} : { lojaId: String(lojaId) };
  const negado = recusaDaAcao(ctx, 'faturamento.ver', alvo) ?? recusaDaAcao(ctx, 'faturamento.lancar', alvo) ?? ctx.bloqueio;
  return { ctx, negado, base: `/rodolfo/erp/${ctx.parceiro.slug}/faturamento` };
}

export async function acaoSalvarDia(slug: string, lojaId: string, data: string, anterior: EstadoDoDia, form: FormData): Promise<EstadoDoDia> {
  const { ctx, negado, base } = await preparar(slug, lojaId);
  if (negado) return recusadoNoDia(anterior, negado);
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento: 'erp_faturamento_dia', dados: { parceiroId: ctx.parceiro.id, lojaId: String(lojaId), data: String(data) } } });
  return executarSalvarDia(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), String(data), anterior, form, base);
}

export async function acaoRemoverLancamento(slug: string, lojaId: string, data: string, canal: string, anterior: EstadoDoDia, form: FormData): Promise<EstadoDoDia> {
  const { ctx, negado, base } = await preparar(slug, lojaId);
  if (negado) return recusadoNoDia(anterior, negado);
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento: 'erp_faturamento_remover', dados: { parceiroId: ctx.parceiro.id, lojaId: String(lojaId), data: String(data), canal: String(canal) } } });
  return executarRemover(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), String(data), String(canal), anterior, form, base);
}

export async function acaoPreviaDoFaturamento(slug: string, anterior: EstadoDaImportacao, form: FormData): Promise<EstadoDaImportacao> {
  const { ctx, negado } = await preparar(slug);
  if (negado) return { vez: (anterior?.vez ?? 0) + 1, erro: negado };
  return executarPreviaDoFaturamento(ctx.cliente, ctx.alcance, anterior, form);
}

export async function acaoImportarFaturamento(slug: string, anterior: EstadoDaImportacao, form: FormData): Promise<EstadoDaImportacao> {
  const { ctx, negado, base } = await preparar(slug);
  if (negado) return { vez: (anterior?.vez ?? 0) + 1, erro: negado };
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento: 'erp_faturamento_importar', dados: { parceiroId: ctx.parceiro.id } } });
  return executarImportacaoDoFaturamento(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, base);
}
