/** ERP, divergências por loja de um Parceiro Flow, pelo nível 1 (1.8). */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lojasDasDivergencias } from '@/lib/erp/requisicao';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ParceiroDivergenciasPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.ajustar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/estoque`;
  const lojas = await lojasDasDivergencias(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}/divergencias`);
  return <TelaLojasDoEstoque qual="divergencias" lojas={lojas} base={base} contexto={ctx.parceiro.nome} />;
}
