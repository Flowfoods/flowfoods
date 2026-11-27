import { notFound } from 'next/navigation';
import { PainelReviewFila } from '@/components/erp/telas/integracoes/painel-review-fila';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { consultarReviewDaDemonstracao, type BuscaReviewFila } from '@/lib/integracoes/core/consulta-review-fila';

export const dynamic = 'force-dynamic';

export default async function ReviewNoNivel1(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<BuscaReviewFila>;
}) {
  const { slug } = await props.params;
  const ctx = await exigirParceiro(slug);
  exigirPermissao(ctx, 'integracao.ver');
  const entrada = await consultarReviewDaDemonstracao(ctx, await props.searchParams);
  if (!entrada) notFound();
  const central = `/rodolfo/integracoes/${encodeURIComponent(ctx.parceiro.slug)}`;
  return <PainelReviewFila central={central} parceiroNome={ctx.parceiro.nome} {...entrada} />;
}
