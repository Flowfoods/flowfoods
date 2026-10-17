'use server';

/**
 * Ações de faturamento da pessoa do parceiro em /erp/faturamento (2.1). Toda
 * ação abre com `exigirParceiroDaSessao()` (o parceiro vem da sessão, nunca do
 * formulário) e confere a permissão com a regra única, JÁ com a loja
 * (`recusaDaAcao` com `lojaId`): gravar e remover exigem "ver" E "lançar
 * faturamento" naquela loja. A loja e o dia vêm presos à URL (`bind`), nunca de
 * campo do formulário; a regra (`faturamento.ts`) confere a loja de novo, sob
 * a trava do período. Esconder o botão é conforto; quem decide é aqui.
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import type { EstadoDaImportacao, EstadoDoDia } from '@/components/erp/telas/faturamento/estado';
import {
  executarImportacaoDoFaturamento,
  executarPreviaDoFaturamento,
  executarRemover,
  executarSalvarDia,
  recusadoNoDia,
} from '@/components/erp/telas/faturamento/executar';

const BASE = '/erp/faturamento';

async function paraLancar(lojaId: string) {
  const ctx = await exigirParceiroDaSessao();
  const loja = { lojaId: String(lojaId) };
  const negado = recusaDaAcao(ctx, 'faturamento.ver', loja) ?? recusaDaAcao(ctx, 'faturamento.lancar', loja) ?? ctx.bloqueio;
  return { ctx, negado };
}

export async function acaoSalvarDia(lojaId: string, data: string, anterior: EstadoDoDia, form: FormData): Promise<EstadoDoDia> {
  const { ctx, negado } = await paraLancar(lojaId);
  if (negado) return recusadoNoDia(anterior, negado);
  return executarSalvarDia(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), String(data), anterior, form, BASE);
}

export async function acaoRemoverLancamento(lojaId: string, data: string, canal: string, anterior: EstadoDoDia, form: FormData): Promise<EstadoDoDia> {
  const { ctx, negado } = await paraLancar(lojaId);
  if (negado) return recusadoNoDia(anterior, negado);
  return executarRemover(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(lojaId), String(data), String(canal), anterior, form, BASE);
}

/** A planilha vale para várias lojas: a regra confere "ver" e "lançar" em CADA linha. */
async function paraImportar() {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'faturamento.ver') ?? recusaDaAcao(ctx, 'faturamento.lancar') ?? ctx.bloqueio;
  return { ctx, negado };
}

export async function acaoPreviaDoFaturamento(anterior: EstadoDaImportacao, form: FormData): Promise<EstadoDaImportacao> {
  const { ctx, negado } = await paraImportar();
  if (negado) return { vez: (anterior?.vez ?? 0) + 1, erro: negado };
  return executarPreviaDoFaturamento(ctx.cliente, ctx.alcance, anterior, form);
}

export async function acaoImportarFaturamento(anterior: EstadoDaImportacao, form: FormData): Promise<EstadoDaImportacao> {
  const { ctx, negado } = await paraImportar();
  if (negado) return { vez: (anterior?.vez ?? 0) + 1, erro: negado };
  return executarImportacaoDoFaturamento(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, BASE);
}
