'use server';

/**
 * Ações do DRE do nível 1 dentro de um parceiro (2.2a). Toda ação abre com
 * `exigirParceiro(slug)`: sessão do /rodolfo + parceiro resolvido no servidor +
 * cliente do portão; confere a permissão (`recusaDaAcao`, a mesma regra; o nível
 * 1 sempre pode) e o bloqueio. O slug só escolhe: tudo é lido pelo portão DESTE
 * parceiro. Cada gravação deixa rastro no auditLog.
 */

import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import type { EstadoCadastro, EstadoLocal, EstadoMesPassado } from '@/components/erp/telas/dre/estado';
import {
  executarCriarLinha,
  executarEditarDespesa,
  executarLancarDespesa,
  executarMesPassado,
  executarMudancaSemDre,
  executarOcultarLinha,
  executarRegra,
  executarRemoverDespesa,
  executarRenomearLinha,
  recusadoNaDespesa,
} from '@/components/erp/telas/dre/executar';

async function paraDespesa(slug: string, evento: string, dados: Record<string, string> = {}) {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, 'despesas.lancar') ?? ctx.bloqueio;
  if (!negado) await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento, dados: { parceiroId: ctx.parceiro.id, ...dados } } });
  return { ctx, negado, raiz: `/rodolfo/erp/${ctx.parceiro.slug}` };
}

export async function acaoLancarDespesa(slug: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, raiz } = await paraDespesa(slug, 'erp_despesa_lancar');
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarLancarDespesa(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, raiz);
}

export async function acaoEditarDespesa(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, raiz } = await paraDespesa(slug, 'erp_despesa_editar', { despesaId: String(id) });
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarEditarDespesa(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, raiz);
}

export async function acaoRemoverDespesa(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, raiz } = await paraDespesa(slug, 'erp_despesa_remover', { despesaId: String(id) });
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarRemoverDespesa(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, raiz);
}

export async function acaoPagarDespesa(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, raiz } = await paraDespesa(slug, 'erp_despesa_pagar', { despesaId: String(id) });
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarMudancaSemDre('pagar', ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, raiz);
}

export async function acaoDesfazerPagamento(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, raiz } = await paraDespesa(slug, 'erp_despesa_desfazer_pagamento', { despesaId: String(id) });
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarMudancaSemDre('desfazer', ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, raiz);
}

export async function acaoPararDeRepetir(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, raiz } = await paraDespesa(slug, 'erp_despesa_parar_de_repetir', { despesaId: String(id) });
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarMudancaSemDre('parar', ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, raiz);
}

export async function acaoLancarDoMesPassado(slug: string, anterior: EstadoMesPassado, form: FormData): Promise<EstadoMesPassado> {
  const { ctx, negado, raiz } = await paraDespesa(slug, 'erp_despesa_mes_passado');
  if (negado) return { ok: false, erro: negado, vez: (anterior?.vez ?? 0) + 1 };
  return executarMesPassado(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, raiz);
}

// ------------------------------------------------------------------ período e plano de contas

async function paraOPlano(slug: string, evento: string) {
  const ctx = await exigirParceiro(slug);
  const negado = recusaDaAcao(ctx, 'metas.editar') ?? ctx.bloqueio;
  if (!negado) await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento, dados: { parceiroId: ctx.parceiro.id } } });
  return { ctx, negado, raiz: `/rodolfo/erp/${ctx.parceiro.slug}` };
}

const recusadoLocal = (anterior: EstadoLocal, motivo: string): EstadoLocal => ({ ok: false, erros: { geral: motivo }, vez: (anterior?.vez ?? 0) + 1 });

export async function acaoSalvarRegraDoPeriodo(slug: string, anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado, raiz } = await paraOPlano(slug, 'erp_dre_regra_do_periodo');
  if (negado) return recusadoLocal(anterior, negado);
  return executarRegra(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, raiz);
}

export async function acaoCriarLinhaDoPlano(slug: string, anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado, raiz } = await paraOPlano(slug, 'erp_dre_linha_criar');
  if (negado) return recusadoLocal(anterior, negado);
  return executarCriarLinha(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, raiz);
}

export async function acaoRenomearLinhaDoPlano(slug: string, anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado, raiz } = await paraOPlano(slug, 'erp_dre_linha_renomear');
  if (negado) return recusadoLocal(anterior, negado);
  return executarRenomearLinha(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, raiz);
}

export async function acaoOcultarLinhaDoPlano(slug: string, anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado, raiz } = await paraOPlano(slug, 'erp_dre_linha_ocultar');
  if (negado) return recusadoLocal(anterior, negado);
  return executarOcultarLinha(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, raiz);
}
