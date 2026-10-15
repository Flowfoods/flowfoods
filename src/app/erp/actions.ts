'use server';

/**
 * Ações da pessoa do parceiro em /erp. Toda ação abre com
 * `exigirParceiroDaSessao()`: o parceiro vem da sessão, nunca do formulário.
 * Parceiro não ativo: o cliente é somente leitura (portão e banco recusam).
 */

import { revalidatePath } from 'next/cache';
import { exigirParceiroDaSessao, exigirPessoa } from '@/lib/erp/contexto';
import {
  concluirRegistroDeRosto,
  ERRO_ATIVAR_ROSTO,
  iniciarRegistroDeRosto,
  podeAtivarRosto,
  removerRosto,
} from '@/lib/erp/credenciais';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import type { RegistrationResponseJSON } from '@/lib/erp/rosto';
import { aparelhoAtual } from '@/lib/erp/sessao';
import type { EstadoCadastro } from '@/app/rodolfo/erp/[slug]/actions';

export async function acaoCadastrarInsumoDaSessao(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { sessao, cliente, bloqueio } = await exigirParceiroDaSessao();
  const vez = (anterior?.vez ?? 0) + 1;
  if (bloqueio) return { ok: false, erros: { geral: bloqueio }, vez };
  const r = await cadastrarInsumo(cliente, Object.fromEntries(form), sessao.autorNome);
  if (r.ok) revalidatePath('/erp');
  return { ...r, vez };
}

export async function acaoOpcoesDeAtivarRosto() {
  const pessoa = await exigirPessoa();
  if (!podeAtivarRosto(pessoa)) return { ok: false as const, erro: ERRO_ATIVAR_ROSTO };
  return { ok: true as const, opcoes: await iniciarRegistroDeRosto(pessoa) };
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
