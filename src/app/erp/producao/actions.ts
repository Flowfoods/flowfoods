'use server';

/**
 * Ações de produção da pessoa do parceiro em /erp/producao (3.1). Toda ação abre com `exigirParceiroDaSessao()` (o parceiro
 * vem da sessão, nunca do formulário) e confere a permissão com a regra única, JÁ com a loja (`recusaDaAcao` com `lojaId`):
 * planejar, começar, concluir e cancelar = "registrar produção"; estornar o lote concluído = "registrar produção" E
 * "ajustar saldo" (a regra, em `producao.ts`, confere a segunda). Esconder o botão é conforto; quem decide é aqui e a regra.
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import type { Permissao } from '@/lib/erp/permissoes';
import type { EstadoEstoque } from '@/components/erp/telas/estoque/estado';
import { recusadoNoEstoque } from '@/components/erp/telas/estoque/executar';
import { executarCancelarLote, executarConcluir, executarConfirmarLista, executarEstornar, executarIniciar, executarPlanejar } from '@/components/erp/telas/producao/executar';

const BASE = '/erp/producao';

/** `permissao` pode ser uma lista: passa quem tem QUALQUER uma (cancelar: o lote avulso pede "registrar", o da lista pede "definir"). */
async function preparar(lojaId: string, permissao: Permissao | readonly Permissao[]) {
  const ctx = await exigirParceiroDaSessao();
  const recusas = (typeof permissao === 'string' ? [permissao] : permissao).map((p) => recusaDaAcao(ctx, p, { lojaId: String(lojaId) }));
  const negado = (recusas.every(Boolean) ? recusas[0] : null) ?? ctx.bloqueio;
  return { ctx, negado, autor: { nome: ctx.sessao.autorNome, userId: ctx.sessao.userId } };
}

export async function acaoPlanejarProducao(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarPlanejar(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, BASE);
}

export async function acaoIniciarProducao(lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarIniciar(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, BASE);
}

export async function acaoConcluirProducao(lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarConcluir(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, BASE);
}

/** Confirmar a lista do dia (3.2): "definir a lista do dia" NA loja. */
export async function acaoConfirmarLista(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarConfirmarLista(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, BASE);
}

export async function acaoCancelarProducao(lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  // Lote avulso: "registrar produção"; lote da lista do dia: "definir a lista" (a regra, em `producao.ts`, confere a do lote).
  const { ctx, negado, autor } = await preparar(lojaId, ['producao.registrar', 'producao.planejar']);
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarCancelarLote(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, BASE);
}

export async function acaoEstornarProducao(lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarEstornar(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, BASE);
}
