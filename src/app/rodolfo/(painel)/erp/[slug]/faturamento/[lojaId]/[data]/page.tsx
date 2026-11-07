/** ERP, o dia de uma loja de um Parceiro Flow, pelo nível 1 (2.1; lido pelo portão deste parceiro). Loja de outro parceiro ou inexistente é 404. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { hojeNoRio, lerData } from '@/lib/erp/compra-campos';
import { LIMITES_DO_FATURAMENTO } from '@/lib/erp/faturamento-campos';
import { obterDia } from '@/lib/erp/faturamento';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { fraseDoDia } from '@/components/erp/telas/faturamento/estado';
import { TelaDoDia } from '@/components/erp/telas/faturamento/dia';
import { voltaParaAHome } from '@/lib/erp/volta';
import { acaoRemoverLancamento, acaoSalvarDia } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroFaturamentoDoDiaPage(
  props: { params: Promise<{ slug: string; lojaId: string; data: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'faturamento.ver');
  const data = lerData(params.data);
  if (!data || data > hojeNoRio() || data < LIMITES_DO_FATURAMENTO.dataMinima) notFound();
  const dia = await obterDia(ctx.cliente, ctx.alcance, params.lojaId, data);
  if (!dia) notFound();
  const slug = ctx.parceiro.slug;
  const lojaId = dia.loja.id;
  const hrefIntegracao = dia.origemAnalytics && await moduloLiberado(ctx.cliente, 'integracao')
    ? `/rodolfo/integracoes/${encodeURIComponent(slug)}?loja=${encodeURIComponent(lojaId)}&dia=${data}` : undefined;
  return (
    <TelaDoDia
      dia={dia}
      hrefIntegracao={hrefIntegracao}
      base={`/rodolfo/erp/${slug}/faturamento`}
      feito={fraseDoDia(typeof searchParams.feito === 'string' ? searchParams.feito : undefined)}
      acao={acaoSalvarDia.bind(null, slug, lojaId, data)}
      remover={(canal) => acaoRemoverLancamento.bind(null, slug, lojaId, data, canal)}
      podeLancar
      verPeriodos
      bloqueio={ctx.bloqueio}
      volta={voltaParaAHome(searchParams.volta, `/rodolfo/erp/${slug}`)}
    />
  );
}
