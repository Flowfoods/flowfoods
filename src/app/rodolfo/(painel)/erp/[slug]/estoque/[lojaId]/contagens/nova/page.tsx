/** ERP, planejar a contagem do dia numa loja de um Parceiro Flow, pelo nível 1 (1.7). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { planejamentoDoCiclo } from '@/lib/erp/contagem';
import { lerFiltroDoPlanejamento, TelaPlanejarCiclo } from '@/components/erp/telas/estoque/planejar';
import { acaoIniciarCiclo } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroPlanejarContagemPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.ajustar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/estoque`;
  const filtro = lerFiltroDoPlanejamento(searchParams);
  const p = await planejamentoDoCiclo(ctx.cliente, ctx.alcance, params.lojaId, filtro);
  if (!p) {
    if (/^[a-z0-9]{1,64}$/i.test(params.lojaId)) redirect(`${base}/${params.lojaId}`);
    notFound();
  }
  return <TelaPlanejarCiclo p={p} base={base} contexto={ctx.parceiro.nome} filtro={filtro} acao={acaoIniciarCiclo.bind(null, ctx.parceiro.slug, p.loja.id)} podePlanejar bloqueio={ctx.bloqueio} />;
}
