'use server';

/**
 * Ações de etiqueta da pessoa do parceiro em /erp/etiquetas (3.4). Toda ação abre com `exigirParceiroDaSessao()` (o parceiro
 * vem da sessão, nunca do formulário) e confere a permissão com a regra única, JÁ com a loja: emitir, abrir a embalagem e
 * pedir a impressão = "imprimir etiquetas" (por loja). O lote do fornecedor na nota = "lançar nota de compra" (a regra confere a
 * loja da nota). Quem fez o lote vem das credenciais (a equipe), nunca do formulário. Esconder o botão é conforto; quem
 * decide é aqui e a regra.
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import { idsDaEquipe } from '@/lib/erp/credenciais';
import { zplDeTeste, type ResultadoDoPedido } from '@/lib/erp/etiquetas';
import type { ResultadoEstoque } from '@/lib/erp/estoque';
import type { Permissao } from '@/lib/erp/permissoes';
import type { EstadoEstoque } from '@/components/erp/telas/estoque/estado';
import { recusadoNoEstoque } from '@/components/erp/telas/estoque/executar';
import {
  executarAbrir,
  executarConfirmar,
  executarEmitirDaAbertura,
  executarEmitirDoLote,
  executarPedir,
  executarRegistrarLote,
  executarResultado,
  executarTirarLote,
  type PedidoDaTela,
} from '@/components/erp/telas/etiquetas/executar';

const BASE = '/erp/etiquetas';
const COMPRAS = '/erp/compras';

async function preparar(permissao: Permissao, lojaId?: string) {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, permissao, lojaId ? { lojaId: String(lojaId) } : {}) ?? ctx.bloqueio;
  return { ctx, negado, autor: { nome: ctx.sessao.autorNome, userId: ctx.sessao.userId } };
}

export async function acaoEmitirDoLote(lojaId: string, ordemId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar('etiquetas.imprimir', lojaId);
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarEmitirDoLote(ctx.cliente, ctx.alcance, autor, await idsDaEquipe(ctx.parceiro.id), String(lojaId), String(ordemId), anterior, form, BASE);
}

export async function acaoAbrirEmbalagem(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar('etiquetas.imprimir', lojaId);
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarAbrir(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, BASE);
}

export async function acaoEmitirDaAbertura(lojaId: string, aberturaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar('etiquetas.imprimir', lojaId);
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarEmitirDaAbertura(ctx.cliente, ctx.alcance, autor, String(lojaId), String(aberturaId), anterior, form, BASE);
}

export async function acaoPedirImpressao(lojaId: string, etiquetaId: string, p: PedidoDaTela): Promise<ResultadoDoPedido> {
  const { ctx, negado, autor } = await preparar('etiquetas.imprimir', lojaId);
  if (negado) return { ok: false, erros: { geral: negado } };
  return executarPedir(ctx.cliente, ctx.alcance, autor, String(lojaId), String(etiquetaId), p);
}

export async function acaoResultadoDaImpressao(lojaId: string, pedidoId: string, resultado: 'ENVIADA' | 'FALHOU', erro: string): Promise<ResultadoEstoque> {
  const { ctx, negado } = await preparar('etiquetas.imprimir', lojaId);
  if (negado) return { ok: false, erros: { geral: negado } };
  return executarResultado(ctx.cliente, ctx.alcance, String(lojaId), String(pedidoId), resultado, erro);
}

/** "Já imprimi": a etiqueta saiu no papel (arquivo, papel A4 ou a Zebra que não respondeu); sai da fila com quem e quando. */
export async function acaoConfirmarImpressao(lojaId: string, etiquetaId: string): Promise<ResultadoEstoque> {
  const { ctx, negado, autor } = await preparar('etiquetas.imprimir', lojaId);
  if (negado) return { ok: false, erros: { geral: negado } };
  return executarConfirmar(ctx.cliente, ctx.alcance, autor, String(lojaId), String(etiquetaId), BASE);
}

/** A etiqueta de teste: dados fictícios, nada gravado. Basta imprimir etiquetas em alguma loja. */
export async function acaoZplDeTeste(formato: string, resolucao: string) {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'etiquetas.imprimir');
  if (negado) return { ok: false as const, erro: negado };
  return zplDeTeste(formato, resolucao);
}

// ================================================================ o lote do fornecedor na nota (Compras)

export async function acaoRegistrarLote(notaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar('compras.lancar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarRegistrarLote(ctx.cliente, ctx.alcance, autor, String(notaId), anterior, form, COMPRAS);
}

export async function acaoTirarLote(notaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar('compras.lancar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarTirarLote(ctx.cliente, ctx.alcance, autor, String(notaId), anterior, form, COMPRAS);
}
