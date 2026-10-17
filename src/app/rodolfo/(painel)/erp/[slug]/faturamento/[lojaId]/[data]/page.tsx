/** ERP, o dia de uma loja de um Parceiro Flow, pelo nível 1 (2.1; lido pelo portão deste parceiro). Loja de outro parceiro ou inexistente é 404. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { hojeNoRio, lerData } from '@/lib/erp/compra-campos';
import { LIMITES_DO_FATURAMENTO } from '@/lib/erp/faturamento-campos';
import { obterDia } from '@/lib/erp/faturamento';
import { fraseDoDia } from '@/components/erp/telas/faturamento/estado';
import { TelaDoDia } from '@/components/erp/telas/faturamento/dia';
import { acaoRemoverLancamento, acaoSalvarDia } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroFaturamentoDoDiaPage({ params, searchParams }: { params: { slug: string; lojaId: string; data: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'faturamento.ver');
  const data = lerData(params.data);
  if (!data || data > hojeNoRio() || data < LIMITES_DO_FATURAMENTO.dataMinima) notFound();
  const dia = await obterDia(ctx.cliente, ctx.alcance, params.lojaId, data);
  if (!dia) notFound();
  const slug = ctx.parceiro.slug;
  const lojaId = dia.loja.id;
  return (
    <TelaDoDia
      dia={dia}
      base={`/rodolfo/erp/${slug}/faturamento`}
      feito={fraseDoDia(typeof searchParams.feito === 'string' ? searchParams.feito : undefined)}
      acao={acaoSalvarDia.bind(null, slug, lojaId, data)}
      remover={(canal) => acaoRemoverLancamento.bind(null, slug, lojaId, data, canal)}
      podeLancar
      verPeriodos
      bloqueio={ctx.bloqueio}
    />
  );
}
