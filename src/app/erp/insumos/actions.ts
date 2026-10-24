'use server';

/**
 * Ações de insumo da pessoa do parceiro em /erp/insumos. Toda ação abre com
 * `exigirParceiroDaSessao()` (o parceiro vem da sessão, nunca do formulário),
 * confere "cadastrar e editar insumos" com a regra única (`recusaDaAcao`) e o
 * bloqueio do parceiro. Esconder o botão é conforto; quem decide é aqui. E o
 * cliente de parceiro não ativo é somente leitura (portão e banco recusam).
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarInsumo, confirmarConservacao, editarInsumo, excluirInsumo, mudarSituacaoInsumo } from '@/lib/erp/insumos';
import { marcado } from '@/lib/erp/insumo-campos';
import { caminhoDeVolta } from '@/lib/erp/volta';
import { cadastrarVariante, editarVariante, mudarSituacaoVariante } from '@/lib/erp/variantes';
import { criarCategoria, excluirCategoria, moverCategoria, mudarSituacaoCategoria, renomearCategoria } from '@/lib/erp/categorias';
import { aceitarSugestoes, aplicarClassificacao, classificarEmLote, reverterLote } from '@/lib/erp/classificar';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';
import { concluir, entradaDe, querAtivo, recusado } from '@/components/erp/telas/cadastro/executar';
import { concluirNaTela, naListaDe, voltaDaCategoria, voltarDaClassificacao, voltarDoMover } from '@/components/erp/telas/insumos/executar-categorias';
import { deSeguro as deSeguroDaLista } from '@/lib/erp/insumo-campos';
import { retornoDaLista } from '@/components/erp/telas/insumos/retorno-da-lista';

const BASE = '/erp/insumos';
const CATEGORIAS = `${BASE}/categorias`;
const CLASSIFICAR = `${BASE}/classificar`;

/** Contexto de quem pode editar agora, ou a frase da recusa. */
async function paraEditar() {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'insumos.editar') ?? ctx.bloqueio;
  return { ctx, negado };
}

export async function acaoCadastrarInsumo(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const r = await cadastrarInsumo(ctx.cliente, entradaDe(form), ctx.sessao.autorNome, ctx.sessao.userId);
  // I.1b: veio de uma nota ou ficha ("Insumo que falta: cadastrar")? Volta para lá, só por caminho interno da área do ERP.
  // L.1: o cadastro leva a lista como estava (`de`) para o detalhe; nunca volta direto à lista (mostra o insumo salvo).
  return concluir(r, anterior, BASE, { mudou: 'criado', repetido: 'criado-repetido' }, undefined, caminhoDeVolta(form.get('volta'), '/erp/'), 'insumo', { ...retornoDaLista(form), aLista: false });
}

export async function acaoEditarInsumo(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const r = await editarInsumo(ctx.cliente, String(id), entradaDe(form), ctx.sessao.autorNome);
  // L.1: a caneta da lista volta para a LISTA (mesma página, filtros e tamanho); o "Editar" do detalhe volta ao detalhe.
  return concluir(r, anterior, BASE, { mudou: 'editado', igual: 'igual' }, undefined, undefined, 'insumo', retornoDaLista(form));
}

/** I.1b: "Confirmar a conservação" de um insumo antigo (Seco que ninguém confirmou): não muda nada, só registra a confirmação. */
export async function acaoConfirmarConservacao(id: string, anterior: EstadoCadastro): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const r = await confirmarConservacao(ctx.cliente, String(id), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'conservacao-confirmada', igual: 'conservacao-confirmada' });
}

export async function acaoSituacaoInsumo(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const ativo = querAtivo(form);
  const r = await mudarSituacaoInsumo(ctx.cliente, String(id), ativo, form.get('motivo'), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: ativo ? 'reativado' : 'desativado' }, undefined, undefined, 'insumo', retornoDaLista(form));
}

/**
 * L.1: excluir de vez. Só passa com a confirmação marcada e sem NENHUM vínculo (a regra confere de novo dentro da transação, com a
 * linha travada). Com vínculo a resposta é a frase que manda desativar.
 */
export async function acaoExcluirInsumo(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const r = await excluirInsumo(ctx.cliente, String(id), marcado(form.get('confirmo')), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'excluido' }, undefined, undefined, 'insumo', { ...retornoDaLista(form), aLista: true });
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

// ---------------------------------------------------------------- categorias (I.1a)

/** Contexto de quem gere categorias (a rede inteira) agora, ou a frase da recusa. */
async function paraGerirCategorias() {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'insumos.categorias') ?? ctx.bloqueio;
  return { ctx, negado };
}

export async function acaoCriarCategoria(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraGerirCategorias();
  if (negado) return recusado(anterior, negado);
  const r = await criarCategoria(ctx.cliente, entradaDe(form), ctx.sessao.autorNome);
  return concluirNaTela(r, anterior, CATEGORIAS, { mudou: 'criada' }, BASE, naListaDe(form, deSeguroDaLista));
}

export async function acaoRenomearCategoria(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraGerirCategorias();
  if (negado) return recusado(anterior, negado);
  const r = await renomearCategoria(ctx.cliente, String(id), entradaDe(form), ctx.sessao.autorNome);
  return concluirNaTela(r, anterior, CATEGORIAS, { mudou: 'renomeada', igual: 'igual' }, BASE, naListaDe(form, deSeguroDaLista));
}

export async function acaoSituacaoCategoria(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraGerirCategorias();
  if (negado) return recusado(anterior, negado);
  const ativo = querAtivo(form);
  const r = await mudarSituacaoCategoria(ctx.cliente, String(id), ativo, form.get('motivo'), ctx.sessao.autorNome);
  return concluirNaTela(r, anterior, CATEGORIAS, { mudou: ativo ? 'reativada' : 'desativada' }, BASE, naListaDe(form, deSeguroDaLista));
}

export async function acaoExcluirCategoria(id: string, anterior: EstadoCadastro, form?: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraGerirCategorias();
  if (negado) return recusado(anterior, negado);
  const r = await excluirCategoria(ctx.cliente, String(id), ctx.sessao.autorNome);
  if (r.ok) revalidatePath(BASE, 'layout');
  if (r.ok) redirect(`${voltaDaCategoria(CATEGORIAS, BASE, naListaDe(form, deSeguroDaLista))}feito=excluida`);
  return { ok: false, erros: r.erros, vez: (anterior?.vez ?? 0) + 1 };
}

export async function acaoMoverCategoria(id: string, direcao: 'subir' | 'descer', form?: FormData): Promise<void> {
  const { ctx, negado } = await paraGerirCategorias();
  if (negado) redirect(`${CATEGORIAS}?feito=nao-moveu`);
  voltarDoMover(await moverCategoria(ctx.cliente, String(id), direcao === 'subir' ? 'subir' : 'descer', ctx.sessao.autorNome), CATEGORIAS, BASE, naListaDe(form, deSeguroDaLista));
}

// ------------------------------------------------------- classificação (I.1a)

/** Aplicar e desfazer a classificação assistida mexem em todos os insumos da rede: são de quem gere as categorias. */
export async function acaoAplicarClassificacao(form: FormData): Promise<void> {
  const { ctx, negado } = await paraGerirCategorias();
  if (negado) voltarDaClassificacao(CLASSIFICAR, BASE, 'recusado');
  const vista = form.get('previa');
  const r = await aplicarClassificacao(ctx.cliente, ctx.sessao.autorNome, new Date(), typeof vista === 'string' ? vista : '');
  if (r.previaMudou) voltarDaClassificacao(CLASSIFICAR, BASE, 'previa-mudou');
  if (!r.lote) voltarDaClassificacao(CLASSIFICAR, BASE, 'nada');
  voltarDaClassificacao(CLASSIFICAR, BASE, 'aplicado', { n: r.classificados, outros: r.emOutros, lote: r.lote });
}

export async function acaoReverterLote(form: FormData): Promise<void> {
  const { ctx, negado } = await paraGerirCategorias();
  if (negado) voltarDaClassificacao(CLASSIFICAR, BASE, 'recusado');
  const r = await reverterLote(ctx.cliente, form.get('lote'), ctx.sessao.autorNome);
  if (!r.ok) voltarDaClassificacao(CLASSIFICAR, BASE, 'sem-lote');
  voltarDaClassificacao(CLASSIFICAR, BASE, 'revertido', { n: r.voltaram, mantidos: r.mantidos });
}

/** A edição em lote da fila: classificar insumos é `insumos.editar`, como na edição de um só. */
export async function acaoClassificarEmLote(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const ids = form.getAll('ids').filter((x): x is string => typeof x === 'string');
  if (form.get('aceitar') === '1') {
    const a = await aceitarSugestoes(ctx.cliente, ids, ctx.sessao.autorNome);
    if (!a.ok) return recusado(anterior, a.erro);
    voltarDaClassificacao(CLASSIFICAR, BASE, 'aceitas', { n: a.classificados, iguais: a.iguais, sem: a.semSugestao });
  }
  const r = await classificarEmLote(ctx.cliente, ids, form.get('categoriaId'), ctx.sessao.autorNome);
  if (!r.ok) return recusado(anterior, r.erro);
  voltarDaClassificacao(CLASSIFICAR, BASE, 'lote', { n: r.classificados, iguais: r.iguais });
}

/**
 * F4: "Alterar categoria" na própria lista (os marcados desta página). A mesma regra da edição em lote da fila
 * (`insumos.editar`, histórico por insumo); volta para a lista como estava, com o aviso do que mudou.
 */
export async function acaoAlterarCategoriaNaLista(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const ids = form.getAll('ids').filter((x): x is string => typeof x === 'string');
  const categoriaId = form.get('categoriaId');
  const r = await classificarEmLote(ctx.cliente, ids, categoriaId, ctx.sessao.autorNome);
  if (!r.ok) return recusado(anterior, r.erro);
  revalidatePath(BASE, 'layout');
  const de = deSeguroDaLista(form.get('de'));
  redirect(`${BASE}?${de ? `${de}&` : ''}feito=categorias&n=${r.classificados}&cat=${encodeURIComponent(String(categoriaId))}`);
}
