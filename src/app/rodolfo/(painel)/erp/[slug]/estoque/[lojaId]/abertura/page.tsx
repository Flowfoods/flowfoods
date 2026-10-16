/** ERP, contagem de abertura de uma loja de um Parceiro Flow, pelo nível 1 (1.6). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterContagemDeAbertura } from '@/lib/erp/estoque';
import { TelaPaginaDaContagem } from '@/components/erp/telas/estoque/paginas';
import { acaoContarItem } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroContagemDeAberturaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.contar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/estoque`;
  const c = await obterContagemDeAbertura(ctx.cliente, ctx.alcance, params.lojaId);
  if (!c) notFound();
  if (ctx.bloqueio || c.contagem?.status !== 'ABERTA') redirect(`${base}/${c.loja.id}`);
  return <TelaPaginaDaContagem c={c} base={base} pessoa={`n1:${ctx.sessao.userId}`} contexto={ctx.parceiro.nome} feito={searchParams.feito} acao={acaoContarItem.bind(null, ctx.parceiro.slug, c.loja.id)} podeConcluir />;
}
