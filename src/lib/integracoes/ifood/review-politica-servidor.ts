/** Facade interna Nível 1, sem 'use server', rota ou consumidor de UI/worker.
 * Slug escolhe o parceiro; a sessão /rodolfo autoriza e fornece a autoria.
 * Não reutilizar integracao.ver como autorização de escrita.
 */
import { exigirParceiro } from '@/lib/erp/contexto';
import { resolverReviewPolitica, versionarReviewPolitica } from './review-politica';

export async function gravarPoliticaReviewDoNivel1(slug: string, entrada: unknown) {
  const ctx = await exigirParceiro(slug);
  if (!ctx.podeEscrever) throw new Error(ctx.bloqueio ?? 'Escrita indisponível.');
  // doParceiro revalida status na própria transação e segura FOR SHARE até o commit.
  return versionarReviewPolitica(ctx.cliente, ctx.sessao, entrada);
}

export async function consultarPoliticaReviewDoNivel1(slug: string, lojaId: string) {
  const ctx = await exigirParceiro(slug);
  return resolverReviewPolitica(ctx.cliente, lojaId);
}
