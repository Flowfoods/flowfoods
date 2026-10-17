/** ERP, contar uma contagem do dia a dia ou do fechamento de um Parceiro Flow, pelo nível 1 (1.7). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterContagem } from '@/lib/erp/contagem';
import { TelaPaginaDaContagemDoDia } from '@/components/erp/telas/estoque/paginas';
import { acaoContarNaContagem } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroContagemDoDiaPage({ params, searchParams }: { params: { slug: string; lojaId: string; contagemId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.contar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/estoque`;
  const c = await obterContagem(ctx.cliente, ctx.alcance, params.lojaId, params.contagemId);
  if (!c || c.contagem.tipo === 'ABERTURA') notFound();
  if (ctx.bloqueio || c.contagem.status !== 'ABERTA') redirect(`${base}/${c.loja.id}/contagens/${c.contagem.id}/conferir`);
  return <TelaPaginaDaContagemDoDia c={c} base={base} pessoa={`n1:${ctx.sessao.userId}`} contexto={ctx.parceiro.nome} feito={searchParams.feito} acao={acaoContarNaContagem.bind(null, ctx.parceiro.slug, c.loja.id, c.contagem.id)} podeConcluir />;
}
