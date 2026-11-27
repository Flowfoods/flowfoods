import { exigirPermissao, leituraDoParceiro, type ContextoDoParceiro } from '@/lib/erp/contexto';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { consultarReviewFila, listarReviewFila } from '../ifood/review-fila';
import { listarReviewFilaSchema } from '../ifood/review-fila-campos';

const LIMITE_DE_SUGESTOES = 20;

export type BuscaReviewFila = Partial<Record<'loja' | 'estado' | 'depois' | 'avaliacao', string | string[]>>;

/** Consulta interna de dados editoriais simulados para a Central. */
export async function consultarReviewDaDemonstracao(ctx: ContextoDoParceiro, busca: BuscaReviewFila) {
  if (!ctx.parceiro.homologacaoDeIntegracao) return null;

  return leituraDoParceiro(ctx.parceiro.id).transacao(async tx => {
    if (!await moduloLiberado(tx, 'integracao')) return null;
    const lojas = await tx.loja.findMany({
      where: { ativa: true }, select: { id: true, nome: true }, orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    const loja = busca.loja === undefined ? lojas[0] : lojas.find(opcao => opcao.id === busca.loja);
    if (!loja) return busca.loja === undefined ? { lojas, consulta: null } : null;

    const filtro = listarReviewFilaSchema.safeParse({
      lojaId: loja.id, estado: busca.estado === '' ? undefined : busca.estado,
      depoisId: busca.depois, limite: LIMITE_DE_SUGESTOES,
    });
    if (!filtro.success) return null;
    exigirPermissao(ctx, 'integracao.ver', { lojaId: loja.id });

    const fila = await listarReviewFila(tx, filtro.data);
    const item = fila.itens.find(sugestao => sugestao.avaliacaoLocalId === busca.avaliacao);
    const sugestao = item && await consultarReviewFila(tx, { lojaId: loja.id, avaliacaoLocalId: item.avaliacaoLocalId });
    const revisao = sugestao && sugestao.revisoes.find(versao => versao.numero === sugestao.revisaoAtual);

    return { lojas, consulta: {
      lojaId: loja.id,
      estado: filtro.data.estado,
      depoisId: filtro.data.depoisId,
      itens: fila.itens.map(({ avaliacaoLocalId, estado, revisaoAtual, criadoEm }) => ({ avaliacaoLocalId, estado, revisaoAtual, criadoEm })),
      proximoId: fila.proximoId,
      selecionouSugestao: busca.avaliacao !== undefined,
      detalhe: item && revisao ? {
        avaliacaoLocalId: item.avaliacaoLocalId, texto: revisao.texto, numero: revisao.numero, criadoEm: revisao.criadoEm,
      } : null,
    } };
  }, { repetivel: true });
}
