/** Persistência editorial INTERNA. Cliente/sessão são derivados do servidor pela fachada.
 * LOCAL_SIMULATION / INATIVA: não constitui adaptador do provedor ou autorização de envio.
 */
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { SessaoErp } from '@/lib/erp/contexto-base';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { aprovarReviewFilaSchema, conferirLimiteEditorialReview, congelarReviewFila, gravarReviewFilaSchema, identidadeReviewFilaSchema, listarReviewFilaSchema } from './review-fila-campos';
import { resolverReviewPoliticaNaTransacao } from './review-politica';

export class ConflitoReviewFila extends Error {
  constructor() { super('A revisão mudou. Releia a fila antes de gravar.'); this.name = 'ConflitoReviewFila'; }
}
function autor(cliente: ClienteDoParceiro, sessao: SessaoErp) {
  if (cliente.somenteLeitura) throw new Error('Cliente somente leitura.');
  if (!sessao.userId?.trim() || !sessao.autorNome?.trim()) throw new Error('Autor de servidor obrigatório.');
  return { userId: sessao.userId, nome: sessao.autorNome };
}
async function loja(tx: ClienteDoParceiro, lojaId: string) {
  if (!await tx.loja.findFirst({ where: { id: lojaId }, select: { id: true } })) throw new Error('Loja não pertence ao parceiro.');
}
async function transacaoDeEscrita<T>(cliente: ClienteDoParceiro, fn: (tx: ClienteDoParceiro) => Promise<T>) {
  try { return await cliente.transacao(fn, { repetivel: true }); }
  catch (erro) {
    // Unicidade, disputa de CAS e conflito serializável exigem nova intenção, sem retry oculto.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(erro.code)) throw new ConflitoReviewFila();
    throw erro;
  }
}
async function ler(tx: ClienteDoParceiro, identidade: { lojaId: string; avaliacaoLocalId: string }) {
  const cabecalho = await tx.reviewSugestao.findFirst({ where: identidade });
  if (!cabecalho) return null;
  const where = { sugestaoId: cabecalho.id };
  const revisoes = await tx.reviewSugestaoRevisao.findMany({ where, orderBy: { numero: 'asc' } });
  const aprovacoes = await tx.reviewSugestaoAprovacao.findMany({ where, orderBy: { revisao: 'asc' } });
  return congelarReviewFila({ ...cabecalho, revisoes, aprovacoes,
    aprovacaoAtual: cabecalho.estado === 'APROVADA' ? aprovacoes.find(a => a.revisao === cabecalho.revisaoAtual) ?? null : null });
}
export async function consultarReviewFila(cliente: ClienteDoParceiro, entrada: unknown) {
  const e = identidadeReviewFilaSchema.parse(entrada);
  return cliente.transacao(async tx => { await loja(tx, e.lojaId); return ler(tx, e); }, { repetivel: true });
}
export async function listarReviewFila(cliente: ClienteDoParceiro, entrada: unknown) {
  const e = listarReviewFilaSchema.parse(entrada);
  return cliente.transacao(async tx => {
    await loja(tx, e.lojaId);
    const linhas = await tx.reviewSugestao.findMany({
      where: { lojaId: e.lojaId, ...(e.estado ? { estado: e.estado } : {}), ...(e.depoisId ? { id: { gt: e.depoisId } } : {}) },
      orderBy: { id: 'asc' }, take: e.limite + 1,
    });
    const temMais = linhas.length > e.limite;
    const itens = linhas.slice(0, e.limite);
    return congelarReviewFila({ origem: 'LOCAL_SIMULATION' as const, capacidade: 'INATIVA' as const, itens,
      proximoId: temMais ? itens.at(-1)!.id : null });
  }, { repetivel: true });
}
export async function gravarReviewFila(cliente: ClienteDoParceiro, sessao: SessaoErp, entrada: unknown) {
  const e = gravarReviewFilaSchema.parse(entrada); const editor = autor(cliente, sessao);
  return transacaoDeEscrita(cliente, async tx => {
    const identidade = { lojaId: e.lojaId, avaliacaoLocalId: e.avaliacaoLocalId };
    const politica = await resolverReviewPoliticaNaTransacao(tx, e.lojaId);
    if (!politica) throw new Error('Política editorial obrigatória para preparar uma sugestão.');
    const anterior = await tx.reviewSugestao.findFirst({ where: identidade });
    if ((anterior?.revisaoAtual ?? 0) !== e.revisaoEsperada) throw new ConflitoReviewFila();
    if (anterior) {
      // Inclui revisões antigas nunca aprovadas, restrito à identidade desta sugestão.
      const divergente = await tx.reviewSugestaoRevisao.findFirst({ where: {
        sugestaoId: anterior.id, fatosVersao: e.fatos.versao, fatosComentario: { not: e.fatos.comentario },
      } });
      if (divergente) throw new Error('Versão de fatos já utilizada com conteúdo diferente.');
      const ultima = await tx.reviewSugestaoRevisao.findFirst({ where: { sugestaoId: anterior.id, numero: anterior.revisaoAtual } });
      if (ultima && ultima.fatosVersao === e.fatos.versao && ultima.fatosComentario === e.fatos.comentario &&
          ultima.texto === e.texto && ultima.visibilidade === e.visibilidade && ultima.politicaVersaoId === politica.versaoId &&
          ultima.editorUserId === editor.userId && ultima.editorNome === editor.nome) return ler(tx, identidade);
    }
    const numero = e.revisaoEsperada + 1;
    let sugestaoId: string;
    if (anterior) {
      const cas = await tx.reviewSugestao.updateMany({ where: { id: anterior.id, revisaoAtual: e.revisaoEsperada }, data: { revisaoAtual: numero, estado: 'RASCUNHO' } });
      if (cas.count !== 1) throw new ConflitoReviewFila();
      sugestaoId = anterior.id;
    } else {
      sugestaoId = (await tx.reviewSugestao.create({ data: { parceiroId: tx.parceiroId, ...identidade,
        origem: 'LOCAL_SIMULATION', capacidade: 'INATIVA', revisaoAtual: numero, estado: 'RASCUNHO' } })).id;
    }
    const revisaoId = randomUUID();
    const historico = await tx.historicoAlteracao.create({ data: {
      parceiroId: tx.parceiroId, entidade: 'ReviewSugestao', entidadeId: sugestaoId, acao: anterior ? 'EDITOU' : 'CRIOU',
      antes: { revisao: e.revisaoEsperada, estado: anterior?.estado ?? null },
      depois: { revisaoId, revisao: numero, estado: 'RASCUNHO', origem: 'LOCAL_SIMULATION', capacidade: 'INATIVA', autorUserId: editor.userId },
      motivo: e.motivo, autorNome: editor.nome,
    } });
    await tx.reviewSugestaoRevisao.create({ data: {
      id: revisaoId, parceiroId: tx.parceiroId, sugestaoId, numero, fatosVersao: e.fatos.versao, fatosComentario: e.fatos.comentario,
      texto: e.texto, visibilidade: e.visibilidade, politicaVersaoId: politica.versaoId,
      politicaSnapshot: politica as unknown as Prisma.InputJsonObject,
      editorUserId: editor.userId, editorNome: editor.nome, motivo: e.motivo, historicoId: historico.id,
    } });
    return ler(tx, identidade);
  });
}
export async function aprovarReviewFila(cliente: ClienteDoParceiro, sessao: SessaoErp, entrada: unknown) {
  const e = aprovarReviewFilaSchema.parse(entrada); const aprovador = autor(cliente, sessao);
  return transacaoDeEscrita(cliente, async tx => {
    const identidade = { lojaId: e.lojaId, avaliacaoLocalId: e.avaliacaoLocalId };
    await loja(tx, e.lojaId);
    const cabecalho = await tx.reviewSugestao.findFirst({ where: identidade });
    if (!cabecalho || cabecalho.revisaoAtual !== e.revisaoEsperada) throw new ConflitoReviewFila();
    if (cabecalho.estado === 'APROVADA') {
      const existente = await tx.reviewSugestaoAprovacao.findFirst({ where: { sugestaoId: cabecalho.id, revisao: e.revisaoEsperada } });
      if (existente?.aprovadorUserId === aprovador.userId && existente.aprovadorNome === aprovador.nome && existente.motivo === e.motivo) return ler(tx, identidade);
      throw new ConflitoReviewFila();
    }
    const revisao = await tx.reviewSugestaoRevisao.findFirst({ where: { sugestaoId: cabecalho.id, numero: e.revisaoEsperada } });
    if (!revisao) throw new Error('Revisão editorial incompleta.');
    conferirLimiteEditorialReview(revisao.texto, revisao.politicaSnapshot);
    const cas = await tx.reviewSugestao.updateMany({ where: { id: cabecalho.id, revisaoAtual: e.revisaoEsperada, estado: 'RASCUNHO' }, data: { estado: 'APROVADA' } });
    if (cas.count !== 1) throw new ConflitoReviewFila();
    const aprovacaoId = randomUUID();
    const historico = await tx.historicoAlteracao.create({ data: {
      parceiroId: tx.parceiroId, entidade: 'ReviewSugestao', entidadeId: cabecalho.id, acao: 'APROVOU',
      antes: { revisao: e.revisaoEsperada, estado: 'RASCUNHO' },
      depois: { revisao: e.revisaoEsperada, aprovacaoId, estado: 'APROVADA', origem: 'LOCAL_SIMULATION', capacidade: 'INATIVA', autorUserId: aprovador.userId },
      motivo: e.motivo, autorNome: aprovador.nome,
    } });
    await tx.reviewSugestaoAprovacao.create({ data: {
      id: aprovacaoId, parceiroId: tx.parceiroId, sugestaoId: cabecalho.id, revisao: e.revisaoEsperada,
      aprovadorUserId: aprovador.userId, aprovadorNome: aprovador.nome, motivo: e.motivo, historicoId: historico.id,
    } });
    return ler(tx, identidade);
  });
}
