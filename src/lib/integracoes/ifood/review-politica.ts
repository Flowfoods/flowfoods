/** Repositório INTERNO. Recebe somente cliente e sessão derivados pelo servidor (ver facade).
 * Não é action/HTTP, não concede permissão nem habilita Review no provedor.
 */
import { Prisma } from '@prisma/client';
import type { SessaoErp } from '@/lib/erp/contexto-base';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { alvoReviewPolitica, congelarReviewPolitica, novaReviewPoliticaSchema } from './review-politica-campos';

export class ConflitoReviewPolitica extends Error {
  constructor() { super('A política mudou. Releia a versão antes de gravar.'); this.name = 'ConflitoReviewPolitica'; }
}

export async function versionarReviewPolitica(cliente: ClienteDoParceiro, sessao: SessaoErp, entrada: unknown) {
  const e = novaReviewPoliticaSchema.parse(entrada);
  if (!sessao.userId?.trim() || !sessao.autorNome?.trim()) throw new Error('Autor de servidor obrigatório.');
  try {
    return await cliente.transacao(async (tx) => {
      if (e.lojaId !== null && !await tx.loja.findFirst({ where: { id: e.lojaId }, select: { id: true } })) {
        throw new Error('Loja não pertence ao parceiro.');
      }
      const alvo = alvoReviewPolitica(e.lojaId);
      const anterior = await tx.reviewPolitica.findFirst({ where: { alvo } });
      if ((anterior?.versaoAtual ?? 0) !== e.versaoEsperada) throw new ConflitoReviewPolitica();
      const numero = e.versaoEsperada + 1;
      let politicaId: string;
      if (anterior) {
        const cas = await tx.reviewPolitica.updateMany({ where: { id: anterior.id, versaoAtual: e.versaoEsperada }, data: { versaoAtual: numero } });
        if (cas.count !== 1) throw new ConflitoReviewPolitica();
        politicaId = anterior.id;
      } else {
        politicaId = (await tx.reviewPolitica.create({ data: { parceiroId: tx.parceiroId, alvo, lojaId: e.lojaId, versaoAtual: numero } })).id;
      }
      const versao = await tx.reviewPoliticaVersao.create({ data: {
        parceiroId: tx.parceiroId, politicaId, numero, ...e.conteudo,
        autorUserId: sessao.userId, autorNome: sessao.autorNome, motivo: e.motivo,
      } });
      await tx.historicoAlteracao.create({ data: {
        parceiroId: tx.parceiroId, entidade: 'ReviewPolitica', entidadeId: politicaId,
        acao: 'VERSIONOU', antes: { numero: e.versaoEsperada },
        depois: { numero, versaoId: versao.id, lojaId: e.lojaId, capacidade: 'INATIVA', autorUserId: sessao.userId, conteudo: e.conteudo },
        motivo: e.motivo, autorNome: sessao.autorNome,
      } });
      return { politicaId, versaoId: versao.id, numero, capacidade: 'INATIVA' as const };
    });
  } catch (erro) {
    // Duas criações da mesma origem também têm um único vencedor (índice único).
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') throw new ConflitoReviewPolitica();
    throw erro;
  }
}

/** Um único snapshot SQL repetível: exceção completa prevalece; ausência retorna null. */
export async function resolverReviewPolitica(cliente: ClienteDoParceiro, lojaId: string) {
  return cliente.transacao(tx => resolverReviewPoliticaNaTransacao(tx, lojaId), { repetivel: true });
}

/** Uso interno em transação repetível já aberta; não aceitar snapshot do cliente. */
export async function resolverReviewPoliticaNaTransacao(tx: ClienteDoParceiro, lojaId: string) {
  if (!lojaId.trim()) throw new Error('Loja obrigatória.');
  if (!await tx.loja.findFirst({ where: { id: lojaId }, select: { id: true } })) throw new Error('Loja não pertence ao parceiro.');
  const candidatas = await tx.reviewPolitica.findMany({ where: { alvo: { in: ['PARCEIRO', alvoReviewPolitica(lojaId)] } } });
  const politica = candidatas.find((p) => p.lojaId === lojaId) ?? candidatas.find((p) => p.lojaId === null);
  if (!politica) return null;
  const versao = await tx.reviewPoliticaVersao.findFirst({ where: { politicaId: politica.id, numero: politica.versaoAtual } });
  if (!versao) throw new Error('Política sem versão íntegra.');
  return congelarReviewPolitica({ capacidade: 'INATIVA', parceiroId: tx.parceiroId, lojaConsultadaId: lojaId,
    origem: politica.lojaId === null ? 'PARCEIRO' : 'LOJA', lojaDaPoliticaId: politica.lojaId,
    politicaId: politica.id, versaoId: versao.id, numero: versao.numero,
    conteudo: { tom: versao.tom, assinatura: versao.assinatura, exemplos: versao.exemplos, restricoes: versao.restricoes, limiteEditorial: versao.limiteEditorial },
  });
}
