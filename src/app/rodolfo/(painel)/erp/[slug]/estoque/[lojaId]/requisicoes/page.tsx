/** ERP, quadro de requisições de uma loja de um Parceiro Flow, pelo nível 1 (1.8). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { quadroDeRequisicoes } from '@/lib/erp/requisicao';
import { TelaQuadroDeRequisicoes } from '@/components/erp/telas/requisicoes/quadro';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';

export const dynamic = 'force-dynamic';

export default async function ParceiroRequisicoesDaLojaPage(
  props: { params: Promise<{ slug: string; lojaId: string }>; searchParams: Promise<{ feito?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'requisicao.pedir');
  const q = await quadroDeRequisicoes(ctx.cliente, ctx.alcance, params.lojaId);
  if (!q) notFound();
  return (
    <TelaQuadroDeRequisicoes
      q={q}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/estoque`}
      contexto={ctx.parceiro.nome}
      feito={fraseDoEstoque(searchParams.feito)}
      pode={{ pedir: true, atender: true, divergencias: true }}
      bloqueio={ctx.bloqueio}
    />
  );
}
