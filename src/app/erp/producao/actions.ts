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
import { executarCancelarLote, executarConcluir, executarEstornar, executarIniciar, executarPlanejar } from '@/components/erp/telas/producao/executar';

const BASE = '/erp/producao';

async function preparar(lojaId: string, permissao: Permissao) {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, permissao, { lojaId: String(lojaId) }) ?? ctx.bloqueio;
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

export async function acaoCancelarProducao(lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarCancelarLote(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, BASE);
}

export async function acaoEstornarProducao(lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarEstornar(ctx.cliente, ctx.alcance, autor, String(lojaId), String(id), anterior, form, BASE);
}
