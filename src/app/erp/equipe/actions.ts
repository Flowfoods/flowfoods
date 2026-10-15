'use server';

/**
 * Equipe pelo próprio parceiro (/erp/equipe). Toda ação abre com
 * `exigirParceiroDaSessao()` (o parceiro vem SÓ da sessão; a pessoa precisa
 * ter vínculo ATIVO nele) e confere "cuidar da equipe" com a regra única
 * (`recusaDaAcao` = `exigirPermissao`). O ator é a própria pessoa, com o
 * alcance dela: `credenciais.ts` recusa dar o que ela não tem, mexer em quem
 * está acima e deixar o parceiro sem administrador. Parceiro suspenso ou
 * aguardando: só leitura, também para a equipe.
 */

import { revalidatePath } from 'next/cache';
import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import type { Ator } from '@/lib/erp/credenciais';
import type { EstadoEquipe } from '@/app/rodolfo/erp/equipe/estado';
import {
  executarAtualizar,
  executarCriar,
  executarExcluirPerfil,
  executarNovoLink,
  executarSalvarPerfil,
  executarStatus,
  recusado,
} from '@/app/rodolfo/erp/equipe/executar';

async function contexto(): Promise<{ parceiroId: string; ator: Ator; negado: string | null }> {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'acessos.gerir') ?? ctx.bloqueio;
  return {
    parceiroId: ctx.parceiro.id,
    ator: { nome: ctx.pessoa.usuario.nome, alcance: ctx.alcance, acessoId: ctx.pessoa.acessoId },
    negado,
  };
}

function concluir(r: EstadoEquipe) {
  if (r?.ok) revalidatePath('/erp', 'layout');
  return r;
}

export async function acaoCriarPessoa(anterior: EstadoEquipe, form: FormData): Promise<EstadoEquipe> {
  const c = await contexto();
  if (c.negado) return recusado(anterior, c.negado);
  return concluir(await executarCriar(c.parceiroId, c.ator, anterior, form));
}

export async function acaoAtualizarPessoa(
  acessoId: string,
  anterior: EstadoEquipe,
  form: FormData,
): Promise<EstadoEquipe> {
  const c = await contexto();
  if (c.negado) return recusado(anterior, c.negado);
  return concluir(await executarAtualizar(c.parceiroId, c.ator, acessoId, anterior, form));
}

export async function acaoLinkDaPessoa(acessoId: string, anterior: EstadoEquipe): Promise<EstadoEquipe> {
  const c = await contexto();
  if (c.negado) return recusado(anterior, c.negado);
  return concluir(await executarNovoLink(c.parceiroId, c.ator, acessoId, anterior));
}

export async function acaoDesativarPessoa(acessoId: string, anterior: EstadoEquipe): Promise<EstadoEquipe> {
  const c = await contexto();
  if (c.negado) return recusado(anterior, c.negado);
  return concluir(await executarStatus(c.parceiroId, c.ator, acessoId, 'DESATIVADO', anterior));
}

export async function acaoReativarPessoa(acessoId: string, anterior: EstadoEquipe): Promise<EstadoEquipe> {
  const c = await contexto();
  if (c.negado) return recusado(anterior, c.negado);
  return concluir(await executarStatus(c.parceiroId, c.ator, acessoId, 'ATIVO', anterior));
}

export async function acaoSalvarPerfilDaEquipe(anterior: EstadoEquipe, form: FormData): Promise<EstadoEquipe> {
  const c = await contexto();
  if (c.negado) return recusado(anterior, c.negado);
  return concluir(await executarSalvarPerfil(c.parceiroId, c.ator, anterior, form));
}

export async function acaoExcluirPerfilDaEquipe(perfilId: string, anterior: EstadoEquipe): Promise<EstadoEquipe> {
  const c = await contexto();
  if (c.negado) return recusado(anterior, c.negado);
  return concluir(await executarExcluirPerfil(c.parceiroId, c.ator, perfilId, anterior));
}
