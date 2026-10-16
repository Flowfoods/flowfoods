'use server';

/**
 * Equipe do parceiro pelo nível 1 (aba Acessos). Toda ação abre com
 * `exigirParceiro(slug)` (sessão do /rodolfo + parceiro resolvido no servidor)
 * e confere `exigirPermissao(ctx, 'acessos.gerir')` — o nível 1 sempre pode,
 * mas a checagem é a mesma de todo o ERP. O nível 1 mexe em qualquer
 * situação do parceiro (prepara os acessos antes de liberar).
 *
 * O link aparece UMA vez, na resposta: o banco guarda só o hash do token.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { atorNivel1 } from '@/lib/erp/credenciais';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import type { EstadoEquipe } from '@/components/erp/telas/equipe/estado';
import {
  executarAtualizar,
  executarCriar,
  executarExcluirPerfil,
  executarLiberar,
  executarNovoLink,
  executarSalvarPerfil,
  executarStatus,
  recusado,
} from '@/components/erp/telas/equipe/executar';

async function contexto(slug: string) {
  const ctx = await exigirParceiro(slug);
  return { ...ctx, ator: atorNivel1(ctx.sessao.autorNome), negado: recusaDaAcao(ctx, 'acessos.gerir') };
}

async function concluir(slug: string, userId: string, evento: string, dados: Record<string, string>, r: EstadoEquipe) {
  if (r?.ok) {
    await prisma.auditLog.create({ data: { userId, evento, dados } });
    revalidatePath(`/rodolfo/erp/${slug}`, 'layout');
  }
  return r;
}

export async function acaoCriarAcesso(slug: string, anterior: EstadoEquipe, form: FormData): Promise<EstadoEquipe> {
  const c = await contexto(slug);
  if (c.negado) return recusado(anterior, c.negado);
  const r = await executarCriar(c.parceiro.id, c.ator, anterior, form);
  return concluir(slug, c.sessao.userId, 'erp_acesso_criado', { parceiroId: c.parceiro.id }, r);
}

export async function acaoAtualizarAcesso(slug: string, acessoId: string, anterior: EstadoEquipe, form: FormData) {
  const c = await contexto(slug);
  if (c.negado) return recusado(anterior, c.negado);
  const r = await executarAtualizar(c.parceiro.id, c.ator, acessoId, anterior, form);
  return concluir(slug, c.sessao.userId, 'erp_acesso_alterado', { parceiroId: c.parceiro.id, acessoId }, r);
}

export async function acaoNovoLink(slug: string, acessoId: string, anterior: EstadoEquipe): Promise<EstadoEquipe> {
  const c = await contexto(slug);
  if (c.negado) return recusado(anterior, c.negado);
  const r = await executarNovoLink(c.parceiro.id, c.ator, acessoId, anterior);
  return concluir(slug, c.sessao.userId, 'erp_acesso_novo_link', { parceiroId: c.parceiro.id, acessoId }, r);
}

export async function acaoDesativarAcesso(
  slug: string,
  acessoId: string,
  anterior: EstadoEquipe,
): Promise<EstadoEquipe> {
  const c = await contexto(slug);
  if (c.negado) return recusado(anterior, c.negado);
  const r = await executarStatus(c.parceiro.id, c.ator, acessoId, 'DESATIVADO', anterior);
  return concluir(slug, c.sessao.userId, 'erp_acesso_desativado', { parceiroId: c.parceiro.id, acessoId }, r);
}

export async function acaoReativarAcesso(
  slug: string,
  acessoId: string,
  anterior: EstadoEquipe,
): Promise<EstadoEquipe> {
  const c = await contexto(slug);
  if (c.negado) return recusado(anterior, c.negado);
  const r = await executarStatus(c.parceiro.id, c.ator, acessoId, 'ATIVO', anterior);
  return concluir(slug, c.sessao.userId, 'erp_acesso_reativado', { parceiroId: c.parceiro.id, acessoId }, r);
}

/** Só o nível 1: libera o e-mail travado pelo limite de tentativas. */
export async function acaoLiberarEntrada(
  slug: string,
  acessoId: string,
  anterior: EstadoEquipe,
): Promise<EstadoEquipe> {
  const c = await contexto(slug);
  if (c.negado) return recusado(anterior, c.negado);
  const r = await executarLiberar(c.parceiro.id, c.ator.nome, acessoId, anterior);
  return concluir(slug, c.sessao.userId, 'erp_acesso_liberado', { parceiroId: c.parceiro.id, acessoId }, r);
}

export async function acaoSalvarPerfil(slug: string, anterior: EstadoEquipe, form: FormData): Promise<EstadoEquipe> {
  const c = await contexto(slug);
  if (c.negado) return recusado(anterior, c.negado);
  const r = await executarSalvarPerfil(c.parceiro.id, c.ator, anterior, form);
  return concluir(slug, c.sessao.userId, 'erp_perfil_salvo', { parceiroId: c.parceiro.id }, r);
}

export async function acaoExcluirPerfil(slug: string, perfilId: string, anterior: EstadoEquipe): Promise<EstadoEquipe> {
  const c = await contexto(slug);
  if (c.negado) return recusado(anterior, c.negado);
  const r = await executarExcluirPerfil(c.parceiro.id, c.ator, perfilId, anterior);
  return concluir(slug, c.sessao.userId, 'erp_perfil_excluido', { parceiroId: c.parceiro.id, perfilId }, r);
}
