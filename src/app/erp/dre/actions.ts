'use server';

/**
 * Ações do DRE da pessoa do parceiro em /erp/dre (2.2a). Toda ação abre com
 * `exigirParceiroDaSessao()` (o parceiro vem da sessão, nunca do formulário) e
 * confere a permissão com a regra única: despesas pedem "lançar despesas" (a
 * regra confere a loja de antes e a de depois, e a rede inteira para a despesa da
 * rede); plano de contas, período e metas pedem "definir metas, plano de contas e
 * período" (que só vale com a rede inteira). O id da despesa vem preso à URL
 * (`bind`), nunca de campo do formulário. Esconder o botão é conforto; quem
 * decide é aqui e na regra.
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import type { EstadoCadastro, EstadoLocal, EstadoMesPassado } from '@/components/erp/telas/dre/estado';
import {
  executarCriarLinha,
  executarFechar,
  executarSalvarMetas,
  executarEditarDespesa,
  executarLancarDespesa,
  executarMesPassado,
  executarMudancaSemDre,
  executarOcultarLinha,
  executarRegra,
  executarRemoverDespesa,
  executarRenomearLinha,
  recusadoNaDespesa,
} from '@/components/erp/telas/dre/executar';

const RAIZ = '/erp';

async function paraDespesa(form?: FormData) {
  const ctx = await exigirParceiroDaSessao();
  const loja = form?.get('lojaId');
  const alvo = typeof loja === 'string' && loja !== '' ? { lojaId: loja } : {};
  const negado = recusaDaAcao(ctx, 'despesas.lancar', alvo) ?? ctx.bloqueio;
  return { ctx, negado };
}

export async function acaoLancarDespesa(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraDespesa(form);
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarLancarDespesa(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, RAIZ);
}

export async function acaoEditarDespesa(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraDespesa(form);
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarEditarDespesa(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, RAIZ);
}

export async function acaoRemoverDespesa(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraDespesa();
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarRemoverDespesa(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, RAIZ);
}

export async function acaoPagarDespesa(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraDespesa();
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarMudancaSemDre('pagar', ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, RAIZ);
}

export async function acaoDesfazerPagamento(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraDespesa();
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarMudancaSemDre('desfazer', ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, RAIZ);
}

export async function acaoPararDeRepetir(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraDespesa();
  if (negado) return recusadoNaDespesa(anterior, negado);
  return executarMudancaSemDre('parar', ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(id), anterior, form, RAIZ);
}

export async function acaoLancarDoMesPassado(anterior: EstadoMesPassado, form: FormData): Promise<EstadoMesPassado> {
  const { ctx, negado } = await paraDespesa();
  if (negado) return { ok: false, erro: negado, vez: (anterior?.vez ?? 0) + 1 };
  return executarMesPassado(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, RAIZ);
}

// ------------------------------------------------------------------ período e plano de contas

async function paraOPlano() {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'metas.editar') ?? ctx.bloqueio;
  return { ctx, negado };
}

const recusadoLocal = (anterior: EstadoLocal, motivo: string): EstadoLocal => ({ ok: false, erros: { geral: motivo }, vez: (anterior?.vez ?? 0) + 1 });

export async function acaoSalvarRegraDoPeriodo(anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado } = await paraOPlano();
  if (negado) return recusadoLocal(anterior, negado);
  return executarRegra(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, RAIZ);
}

export async function acaoCriarLinhaDoPlano(anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado } = await paraOPlano();
  if (negado) return recusadoLocal(anterior, negado);
  return executarCriarLinha(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, RAIZ);
}

export async function acaoRenomearLinhaDoPlano(anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado } = await paraOPlano();
  if (negado) return recusadoLocal(anterior, negado);
  return executarRenomearLinha(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, RAIZ);
}

export async function acaoOcultarLinhaDoPlano(anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado } = await paraOPlano();
  if (negado) return recusadoLocal(anterior, negado);
  return executarOcultarLinha(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, RAIZ);
}

// ------------------------------------------------------------------ metas e fechamento do período (2.2b)

export async function acaoSalvarMetas(anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado } = await paraOPlano();
  if (negado) return recusadoLocal(anterior, negado);
  return executarSalvarMetas(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, anterior, form, RAIZ);
}

/** Fechar o período que começa em `inicio` (preso à URL). Reabrir NÃO existe aqui: é só do nível 1. */
export async function acaoFecharPeriodo(inicio: string, anterior: EstadoLocal, form: FormData): Promise<EstadoLocal> {
  const { ctx, negado } = await paraOPlano();
  if (negado) return recusadoLocal(anterior, negado);
  return executarFechar(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(inicio), anterior, form, RAIZ);
}
