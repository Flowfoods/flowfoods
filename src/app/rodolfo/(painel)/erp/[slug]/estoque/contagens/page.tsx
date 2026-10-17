/** ERP, contagens por loja de um Parceiro Flow, pelo nível 1 (UX.9). */

import { redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ParceiroContagensPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/estoque`;
  const lojas = (await situacaoDoEstoque(ctx.cliente, ctx.alcance)).filter((l) => l.ativa);
  if (lojas.length === 1) redirect(`${base}/${lojas[0].id}/periodo`);
  return <TelaLojasDoEstoque qual="contagens" lojas={lojas.map((l) => ({ id: l.id, nome: l.nome, estado: l.estado }))} base={base} contexto={ctx.parceiro.nome} />;
}
