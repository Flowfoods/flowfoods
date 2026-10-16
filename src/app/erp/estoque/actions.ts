'use server';

/**
 * Ações de estoque da pessoa do parceiro em /erp/estoque. Toda ação abre com
 * `exigirParceiroDaSessao()` (o parceiro vem da sessão, nunca do formulário)
 * e confere a permissão com a regra única, JÁ com a loja (`recusaDaAcao` com
 * `lojaId`): contar = "fazer contagem"; abrir, concluir e descartar = "ajustar
 * saldo". A regra (`estoque.ts`) confere a loja de novo. Esconder o botão é
 * conforto; quem decide é aqui.
 *
 * 1.7: planejar, aplicar, descartar e fechar o período = "ajustar saldo";
 * contar = "fazer contagem"; mudar as regras da contagem da loja = "cadastrar
 * lojas" (rede inteira). O período vem do parceiro DA SESSÃO.
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import type { ResultadoDoItem } from '@/lib/erp/estoque';
import type { Permissao } from '@/lib/erp/permissoes';
import type { EstadoEstoque, ItemParaSalvar } from '@/components/erp/telas/estoque/estado';
import {
  executarConcluir,
  executarConcluirContagem,
  executarContar,
  executarContarNaContagem,
  executarDescartar,
  executarDescartarContagem,
  executarIniciar,
  executarIniciarCiclo,
  executarIniciarFechamento,
  executarSalvarRegras,
  recusadoNoEstoque,
} from '@/components/erp/telas/estoque/executar';
import { executarAtender, executarCancelar, executarDevolver, executarPedir } from '@/components/erp/telas/requisicoes/executar';

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

// ================================================================ 1.7: contagem do dia a dia

export async function acaoIniciarCiclo(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarIniciarCiclo(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), anterior, form, BASE);
}

export async function acaoContarNaContagem(lojaId: string, contagemId: string, item: ItemParaSalvar): Promise<ResultadoDoItem> {
  const { ctx, negado } = await preparar(lojaId, 'estoque.contar');
  if (negado) return { ok: false, erros: { geral: negado } };
  return executarContarNaContagem(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), String(contagemId), item);
}

export async function acaoConcluirContagem(lojaId: string, contagemId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarConcluirContagem(ctx.cliente, ctx.alcance, ctx.parceiro, ctx.sessao.autorNome, String(lojaId), String(contagemId), anterior, form, BASE);
}

export async function acaoDescartarContagem(lojaId: string, contagemId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarDescartarContagem(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), String(contagemId), anterior, form, BASE);
}

export async function acaoIniciarFechamento(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'estoque.ajustar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarIniciarFechamento(ctx.cliente, ctx.alcance, ctx.parceiro, ctx.sessao.autorNome, String(lojaId), anterior, form, BASE);
}

export async function acaoSalvarRegrasDaContagem(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'lojas.gerir');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarSalvarRegras(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), anterior, form, BASE);
}

// ================================================================ 1.8: requisição

export async function acaoPedirRequisicao(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'requisicao.pedir');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarPedir(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), anterior, form, BASE);
}

export async function acaoAtenderRequisicao(lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'requisicao.atender');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarAtender(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), String(id), anterior, form, BASE);
}

export async function acaoDevolverNaRequisicao(lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado } = await preparar(lojaId, 'requisicao.atender');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarDevolver(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), String(id), anterior, form, BASE);
}

/** Cancelar a pedida: quem pede OU quem atende. */
export async function acaoCancelarRequisicao(lojaId: string, id: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const ctx = await exigirParceiroDaSessao();
  const negado = (recusaDaAcao(ctx, 'requisicao.pedir', { lojaId: String(lojaId) }) && recusaDaAcao(ctx, 'requisicao.atender', { lojaId: String(lojaId) })) || ctx.bloqueio;
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarCancelar(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), String(id), anterior, form, BASE);
}
