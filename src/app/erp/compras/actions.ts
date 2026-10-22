'use server';

/**
 * Ações de compras da pessoa do parceiro em /erp/compras. Toda ação abre com
 * `exigirParceiroDaSessao()` (o parceiro vem da sessão, nunca do formulário),
 * confere a permissão com a regra única (`recusaDaAcao`: "lançar nota de
 * compra" ou "cadastrar fornecedores") e o bloqueio do parceiro. A nota é por
 * LOJA: a regra (`compras.ts`) recebe o alcance e confere a loja da nota (a de
 * antes e a de depois). Esconder o botão é conforto; quem decide é aqui.
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarFornecedor, editarFornecedor, mudarSituacaoFornecedor } from '@/lib/erp/compras';
import type { EstadoNota } from '@/components/erp/telas/compras/estado';
import { concluirCompra, executarCancelamento, executarNota, recusadoNaNota } from '@/components/erp/telas/compras/executar';
import { concluir, entradaDe, querAtivo, recusado } from '@/components/erp/telas/cadastro/executar';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';
import { caminhoDeVolta } from '@/lib/erp/volta';

const NOTAS = '/erp/compras';
const FORNECEDORES = '/erp/compras/fornecedores';

async function paraLancar() {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'compras.lancar') ?? ctx.bloqueio;
  return { ctx, negado };
}

async function paraFornecedor() {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'fornecedores.editar') ?? ctx.bloqueio;
  return { ctx, negado };
}

/** `notaId` vazio = nota nova. "Conferir" devolve a prévia; "Lançar"/"Salvar" grava. */
export async function acaoSalvarNota(notaId: string, anterior: EstadoNota, form: FormData): Promise<EstadoNota> {
  const { ctx, negado } = await paraLancar();
  if (negado) return recusadoNaNota(anterior, negado);
  return executarNota(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(notaId), anterior, form, NOTAS);
}

export async function acaoCancelarNota(notaId: string, anterior: EstadoNota, form: FormData): Promise<EstadoNota> {
  const { ctx, negado } = await paraLancar();
  if (negado) return recusadoNaNota(anterior, negado);
  return executarCancelamento(ctx.cliente, ctx.alcance, ctx.sessao.autorNome, String(notaId), anterior, form, NOTAS);
}

export async function acaoCadastrarFornecedor(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraFornecedor();
  if (negado) return recusado(anterior, negado);
  const r = await cadastrarFornecedor(ctx.cliente, entradaDe(form), ctx.sessao.autorNome, ctx.sessao.userId);
  // Veio de uma nota ("Fornecedor novo: cadastrar")? Volta para lá, só por caminho interno da área do ERP.
  return concluir(r, anterior, FORNECEDORES, { mudou: 'criado', repetido: 'criado-repetido' }, undefined, caminhoDeVolta(form.get('volta'), '/erp/'), 'fornecedor');
}

export async function acaoEditarFornecedor(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraFornecedor();
  if (negado) return recusado(anterior, negado);
  const r = await editarFornecedor(ctx.cliente, String(id), entradaDe(form), ctx.sessao.autorNome);
  return concluir(r, anterior, FORNECEDORES, { mudou: 'editado', igual: 'igual' });
}

export async function acaoSituacaoFornecedor(id: string, anterior: EstadoNota, form: FormData): Promise<EstadoNota> {
  const { ctx, negado } = await paraFornecedor();
  if (negado) return recusadoNaNota(anterior, negado);
  const ativo = querAtivo(form);
  const r = await mudarSituacaoFornecedor(ctx.cliente, String(id), ativo, form.get('motivo'), ctx.sessao.autorNome);
  return concluirCompra(r, anterior, FORNECEDORES, { mudou: ativo ? 'reativado' : 'desativado' });
}
