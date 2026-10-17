/** ERP, a lista do dia de uma loja de um Parceiro Flow, pelo nível 1 (3.2). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { obterListaDoDia } from '@/lib/erp/lista-do-dia';
import { hrefDaLista, lerPaginaDaLista } from '@/lib/erp/lista-do-dia-campos';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { TelaListaDoDia } from '@/components/erp/telas/producao/lista';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoConfirmarLista } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroListaDoDiaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { dia?: string; l?: string | string[]; f?: string; q?: string; feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/producao`;
  const agora = new Date();
  const hoje = hojeNoRio(agora);
  const p = lerPaginaDaLista(searchParams, hoje);
  if (p.nova) redirect(`${hrefDaLista(`${base}/${encodeURIComponent(params.lojaId)}/lista`, p.dia, hoje, [...p.linhas, p.nova])}#rascunho`);
  const d = await obterListaDoDia(ctx.cliente, ctx.alcance, params.lojaId, { dia: p.dia, linhas: p.linhas, excedeu: p.excedeu }, agora);
  if (!d) notFound();
  return (
    <TelaListaDoDia
      d={d}
      base={base}
      contexto={ctx.parceiro.nome}
      feito={fraseDoEstoque(searchParams.feito)}
      digitadas={d.pode.planejar ? p.linhas : []}
      acao={acaoConfirmarLista.bind(null, ctx.parceiro.slug, d.loja.id)}
      periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, `/rodolfo/erp/${ctx.parceiro.slug}`)}
      bloqueio={ctx.bloqueio}
      agora={agora}
    />
  );
}
