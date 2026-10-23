/** ERP, as etiquetas de uma loja de um Parceiro Flow, pelo nível 1 (3.4): vê e imprime; não abre embalagem. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { painelDeEtiquetas } from '@/lib/erp/etiquetas';
import { TelaPainelDeEtiquetas } from '@/components/erp/telas/etiquetas/painel';
import { fraseDasEtiquetas } from '@/components/erp/telas/etiquetas/estado';

export const dynamic = 'force-dynamic';

export default async function ParceiroEtiquetasDaLojaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { lote?: string; feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const p = await painelDeEtiquetas(ctx.cliente, ctx.alcance, params.lojaId, { lote: searchParams.lote });
  if (!p) notFound();
  return <TelaPainelDeEtiquetas p={p} base={`/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`} contexto={ctx.parceiro.nome} feito={fraseDasEtiquetas(searchParams.feito)} podeAbrir={false} />;
}
