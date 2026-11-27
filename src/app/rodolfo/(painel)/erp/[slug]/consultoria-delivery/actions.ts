'use server';

import { revalidatePath } from 'next/cache';
import { exigirParceiro } from '@/lib/erp/contexto';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import type { EstadoForm } from '@/components/erp/ui/campos';

function revalidarConsultoria(slug: string) {
  revalidatePath('/erp', 'layout');
  revalidatePath(`/rodolfo/erp/${encodeURIComponent(slug)}/consultoria-delivery`);
}

export async function acaoLiberarConsultoria(slug: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { cliente, parceiro, sessao, podeEscrever, bloqueio } = await exigirParceiro(slug);
  const vez = (anterior?.vez ?? 0) + 1;
  if (!podeEscrever) return { ok: false, erros: { geral: bloqueio ?? 'Este parceiro está em modo de leitura.' }, vez };
  const selecao = form.getAll('conexao');
  if (selecao.length !== 1 || typeof selecao[0] !== 'string') {
    return { ok: false, erros: { geral: 'Escolha uma origem Analytics.' }, vez };
  }
  const r = await mudarLiberacao(cliente, 'consultoria-de-delivery', true, sessao.autorNome, {
    conexaoId: selecao[0], ambiente: parceiro.homologacaoDeIntegracao ? 'TEST' : 'PRODUCAO',
  });
  if (!r.ok) return { ok: false, erros: { geral: r.erro }, vez };
  if (r.mudou) revalidarConsultoria(parceiro.slug);
  return { ok: true, mensagem: 'Recorte da Consultoria liberado no parceiro.', vez };
}

export async function acaoPausarConsultoria(slug: string) {
  const { cliente, parceiro, sessao, podeEscrever, bloqueio } = await exigirParceiro(slug);
  if (!podeEscrever) return { ok: false, mensagem: bloqueio ?? 'Este parceiro está em modo de leitura.' };
  const r = await mudarLiberacao(cliente, 'consultoria-de-delivery', false, sessao.autorNome);
  if (!r.ok) return { ok: false, mensagem: r.erro };
  if (r.mudou) revalidarConsultoria(parceiro.slug);
  return { ok: true, mensagem: 'Prévia da Consultoria pausada no parceiro.' };
}
