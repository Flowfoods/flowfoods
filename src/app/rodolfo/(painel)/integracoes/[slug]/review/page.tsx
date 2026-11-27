import { notFound } from 'next/navigation';
import { PainelReviewFila } from '@/components/erp/telas/integracoes/painel-review-fila';
import { exigirParceiro, exigirPermissao, leituraDoParceiro } from '@/lib/erp/contexto';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { consultarReviewFila, listarReviewFila } from '@/lib/integracoes/ifood/review-fila';
import { listarReviewFilaSchema } from '@/lib/integracoes/ifood/review-fila-campos';

export const dynamic = 'force-dynamic';

const LIMITE_DE_SUGESTOES = 20;

type BuscaReview = Record<'loja' | 'estado' | 'depois' | 'avaliacao', string | string[] | undefined>;

export default async function ReviewNoNivel1(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Partial<BuscaReview>>;
}) {
  const { slug } = await props.params;
  const ctx = await exigirParceiro(slug);
  exigirPermissao(ctx, 'integracao.ver');
  if (!ctx.parceiro.homologacaoDeIntegracao) notFound();

  const busca = await props.searchParams;
  const entrada = await leituraDoParceiro(ctx.parceiro.id).transacao(async tx => {
    if (!await moduloLiberado(tx, 'integracao')) notFound();
    const lojas = await tx.loja.findMany({
      where: { ativa: true }, select: { id: true, nome: true }, orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    const loja = busca.loja === undefined ? lojas[0] : lojas.find(opcao => opcao.id === busca.loja);
    if (!loja) {
      if (busca.loja !== undefined) notFound();
      return { lojas, consulta: null };
    }

    const filtro = listarReviewFilaSchema.safeParse({
      lojaId: loja.id, estado: busca.estado === '' ? undefined : busca.estado,
      depoisId: busca.depois, limite: LIMITE_DE_SUGESTOES,
    });
    if (!filtro.success) notFound();
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

  const central = `/rodolfo/integracoes/${encodeURIComponent(ctx.parceiro.slug)}`;
  return <PainelReviewFila central={central} parceiroNome={ctx.parceiro.nome} {...entrada} />;
}
