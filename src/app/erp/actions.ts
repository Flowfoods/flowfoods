'use server';

/**
 * Ações da pessoa do parceiro em /erp. Toda ação abre com
 * `exigirParceiroDaSessao()`: o parceiro vem da sessão, nunca do formulário. E
 * confere a permissão com a regra única (`recusaDaAcao` = `exigirPermissao`):
 * esconder o botão é conforto; quem decide é aqui. Parceiro não ativo: o
 * cliente é somente leitura (portão e banco recusam).
 */

import { revalidatePath } from 'next/cache';
import { exigirParceiroDaSessao, exigirPessoa, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarLoja, cadastrarMarca } from '@/lib/erp/estrutura';
import type { EstadoForm } from '@/app/rodolfo/erp/campos';
import {
  concluirRegistroDeRosto,
  ERRO_ATIVAR_ROSTO,
  iniciarRegistroDeRosto,
  LimiteDoRosto,
  podeAtivarRosto,
  removerRosto,
} from '@/lib/erp/credenciais';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import type { RegistrationResponseJSON } from '@/lib/erp/rosto';
import { aparelhoAtual } from '@/lib/erp/sessao';
import type { EstadoCadastro } from '@/app/rodolfo/erp/[slug]/actions';

export async function acaoCadastrarInsumoDaSessao(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiroDaSessao();
  const vez = (anterior?.vez ?? 0) + 1;
  const negado = recusaDaAcao(ctx, 'insumos.editar');
  if (negado) return { ok: false, erros: { geral: negado }, vez };
  if (ctx.bloqueio) return { ok: false, erros: { geral: ctx.bloqueio }, vez };
  const r = await cadastrarInsumo(ctx.cliente, Object.fromEntries(form), ctx.sessao.autorNome);
  if (r.ok) revalidatePath('/erp');
  return { ...r, vez };
}

/** Lojas e marcas são da rede: "cadastrar lojas e marcas" exige a rede inteira (a regra está no catálogo). */
async function cadastrarEstruturaDaSessao(tipo: 'loja' | 'marca', anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiroDaSessao();
  const vez = (anterior?.vez ?? 0) + 1;
  const negado = recusaDaAcao(ctx, 'lojas.gerir');
  if (negado) return { ok: false, erros: { geral: negado }, vez };
  if (ctx.bloqueio) return { ok: false, erros: { geral: ctx.bloqueio }, vez };
  const r = await (tipo === 'loja' ? cadastrarLoja : cadastrarMarca)(ctx.cliente, Object.fromEntries(form), ctx.sessao.autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, vez };
  revalidatePath('/erp', 'layout');
  return { ok: true, mensagem: `“${r.nome}” cadastrada.`, vez };
}

export async function acaoCadastrarLojaDaSessao(anterior: EstadoForm, form: FormData) {
  return cadastrarEstruturaDaSessao('loja', anterior, form);
}

export async function acaoCadastrarMarcaDaSessao(anterior: EstadoForm, form: FormData) {
  return cadastrarEstruturaDaSessao('marca', anterior, form);
}

export async function acaoOpcoesDeAtivarRosto() {
  const pessoa = await exigirPessoa();
  if (!podeAtivarRosto(pessoa)) return { ok: false as const, erro: ERRO_ATIVAR_ROSTO };
  try {
    return { ok: true as const, opcoes: await iniciarRegistroDeRosto(pessoa) };
  } catch (e) {
    if (e instanceof LimiteDoRosto) return { ok: false as const, erro: 'Muitos pedidos seguidos. Espere 5 minutos.' };
    throw e;
  }
}

export async function acaoConfirmarRosto(resposta: RegistrationResponseJSON) {
  const pessoa = await exigirPessoa();
  if (!resposta || typeof resposta !== 'object') return { ok: false as const, erro: 'Resposta inválida do aparelho.' };
  const r = await concluirRegistroDeRosto(pessoa, resposta, aparelhoAtual());
  if (r.ok) revalidatePath('/erp/acesso');
  return r;
}

export async function acaoRemoverRosto(passkeyId: string) {
  const pessoa = await exigirPessoa();
  const r = await removerRosto(pessoa, String(passkeyId));
  if (r.ok) revalidatePath('/erp/acesso');
  return r;
}
