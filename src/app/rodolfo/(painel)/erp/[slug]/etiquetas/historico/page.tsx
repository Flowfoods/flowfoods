/** ERP, o histórico de impressões de um Parceiro Flow, pelo nível 1 (3.4): a escolha da loja. */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDasEtiquetas } from '@/lib/erp/etiquetas';
import { TelaLojasDasEtiquetas } from '@/components/erp/telas/etiquetas/partes';

export const dynamic = 'force-dynamic';

export default async function ParceiroHistoricoDeImpressoesPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`;
  const lojas = await lojasDasEtiquetas(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`${base}/historico/${lojas[0].id}`);
  return <TelaLojasDasEtiquetas qual="historico" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
