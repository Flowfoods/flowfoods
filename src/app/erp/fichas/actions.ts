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
import { salvarEmbalagens, salvarMargensAlvo, salvarMetasDeCmv, salvarPrecos, salvarTaxaDoIfood } from '@/lib/erp/canais';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';
import { concluir, querAtivo, recusado } from '@/components/erp/telas/cadastro/executar';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import type { EstadoDasFotos, EstadoImportacao } from '@/components/erp/telas/fichas/estado';
import { revalidatePath } from 'next/cache';
import { mudarFotosDaFicha } from '@/lib/erp/ficha-fotos';
import {
  executarImportacao,
  executarPrevia,
  lerEnvioDaFicha,
  lerEnvioDasEmbalagens,
  lerEnvioDasMargens,
  lerEnvioDasMetas,
  lerEnvioDosPrecos,
  lerPedidoDeFoto,
} from '@/components/erp/telas/fichas/executar';

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
  // F4: veio da lixeira da lista → volta para a lista como estava (filtros e página), com a frase do feito.
  return concluir(r, anterior, BASE, { mudou: ativa ? 'reativada' : 'desativada' }, undefined, undefined, 'insumo', { de: deSeguroDaFicha(form.get('de')), aLista: form.get('origem') === 'lista' });
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

/**
 * 1.9: embalagens por canal da ficha. O que vai no saco é da operação: quem
 * edita fichas (gerente inclusive) e vê a precificação.
 */
export async function acaoSalvarEmbalagens(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'fichas.editar') ?? recusaDaAcao(ctx, 'precos.ver') ?? ctx.bloqueio;
  if (negado) return recusado(anterior, negado);
  const r = await salvarEmbalagens(ctx.cliente, String(id), lerEnvioDasEmbalagens(form), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'embalagens', igual: 'igual' });
}

/** 1.9: a taxa do iFood do parceiro é condição comercial: só quem muda preços (a dona). */
export async function acaoSalvarTaxaDoIfood(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  if (negado) return recusado(anterior, negado);
  const r = await salvarTaxaDoIfood(ctx.cliente, { comissao: form.get('comissao'), pagamento: form.get('pagamento'), versao: form.get('versao') }, ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'taxa', igual: 'taxa-igual' }, 'canais');
}

/**
 * 1.10: preço de venda por canal da ficha. Preço é condição comercial: só quem
 * muda preços (a dona). O form manda o texto; o servidor recalcula tudo.
 */
export async function acaoSalvarPrecos(id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'fichas.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  if (negado) return recusado(anterior, negado);
  const r = await salvarPrecos(ctx.cliente, String(id), lerEnvioDosPrecos(form), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: r.ok && r.custoMudou ? 'precos-custo' : 'precos', igual: 'precos-igual' });
}

/** N.2: meta de CMV de cada canal do parceiro (só quem muda preços). */
export async function acaoSalvarMetasDeCmv(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'precos.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  if (negado) return recusado(anterior, negado);
  const r = await salvarMetasDeCmv(ctx.cliente, lerEnvioDasMetas(form), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'metas', igual: 'metas-igual' }, 'canais');
}

/** 1.10: margem-alvo de cada canal do parceiro (só a dona). */
export async function acaoSalvarMargensAlvo(anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'precos.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  if (negado) return recusado(anterior, negado);
  const r = await salvarMargensAlvo(ctx.cliente, lerEnvioDasMargens(form), ctx.sessao.autorNome);
  return concluir(r, anterior, BASE, { mudou: 'margens', igual: 'margens-igual' }, 'canais');
}

/** F4: fotos da ficha (principal e de apoio). A regra confere versão e lista da ficha de novo dentro da transação. */
export async function acaoFotosDaFicha(id: string, anterior: EstadoDasFotos, form: FormData): Promise<EstadoDasFotos> {
  const vez = (anterior?.vez ?? 0) + 1;
  const { ctx, negado } = await paraEditar();
  if (negado) return { vez, ok: false, frase: negado };
  const lido = lerPedidoDeFoto(form);
  if (!lido) return { vez, ok: false, frase: 'Pedido inválido.' };
  const r = await mudarFotosDaFicha(ctx.cliente, String(id), lido.versao, lido.pedido, ctx.sessao.autorNome);
  if (r.ok) revalidatePath(`${BASE}/${id}`, 'layout');
  return { vez, ok: r.ok, frase: r.ok ? `Pronto: ${r.feito}.` : r.erro };
}
