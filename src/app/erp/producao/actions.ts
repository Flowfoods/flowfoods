'use server';

/**
 * Ações de produção da pessoa do parceiro em /erp/producao (3.1). Toda ação abre com `exigirParceiroDaSessao()` (o parceiro
 * vem da sessão, nunca do formulário) e confere a permissão com a regra única, JÁ com a loja (`recusaDaAcao` com `lojaId`):
 * planejar, começar, concluir e cancelar = "registrar produção"; estornar o lote concluído = "registrar produção" E
 * "ajustar saldo" (a regra, em `producao.ts`, confere a segunda). 3.2: montar a lista do dia, pôr nela e gerar os lotes = "definir
 * a lista do dia" (a regra, em `producao-lista.ts`, confere de novo). 3.3: pegar (o lote ou a linha da lista de hoje) e soltar =
 * "registrar produção" (soltar o lote de outra pessoa, a regra exige "definir a lista do dia"); passar para outra pessoa = "definir
 * a lista do dia", e quem pode receber vem das credenciais (`pessoasQueProduzem`), nunca do formulário. Esconder o botão é
 * conforto; quem decide é aqui e a regra.
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import type { Permissao } from '@/lib/erp/permissoes';
import type { EstadoEstoque } from '@/components/erp/telas/estoque/estado';
import { recusadoNoEstoque } from '@/components/erp/telas/estoque/executar';
import { pessoasQueProduzem } from '@/lib/erp/credenciais';
import { executarCancelarLote, executarConcluir, executarEstornar, executarGerarLotes, executarPassar, executarPegarDaLista, executarPegarLote, executarPlanejar, executarPorNaLista, executarSalvarLista, executarSoltar } from '@/components/erp/telas/producao/executar';

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

// ================================================================ a cozinha pega a tarefa (3.3)

export async function acaoPegarLote(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarPegarLote(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, BASE);
}

export async function acaoPegarDaLista(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarPegarDaLista(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, BASE);
}

export async function acaoSoltarLote(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.registrar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarSoltar(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, BASE);
}

export async function acaoPassarLote(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  const pessoas = await pessoasQueProduzem(ctx.parceiro.id, String(lojaId));
  return executarPassar(ctx.cliente, ctx.alcance, autor, String(lojaId), pessoas, anterior, form, BASE);
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

// ================================================================ a lista do dia (3.2)

export async function acaoSalvarListaDoDia(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarSalvarLista(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, BASE);
}

export async function acaoGerarLotesDaLista(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarGerarLotes(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, BASE);
}

export async function acaoPorNaListaDoDia(lojaId: string, anterior: EstadoEstoque, form: FormData): Promise<EstadoEstoque> {
  const { ctx, negado, autor } = await preparar(lojaId, 'producao.planejar');
  if (negado) return recusadoNoEstoque(anterior, negado);
  return executarPorNaLista(ctx.cliente, ctx.alcance, autor, String(lojaId), anterior, form, BASE);
}
