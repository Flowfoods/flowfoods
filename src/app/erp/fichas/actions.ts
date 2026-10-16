'use server';

/**
 * Ações de ficha técnica da pessoa do parceiro em /erp/fichas. Toda ação abre
 * com `exigirParceiroDaSessao()` (o parceiro vem da sessão, nunca do
 * formulário), confere "criar e editar fichas técnicas" com a regra única
 * (`recusaDaAcao`) e o bloqueio do parceiro. Esconder o botão é conforto;
 * quem decide é aqui. E o cliente de parceiro não ativo é somente leitura.
 */

import { exigirParceiroDaSessao, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarFicha, editarFicha, mudarSituacaoFicha } from '@/lib/erp/fichas';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';
import { concluir, querAtivo, recusado } from '@/components/erp/telas/cadastro/executar';
import type { EstadoImportacao } from '@/components/erp/telas/fichas/estado';
import { executarImportacao, executarPrevia, lerEnvioDaFicha } from '@/components/erp/telas/fichas/executar';

const BASE = '/erp/fichas';

/** Contexto de quem pode editar agora, ou a frase da recusa. */
async function paraEditar() {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'fichas.editar') ?? ctx.bloqueio;
  return { ctx, negado };
}

export async function acaoCadastrarFicha(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const envio = await lerEnvioDaFicha(form);
  if ('erroDaFoto' in envio) return concluir({ ok: false, erros: { foto: envio.erroDaFoto } }, anterior, BASE, { mudou: 'criada' });
  const r = await cadastrarFicha(ctx.cliente, envio.entrada, envio.foto, ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'criada' });
}

export async function acaoEditarFicha(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const envio = await lerEnvioDaFicha(form);
  if ('erroDaFoto' in envio) return concluir({ ok: false, erros: { foto: envio.erroDaFoto } }, anterior, BASE, { mudou: 'editada' });
  const r = await editarFicha(ctx.cliente, String(id), envio.entrada, envio.foto, ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'editada', igual: 'igual' });
}

export async function acaoSituacaoFicha(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado } = await paraEditar();
  if (negado) return recusado(anterior, negado);
  const ativa = querAtivo(form);
  const r = await mudarSituacaoFicha(ctx.cliente, String(id), ativa, form.get('motivo'), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: ativa ? 'reativada' : 'desativada' });
}

/** Prévia da planilha: lê e mostra; nada é gravado. Também exige poder editar fichas. */
export async function acaoPreviaDaPlanilha(anterior: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const { ctx, negado } = await paraEditar();
  if (negado) return { vez: (anterior?.vez ?? 0) + 1, erro: negado };
  return executarPrevia(ctx.cliente, anterior, form);
}

export async function acaoImportarPlanilha(anterior: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const { ctx, negado } = await paraEditar();
  if (negado) return { vez: (anterior?.vez ?? 0) + 1, erro: negado };
  return executarImportacao(ctx.cliente, anterior, form, ctx.sessao.autorNome, BASE);
}
