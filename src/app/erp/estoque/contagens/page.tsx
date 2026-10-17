/** ERP do parceiro — Contagens (UX.9): escolhe a loja; com uma só no acesso vai direto para o período dela. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { TelaLojasDoEstoque } from '@/components/erp/telas/requisicoes/lojas';

export const dynamic = 'force-dynamic';

export default async function ErpContagensPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ver');
  const lojas = (await situacaoDoEstoque(ctx.cliente, ctx.alcance)).filter((l) => l.ativa);
  if (lojas.length === 1) redirect(`/erp/estoque/${lojas[0].id}/periodo`);
  return <TelaLojasDoEstoque qual="contagens" lojas={lojas.map((l) => ({ id: l.id, nome: l.nome, estado: l.estado }))} base="/erp/estoque" />;
}
