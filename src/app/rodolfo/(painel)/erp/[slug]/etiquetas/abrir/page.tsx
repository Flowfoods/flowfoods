/** ERP, abrir embalagem num Parceiro Flow, pelo nível 1 (3.4): a escolha da loja (o nível 1 vê, não abre). */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDasEtiquetas } from '@/lib/erp/etiquetas';
import { TelaLojasDasEtiquetas } from '@/components/erp/telas/etiquetas/partes';

export const dynamic = 'force-dynamic';

export default async function ParceiroAbrirEmbalagemPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`;
  const lojas = await lojasDasEtiquetas(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}/abrir`);
  return <TelaLojasDasEtiquetas qual="abrir" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
