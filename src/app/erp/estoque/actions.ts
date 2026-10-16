'use server';

/**
 * Ações de estoque da pessoa do parceiro em /erp/estoque. Toda ação abre com
 * `exigirParceiroDaSessao()` (o parceiro vem da sessão, nunca do formulário)
 * e confere a permissão com a regra única, JÁ com a loja (`recusaDaAcao` com
 * `lojaId`): contar = "fazer contagem"; abrir, concluir e descartar = "ajustar
 * saldo". A regra (`estoque.ts`) confere a loja de novo. Esconder o botão é
 * conforto; quem decide é aqui.
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import type { ResultadoDoItem } from '@/lib/erp/estoque';
import type { Permissao } from '@/lib/erp/permissoes';
import type { EstadoEstoque, ItemParaSalvar } from '@/components/erp/telas/estoque/estado';
import { executarConcluir, executarContar, executarDescartar, executarIniciar, recusadoNoEstoque } from '@/components/erp/telas/estoque/executar';

const BASE = '/erp/estoque';

async function preparar(lojaId: string, permissao: Permissao) {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, permissao, { lojaId: String(lojaId) }) ?? ctx.bloqueio;
  return { ctx, negado };
}

export async function acaoIniciarAbertura(lojaId: string, anterior: EstadoEstoque): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarIniciar(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), anterior, BASE);
}

export async function acaoContarItem(lojaId: string, item: ItemParaSalvar): Promise<ResultadoDoItem> {
  const { ctx, negado } = await preparar(lojaId, 'estoque.contar');
  if (negado) return { ok: false, erros: { geral: negado } };
  return executarContar(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), item);
}

export async function acaoConcluirAbertura(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarConcluir(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), anterior, form, BASE);
}

export async function acaoDescartarAbertura(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarDescartar(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), anterior, form, BASE);
}
