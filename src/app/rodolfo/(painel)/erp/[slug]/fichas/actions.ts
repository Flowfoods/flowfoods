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
import { cadastrarFicha, editarFicha, mudarSituacaoFicha, type ResultadoFicha } from '@/lib/erp/fichas';
import { salvarEmbalagens, salvarMargensAlvo, salvarPrecos, salvarTaxaDoIfood } from '@/lib/erp/canais';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';
import { concluir, querAtivo, recusado } from '@/components/erp/telas/cadastro/executar';
import type { EstadoImportacao } from '@/components/erp/telas/fichas/estado';
import {
  executarImportacao,
  executarPrevia,
  lerEnvioDaFicha,
  lerEnvioDasEmbalagens,
  lerEnvioDasMargens,
  lerEnvioDosPrecos,
} from '@/components/erp/telas/fichas/executar';

async function paraEditar(slug: string) {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'fichas.editar') ?? ctx.bloqueio;
  return { ctx, negado, base: `/rodolfo/erp/${ctx.parceiro.slug}/fichas` };
}

type Ctx = Awaited<ReturnType<typeof exigirParceiro>>;

async function auditar(ctx: Ctx, evento: string, dados: Record<string, string | number>) {
  await prisma.auditLog.create({ data: { userId: ctx.sessao.userId, evento, dados: { parceiroId: ctx.parceiro.id, ...dados } } });
}

async function auditarFicha(ctx: Ctx, evento: string, r: ResultadoFicha) {
  if (r.ok) await auditar(ctx, evento, { id: r.id });
}

export async function acaoCadastrarFicha(slug: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const envio = await lerEnvioDaFicha(form);
  if ('erroDaFoto' in envio) return concluir({ ok: false, erros: { foto: envio.erroDaFoto } }, anterior, base, { mudou: 'criada' });
  const r = await cadastrarFicha(ctx.cliente, envio.entrada, envio.foto, ctx.sessao.autorNome);
  await auditarFicha(ctx, 'erp_ficha_criada', r);
  return concluir(r, anterior, base, { mudou: 'criada' });
}

export async function acaoEditarFicha(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const envio = await lerEnvioDaFicha(form);
  if ('erroDaFoto' in envio) return concluir({ ok: false, erros: { foto: envio.erroDaFoto } }, anterior, base, { mudou: 'editada' });
  const r = await editarFicha(ctx.cliente, String(id), envio.entrada, envio.foto, ctx.sessao.autorNome);
  await auditarFicha(ctx, 'erp_ficha_alterada', r);
  return concluir(r, anterior, base, { mudou: 'editada', igual: 'igual' });
}

export async function acaoSituacaoFicha(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const { ctx, negado, base } = await paraEditar(slug);
  if (negado) return recusado(anterior, negado);
  const ativa = querAtivo(form);
  const r = await mudarSituacaoFicha(ctx.cliente, String(id), ativa, form.get('motivo'), ctx.sessao.autorNome);
  await auditarFicha(ctx, ativa ? 'erp_ficha_reativada' : 'erp_ficha_desativada', r);
  return concluir(r, anterior, base, { mudou: ativa ? 'reativada' : 'desativada' });
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
  return concluir(r, anterior, base, { mudou: 'embalagens', igual: 'igual' });
}

/** 1.9: a taxa do iFood do parceiro. */
export async function acaoSalvarTaxaDoIfood(slug: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  if (negado) return recusado(anterior, negado);
  const r = await salvarTaxaDoIfood(ctx.cliente, { comissao: form.get('comissao'), pagamento: form.get('pagamento'), versao: form.get('versao') }, ctx.sessao.autorNome);
  if (r.ok) await auditar(ctx, 'erp_taxa_ifood', { id: r.id });
  return concluir(r, anterior, base, { mudou: 'taxa', igual: 'taxa-igual' }, 'canais');
}

/** 1.10: preço de venda por canal da ficha (o nível 1 pode tudo; a mesma checagem). */
export async function acaoSalvarPrecos(slug: string, id: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'fichas.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  if (negado) return recusado(anterior, negado);
  const r = await salvarPrecos(ctx.cliente, String(id), lerEnvioDosPrecos(form), ctx.sessao.autorNome);
  if (r.ok && r.mudou.length) await auditar(ctx, 'erp_ficha_precos', { id: r.id });
  return concluir(r, anterior, base, { mudou: r.ok && r.custoMudou ? 'precos-custo' : 'precos', igual: 'precos-igual' });
}

/** 1.10: margem-alvo de cada canal do parceiro. */
export async function acaoSalvarMargensAlvo(slug: string, anterior: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const ctx = await exigirParceiro(String(slug));
  const negado = recusaDaAcao(ctx, 'precos.ver') ?? recusaDaAcao(ctx, 'precos.editar') ?? ctx.bloqueio;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  if (negado) return recusado(anterior, negado);
  const r = await salvarMargensAlvo(ctx.cliente, lerEnvioDasMargens(form), ctx.sessao.autorNome);
  if (r.ok && r.mudou.length) await auditar(ctx, 'erp_margens_alvo', { canais: r.mudou.join(',') });
  return concluir(r, anterior, base, { mudou: 'margens', igual: 'margens-igual' }, 'canais');
}
