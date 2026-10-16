/**
 * ERP do parceiro — o quadro de requisições de uma loja (1.8). Vê quem pede
 * ou quem atende NA loja; loja de outro parceiro ou fora do acesso é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { quadroDeRequisicoes } from '@/lib/erp/requisicao';
import { TelaQuadroDeRequisicoes } from '@/components/erp/telas/requisicoes/quadro';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';

export const dynamic = 'force-dynamic';

export default async function ErpRequisicoesDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  if (!pode(ctx.alcance, 'requisicao.atender')) exigirPermissaoNaPagina(ctx, 'requisicao.pedir');
  const q = await quadroDeRequisicoes(ctx.cliente, ctx.alcance, params.lojaId);
  if (!q) notFound();
  const lojaId = q.loja.id;
  return (
    <TelaQuadroDeRequisicoes
      q={q}
      base="/erp/estoque"
      feito={fraseDoEstoque(searchParams.feito)}
      pode={{ pedir: pode(ctx.alcance, 'requisicao.pedir', { lojaId }), atender: pode(ctx.alcance, 'requisicao.atender', { lojaId }), divergencias: pode(ctx.alcance, 'estoque.ajustar', { lojaId }) }}
      bloqueio={ctx.bloqueio}
    />
  );
}
