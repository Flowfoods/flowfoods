'use server';

/**
 * Ações de etiqueta do nível 1 dentro de um parceiro (3.4). Toda ação abre com `exigirParceiro(slug)`: sessão do /rodolfo +
 * parceiro resolvido no servidor + cliente do portão; confere a permissão (`recusaDaAcao`, a mesma regra; o nível 1 sempre
 * pode) e o bloqueio. O slug só escolhe: a loja é lida pelo portão DESTE parceiro. Cada ação deixa rastro no auditLog. O nível 1
 * emite e imprime, mas não abre embalagem (a regra recusa: quem abre assina a etiqueta).
 */

import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import { idsDaEquipe } from '@/lib/erp/credenciais';
import { zplDeTeste, type ResultadoDoPedido } from '@/lib/erp/etiquetas';
import type { ResultadoEstoque } from '@/lib/erp/estoque';
import type { Permissao } from '@/lib/erp/permissoes';
import type { EstadoEstoque } from '@/components/erp/telas/estoque/estado';
import { recusadoNoEstoque } from '@/components/erp/telas/estoque/executar';
import {
  executarAbrir,
  executarEmitirDaAbertura,
  executarEmitirDoLote,
  executarPedir,
  executarRegistrarLote,
  executarResultado,
  executarTirarLote,
  type PedidoDaTela,
} from '@/components/erp/telas/etiquetas/executar';

async function preparar(slug: string, permissao: Permissao, lojaId?: string) {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, permissao, lojaId ? { lojaId: String(lojaId) } : {}) ?? ctx.bloqueio;
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return { ctx, negado, base: `${raiz}/etiquetas`, compras: `${raiz}/compras`, autor: { nome: ctx.sessao.autorNome, userId: ctx.sessao.userId } };
}

async function auditar(ctx: Awaited<ReturnType<typeof exigirParceiro>>, evento: string, dados: Record<string, string>) {
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento, dados: { parceiroId: ctx.parceiro.id, ...dados } } });
}

export async function acaoEmitirDoLote(slug: string, lojaId: string, ordemId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, 'etiquetas.imprimir', lojaId);
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_etiqueta_emitir_lote', { lojaId: String(lojaId), ordemId: String(ordemId) });
  return executarEmitirDoLote(ctx.cliente, ctx.alcance, autor, await idsDaEquipe(ctx.parceiro.id), String(lojaId), String(ordemId), anterior, form, base);
}

export async function acaoAbrirEmbalagem(slug: string, lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, 'etiquetas.imprimir', lojaId);
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_etiqueta_abrir', { lojaId: String(lojaId) });
  return executarAbrir(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, base);
}

export async function acaoEmitirDaAbertura(slug: string, lojaId: string, aberturaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, base, autor } = await preparar(slug, 'etiquetas.imprimir', lojaId);
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_etiqueta_emitir_aberta', { lojaId: String(lojaId), aberturaId: String(aberturaId) });
  return executarEmitirDaAbertura(ctx.cliente, ctx.alcance, autor, String(lojaId), String(aberturaId), anterior, form, base);
}

export async function acaoPedirImpressao(slug: string, lojaId: string, etiquetaId: string, p: PedidoDaTela): Promise<ResultadoDoPedido> {
  const { ctx, negado, autor } = await preparar(slug, 'etiquetas.imprimir', lojaId);
  if (negado) return { ok: false, erros: { geral: negado } };
  await auditar(ctx, 'erp_etiqueta_imprimir', { lojaId: String(lojaId), etiquetaId: String(etiquetaId) });
  return executarPedir(ctx.cliente, ctx.alcance, autor, String(lojaId), String(etiquetaId), p);
}

export async function acaoResultadoDaImpressao(slug: string, lojaId: string, pedidoId: string, resultado: 'ENVIADA' | 'FALHOU', erro: string): Promise<ResultadoEstoque> {
  const { ctx, negado } = await preparar(slug, 'etiquetas.imprimir', lojaId);
  if (negado) return { ok: false, erros: { geral: negado } };
  return executarResultado(ctx.cliente, ctx.alcance, String(lojaId), String(pedidoId), resultado, erro);
}

export async function acaoZplDeTeste(slug: string, formato: string, resolucao: string) {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, 'etiquetas.imprimir');
  if (negado) return { ok: false as const, erro: negado };
  return zplDeTeste(formato, resolucao);
}

export async function acaoRegistrarLote(slug: string, notaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, compras, autor } = await preparar(slug, 'compras.lancar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_lote_da_nota_registrar', { notaId: String(notaId) });
  return executarRegistrarLote(ctx.cliente, ctx.alcance, autor, String(notaId), anterior, form, compras);
}

export async function acaoTirarLote(slug: string, notaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, compras, autor } = await preparar(slug, 'compras.lancar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  await auditar(ctx, 'erp_lote_da_nota_tirar', { notaId: String(notaId) });
  return executarTirarLote(ctx.cliente, ctx.alcance, autor, String(notaId), anterior, form, compras);
}
