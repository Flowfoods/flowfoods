/** Fachada interna Nível 1; sem action, rota, UI, worker ou transporte. */
import { exigirParceiro } from '@/lib/erp/contexto';
import { aprovarReviewFila, consultarReviewFila, gravarReviewFila, listarReviewFila } from './review-fila';

async function contextoDeEscrita(slug: string) {
  const ctx = await exigirParceiro(slug);
  if (!ctx.podeEscrever) throw new Error(ctx.bloqueio ?? 'Escrita indisponível.');
  return ctx;
}
export async function gravarReviewFilaDoNivel1(slug: string, entrada: unknown) {
  const ctx = await contextoDeEscrita(slug);
  return gravarReviewFila(ctx.cliente, ctx.sessao, entrada);
}
export async function aprovarReviewFilaDoNivel1(slug: string, entrada: unknown) {
  const ctx = await contextoDeEscrita(slug);
  return aprovarReviewFila(ctx.cliente, ctx.sessao, entrada);
}
export async function consultarReviewFilaDoNivel1(slug: string, entrada: unknown) {
  const ctx = await exigirParceiro(slug);
  return consultarReviewFila(ctx.cliente, entrada);
}
export async function listarReviewFilaDoNivel1(slug: string, entrada: unknown) {
  const ctx = await exigirParceiro(slug);
  return listarReviewFila(ctx.cliente, entrada);
}
