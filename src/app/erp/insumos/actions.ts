'use server';

/**
 * Ações de insumo da pessoa do parceiro em /erp/insumos. Toda ação abre com
 * `exigirParceiroDaSessao()` (o parceiro vem da sessão, nunca do formulário),
 * confere "cadastrar e editar insumos" com a regra única (`recusaDaAcao`) e o
 * bloqueio do parceiro. Esconder o botão é conforto; quem decide é aqui. E o
 * cliente de parceiro não ativo é somente leitura (portão e banco recusam).
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarInsumo, editarInsumo, mudarSituacaoInsumo } from '@/lib/erp/insumos';
import { cadastrarVariante, editarVariante, mudarSituacaoVariante } from '@/lib/erp/variantes';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';
import { concluir, entradaDe, querAtivo, recusado } from '@/components/erp/telas/cadastro/executar';

const BASE = '/erp/insumos';

/** Contexto de quem pode editar agora, ou a frase da recusa. */
async function paraEditar() {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'insumos.editar') ?? ctx.bloqueio;
  return { ctx, negado };
}

export async function acaoCadastrarInsumo(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const r = await cadastrarInsumo(ctx.cliente, entradaDe(form), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'criado' });
}

export async function acaoEditarInsumo(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const r = await editarInsumo(ctx.cliente, String(id), entradaDe(form), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'editado', igual: 'igual' });
}

export async function acaoSituacaoInsumo(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const ativo = querAtivo(form);
  const r = await mudarSituacaoInsumo(ctx.cliente, String(id), ativo, form.get('motivo'), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: ativo ? 'reativado' : 'desativado' });
}

/** `varianteId` vazio = embalagem nova. */
export async function acaoSalvarEmbalagem(
  insumoId: string,
  varianteId: string,
  anterior: EstadoCadastro,
  form: FormData,
): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const r = varianteId
    ? await editarVariante(ctx.cliente, String(insumoId), String(varianteId), entradaDe(form), ctx.sessao.autorNome)
    : await cadastrarVariante(ctx.cliente, String(insumoId), entradaDe(form), ctx.sessao.autorNome);
  const feito = varianteId ? { mudou: 'embalagem-editada', igual: 'embalagem-igual' } : { mudou: 'embalagem-criada' };
  return concluir(r, anterior, BASE, feito, String(insumoId));
}

export async function acaoSituacaoEmbalagem(
  insumoId: string,
  varianteId: string,
  anterior: EstadoCadastro,
  form: FormData,
): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const ativo = querAtivo(form);
  const r = await mudarSituacaoVariante(ctx.cliente, String(insumoId), String(varianteId), ativo, form.get('motivo'), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: ativo ? 'embalagem-reativada' : 'embalagem-desativada' }, String(insumoId));
}
