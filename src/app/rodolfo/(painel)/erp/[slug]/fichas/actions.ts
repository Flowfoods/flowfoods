'use server';

/**
 * Ações de ficha técnica do nível 1 dentro de um parceiro. Toda ação abre com
 * `exigirParceiro(slug)` (sessão do /rodolfo + parceiro resolvido no servidor
 * + cliente do portão), confere a permissão (`recusaDaAcao`, a mesma regra;
 * o nível 1 sempre pode) e o bloqueio. O id da ficha é lido pelo portão DESTE
 * parceiro. Cada gravação deixa rastro no auditLog do /rodolfo.
 */

import { prisma } from '@/lib/db';
import { exigirParceiro, recusaDaAcao } from '@/lib/erp/contexto';
import { cadastrarFicha, editarFicha, mudarSituacaoFicha, cadastrarFichaUnificada, editarFichaUnificada, type ResultadoFicha } from '@/lib/erp/fichas';
import { MARCADOR_MATERIAIS_DA_FICHA, type EstadoFichaUnificada } from '@/lib/erp/ficha-unificada-campos';
import { salvarEmbalagens, salvarMargensAlvo, salvarMetasDeCmv, salvarFaixasDeCmv, salvarPrecos, salvarTaxaDoIfood } from '@/lib/erp/canais';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';
import type { EstadoConfiguracao } from '@/lib/erp/canal-config-campos';
import { concluir, querAtivo, recusado } from '@/components/erp/telas/cadastro/executar';
import { concluirEtapaDaFicha } from '@/components/erp/telas/fichas/continuar';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import type { EstadoDasFotos, EstadoImportacao } from '@/components/erp/telas/fichas/estado';
import { revalidatePath } from 'next/cache';
import { mudarFotosDaFicha } from '@/lib/erp/ficha-fotos';
import { lerImpressaoFinanceira, lerImpressaoOperacional, type ImpressaoFinanceira, type ImpressaoOperacional } from '@/lib/erp/ficha-impressao';
import { buscarClassificacao } from '@/lib/erp/ficha-secoes';
import type { EstadoGestaoClassificacao, PedidoBuscaClassificacao, ResultadoBuscaClassificacao } from '@/lib/erp/ficha-secoes-campos';
import {
  executarImportacao,
  concluirFichaUnificada,
  recusarFichaUnificada,
  lerEnvioDaFichaUnificada,
  concluirConfiguracao,
  recusarConfiguracao,
  executarGestaoClassificacao,
  executarPrevia,
  lerEnvioDaFicha,
  lerEnvioDasEmbalagens,
  lerEnvioDasMargens,
  lerEnvioDasMetas,
  lerEnvioDasFaixas,
  lerEnvioDosPrecos,
  lerPedidoDeFoto,
} from '@/components/erp/telas/fichas/executar';

async function paraEditar(slug: string) {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'fichas.editar') ?? ctx.bloqueio;
  return { ctx, negado, base: `/rodolfo/erp/${ctx.parceiro.slug}/fichas` };
}

export async function acaoCadastrarFichaUnificada(slug: string, anterior: EstadoFichaUnificada, form: FormData): Promise<EstadoFichaUnificada> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusarFichaUnificada(anterior, negado);
  const verPrecos = !recusaDaAcao(ctx, 'precos.ver'), verFichas = !recusaDaAcao(ctx, 'fichas.ver');
  if (form.has(MARCADOR_MATERIAIS_DA_FICHA) && !verPrecos) return recusarFichaUnificada(anterior, 'Você não tem permissão para alterar embalagens por canal.');
  const envio = await lerEnvioDaFichaUnificada(form);
  if (!envio.ok) return { ok: false, vez: (anterior?.vez ?? 0) + 1, erros: envio.erros };
  const r = await cadastrarFichaUnificada(ctx.cliente, envio.entrada, envio.foto, ctx.sessao.autorNome, ctx.sessao.userId);
  if (r.ok && !r.repetido) await auditar(ctx, 'erp_ficha_criada', { id: r.id });
  return concluirFichaUnificada(r, anterior, base, form, { verFichas, verPrecos }, true);
}

export async function acaoEditarFichaUnificada(slug: string, id: string, anterior: EstadoFichaUnificada, form: FormData): Promise<EstadoFichaUnificada> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusarFichaUnificada(anterior, negado);
  const verPrecos = !recusaDaAcao(ctx, 'precos.ver'), verFichas = !recusaDaAcao(ctx, 'fichas.ver');
  if (form.has(MARCADOR_MATERIAIS_DA_FICHA) && !verPrecos) return recusarFichaUnificada(anterior, 'Você não tem permissão para alterar embalagens por canal.');
  const envio = await lerEnvioDaFichaUnificada(form);
  if (!envio.ok) return { ok: false, vez: (anterior?.vez ?? 0) + 1, erros: envio.erros };
  const r = await editarFichaUnificada(ctx.cliente, String(id), envio.entrada, envio.foto, ctx.sessao.autorNome);
  if (r.ok && !r.repetido && r.mudou.length) await auditar(ctx, 'erp_ficha_alterada', { id: r.id });
  return concluirFichaUnificada(r, anterior, base, form, { verFichas, verPrecos }, false);
}

export async function acaoImpressaoOperacional(slug: string, id: string, versao: string): Promise<ImpressaoOperacional> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'fichas.ver');
  if (negado) return { ok: false, erro: negado };
  return lerImpressaoOperacional(ctx.cliente, id, versao);
}

type Ctx = Awaited<ReturnType<typeof exigirParceiro>>;

async function auditar(ctx: Ctx, evento: string, dados: Record<string, string | number>) {
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento, dados: { parceiroId: ctx.parceiro.id, ...dados } } });
}

async function auditarFicha(ctx: Ctx, evento: string, r: ResultadoFicha) {
  if (r.ok) await auditar(ctx, evento, { id: r.id });
}

export async function acaoBuscarClassificacao(slug: string, pedido: PedidoBuscaClassificacao): Promise<ResultadoBuscaClassificacao> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, pedido?.contexto === 'filtro' ? 'fichas.ver' : 'fichas.editar');
  if (negado) return { ok: false, erro: negado };
  return buscarClassificacao(ctx.cliente, pedido);
}

export async function acaoGerirClassificacao(slug: string, anterior: EstadoGestaoClassificacao, form: FormData): Promise<EstadoGestaoClassificacao> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return { vez: (anterior?.vez ?? 0) + 1, ok: false, erros: { geral: negado } };
  const r = await executarGestaoClassificacao(ctx.cliente, anterior, form, ctx.sessao.autorNome, base);
  if (r?.ok) {
    const id = r.alterado?.registro.id ?? r.excluido?.id;
    if (id) await auditar(ctx, 'erp_ficha_classificacao_alterada', { id, nivel: String(form.get('nivel')), intencao: String(form.get('intencao')) });
  }
  return r;
}

export async function acaoCadastrarFicha(slug: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const envio = await lerEnvioDaFicha(form);
  if ('erroDaFoto' in envio) return concluir({ ok: false, erros: { foto: envio.erroDaFoto } }, anterior, base, { mudou: 'criada' });
  const r = await cadastrarFicha(ctx.cliente, envio.entrada, envio.foto, ctx.sessao.autorNome);
  await auditarFicha(ctx, 'erp_ficha_criada', r);
  const proxima = form.get('continuar') === 'embalagens' && envio.entrada.tipo === 'PRATO' && !recusaDaAcao(ctx, 'precos.ver');
  return concluirEtapaDaFicha(r, anterior, base, { mudou: 'criada' }, proxima ? 'embalagens' : null, { de: deSeguroDaFicha(form.get('de'), !recusaDaAcao(ctx, 'precos.ver')) });
}

export async function acaoEditarFicha(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const envio = await lerEnvioDaFicha(form);
  if ('erroDaFoto' in envio) return concluir({ ok: false, erros: { foto: envio.erroDaFoto } }, anterior, base, { mudou: 'editada' });
  const r = await editarFicha(ctx.cliente, String(id), envio.entrada, envio.foto, ctx.sessao.autorNome);
  await auditarFicha(ctx, 'erp_ficha_alterada', r);
  const proxima = form.get('continuar') === 'embalagens' && envio.entrada.tipo === 'PRATO' && !recusaDaAcao(ctx, 'precos.ver');
  return concluirEtapaDaFicha(r, anterior, base, { mudou: 'editada', igual: 'igual' }, proxima ? 'embalagens' : null, { de: deSeguroDaFicha(form.get('de'), !recusaDaAcao(ctx, 'precos.ver')) });
}

export async function acaoSituacaoFicha(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const ativa = querAtivo(form);
  const r = await mudarSituacaoFicha(ctx.cliente, String(id), ativa, form.get('motivo'), ctx.sessao.autorNome);
  await auditarFicha(ctx, ativa ? 'erp_ficha_reativada' : 'erp_ficha_desativada', r);
  return concluir(r, anterior, base, { mudou: ativa ? 'reativada' : 'desativada' }, undefined, undefined, 'insumo', { de: deSeguroDaFicha(form.get('de')), aLista: form.get('origem') === 'lista' });
}

export async function acaoPreviaDaPlanilha(slug: string, anterior: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const { ctx, negado } = await paraEditar(slug);
  if (negado) return { vez: (anterior?.vez ?? 0) + 1, erro: negado };
  return executarPrevia(ctx.cliente, anterior, form);
}

export async function acaoImportarPlanilha(slug: string, anterior: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return { vez: (anterior?.vez ?? 0) + 1, erro: negado };
  const r = await executarImportacao(ctx.cliente, anterior, form, ctx.sessao.autorNome, base);
  if (r?.resultado) await auditar(ctx, 'erp_fichas_importadas', r.resultado);
  return r;
}

/** 1.9: embalagens por canal da ficha (o nível 1 pode tudo; a mesma checagem). */
export async function acaoSalvarEmbalagens(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'fichas.editar') ?? recusaDaAcao(ctx, 'precos.ver') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  if (negado) return recusado(anterior, negado);
  const r = await salvarEmbalagens(ctx.cliente, String(id), lerEnvioDasEmbalagens(form), ctx.sessao.autorNome);
  if (r.ok) await auditar(ctx, 'erp_ficha_embalagens', { id: r.id });
  const proxima = form.get('continuar') === 'precos' && !recusaDaAcao(ctx, 'fichas.ver');
  return concluirEtapaDaFicha(r, anterior, base, { mudou: 'embalagens', igual: 'igual' }, proxima ? 'precos' : null, { de: deSeguroDaFicha(form.get('de')), voltarAEdicao: !!recusaDaAcao(ctx, 'fichas.ver') });
}

/** 1.9: a taxa do iFood do parceiro. */
export async function acaoSalvarTaxaDoIfood(slug: string, anterior: EstadoConfiguracao, form: FormData): Promise<EstadoConfiguracao> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'precos.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  if (negado) return recusarConfiguracao(anterior, negado);
  const r = await salvarTaxaDoIfood(ctx.cliente, { comissao: form.get('comissao'), pagamento: form.get('pagamento'), versao: form.get('versao') }, ctx.sessao.autorNome);
  if (r.ok) await auditar(ctx, 'erp_taxa_ifood', { id: r.id });
  return concluirConfiguracao(r, anterior, base, { mudou: 'taxa', igual: 'taxa-igual' });
}

/** 1.10: preço de venda por canal da ficha (o nível 1 pode tudo; a mesma checagem). */
export async function acaoSalvarPrecos(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'fichas.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  if (negado) return recusado(anterior, negado);
  const r = await salvarPrecos(ctx.cliente, String(id), lerEnvioDosPrecos(form), ctx.sessao.autorNome);
  if (r.ok && r.mudou.length) await auditar(ctx, 'erp_ficha_precos', { id: r.id });
  return concluir(r, anterior, base, { mudou: r.ok && r.custoMudou ? 'precos-custo' : 'precos', igual: 'precos-igual' }, undefined, undefined, 'insumo', { de: deSeguroDaFicha(form.get('de')), aLista: false });
}

/** N.2: meta de CMV de cada canal do parceiro. */
export async function acaoSalvarMetasDeCmv(slug: string, anterior: EstadoConfiguracao, form: FormData): Promise<EstadoConfiguracao> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'precos.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  if (negado) return recusarConfiguracao(anterior, negado);
  const r = await salvarMetasDeCmv(ctx.cliente, lerEnvioDasMetas(form), ctx.sessao.autorNome);
  if (r.ok && r.mudou.length) await auditar(ctx, 'erp_metas_cmv', { canais: r.mudou.join(',') });
  return concluirConfiguracao(r, anterior, base, { mudou: 'metas', igual: 'metas-igual' });
}

/** 1.10: margem-alvo de cada canal do parceiro. */
export async function acaoSalvarFaixasDeCmv(slug: string, anterior: EstadoConfiguracao, form: FormData): Promise<EstadoConfiguracao> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'precos.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  if (negado) return recusarConfiguracao(anterior, negado);
  const r = await salvarFaixasDeCmv(ctx.cliente, lerEnvioDasFaixas(form), ctx.sessao.autorNome);
  if (r.ok && r.mudou.length) await auditar(ctx, 'erp_faixas_cmv', { canais: r.mudou.join(',') });
  return concluirConfiguracao(r, anterior, base, { mudou: 'faixas', igual: 'faixas-igual' });
}

export async function acaoSalvarMargensAlvo(slug: string, anterior: EstadoConfiguracao, form: FormData): Promise<EstadoConfiguracao> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'precos.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  if (negado) return recusarConfiguracao(anterior, negado);
  const r = await salvarMargensAlvo(ctx.cliente, lerEnvioDasMargens(form), ctx.sessao.autorNome);
  if (r.ok && r.mudou.length) await auditar(ctx, 'erp_margens_alvo', { canais: r.mudou.join(',') });
  return concluirConfiguracao(r, anterior, base, { mudou: 'margens', igual: 'margens-igual' });
}

/** F4: fotos da ficha (principal e de apoio), pelo nível 1. */
export async function acaoFotosDaFicha(slug: string, id: string, anterior: EstadoDasFotos, form: FormData): Promise<EstadoDasFotos> {
  const vez = (anterior?.vez ?? 0) + 1;
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return { vez, ok: false, frase: negado };
  const lido = lerPedidoDeFoto(form);
  if (!lido) return { vez, ok: false, frase: 'Pedido inválido.' };
  const r = await mudarFotosDaFicha(ctx.cliente, String(id), lido.versao, lido.pedido, ctx.sessao.autorNome);
  if (r.ok) {
    await auditar(ctx, 'erp_ficha_fotos', { id: String(id), feito: r.feito });
    revalidatePath(`${base}/${id}`, 'layout');
  }
  return { vez, ok: r.ok, frase: r.ok ? `Pronto: ${r.feito}.` : r.erro };
}

/** Impressão com preços e custos pelo nível 1, só depois da escolha explícita na tela de impressão (decisão de 31/10/2026). */
export async function acaoImpressaoFinanceira(slug: string, id: string, versao: string): Promise<ImpressaoFinanceira> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'fichas.ver') ?? recusaDaAcao(ctx, 'precos.ver');
  if (negado) return { ok: false, erro: negado };
  return lerImpressaoFinanceira(ctx.cliente, id, versao);
}
