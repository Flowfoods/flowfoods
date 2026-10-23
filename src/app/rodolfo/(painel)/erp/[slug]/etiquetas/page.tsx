/** ERP, as etiquetas de um Parceiro Flow, pelo nível 1 (3.4): uma loja vai direto; mais de uma, a escolha. */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDasEtiquetas } from '@/lib/erp/etiquetas';
import { TelaLojasDasEtiquetas } from '@/components/erp/telas/etiquetas/partes';

export const dynamic = 'force-dynamic';

export default async function ParceiroEtiquetasPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`;
  const lojas = await lojasDasEtiquetas(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}`);
  return <TelaLojasDasEtiquetas qual="imprimir" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
