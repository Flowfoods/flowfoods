/**
 * ERP do parceiro — planejar a contagem do dia (1.7). Ver o planejamento
 * exige "ajustar saldo" (quem começa uma contagem); a loja é conferida NA
 * regra (`planejamentoDoCiclo`, fora do alcance = 404) e a action confere de
 * novo com a loja.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { planejamentoDoCiclo } from '@/lib/erp/contagem';
import { lerFiltroDoPlanejamento, TelaPlanejarCiclo } from '@/components/erp/telas/estoque/planejar';
import { acaoIniciarCiclo } from '../../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/estoque';

export default async function ErpPlanejarContagemPage({ params, searchParams }: { params: { lojaId: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ajustar');
  const filtro = lerFiltroDoPlanejamento(searchParams);
  const p = await planejamentoDoCiclo(ctx.cliente, ctx.alcance, params.lojaId, filtro);
  if (!p) {
    // Loja fora do alcance = 404; loja sem estoque aberto volta para o estoque dela.
    if (/^[a-z0-9]{1,64}$/i.test(params.lojaId) && pode(ctx.alcance, 'estoque.ver', { lojaId: params.lojaId })) redirect(`${BASE}/${params.lojaId}`);
    notFound();
  }
  return (
    <TelaPlanejarCiclo
      p={p}
      base={BASE}
      filtro={filtro}
      acao={acaoIniciarCiclo.bind(null, p.loja.id)}
      podePlanejar={pode(ctx.alcance, 'estoque.ajustar', { lojaId: p.loja.id })}
      bloqueio={ctx.bloqueio}
    />
  );
}
