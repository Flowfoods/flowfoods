/** ERP, o histórico de impressões de uma loja de um Parceiro Flow, pelo nível 1 (3.4). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { historicoDeImpressoes } from '@/lib/erp/etiquetas';
import { TelaHistoricoDeImpressoes } from '@/components/erp/telas/etiquetas/historico';

export const dynamic = 'force-dynamic';

export default async function ParceiroHistoricoDeImpressoesDaLojaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { periodo?: string; de?: string; ate?: string; origem?: string; pagina?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const h = await historicoDeImpressoes(ctx.cliente, ctx.alcance, params.lojaId, searchParams);
  if (!h) notFound();
  return <TelaHistoricoDeImpressoes h={h} base={`/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`} contexto={ctx.parceiro.nome} />;
}
