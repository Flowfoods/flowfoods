/**
 * ERP do parceiro — o dia de uma loja (2.1). O id da URL só ESCOLHE: a leitura
 * passa pelo portão da sessão e pelo alcance ("ver faturamento" NA loja), então
 * loja de outro parceiro, fora do acesso ou inexistente é 404 — a mesma
 * resposta. Data inválida ou futura também. Lançar exige "lançar faturamento"
 * na loja; sem isso a tela só mostra.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { hojeNoRio, lerData } from '@/lib/erp/compra-campos';
import { LIMITES_DO_FATURAMENTO } from '@/lib/erp/faturamento-campos';
import { obterDia } from '@/lib/erp/faturamento';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { fraseDoDia } from '@/components/erp/telas/faturamento/estado';
import { TelaDoDia } from '@/components/erp/telas/faturamento/dia';
import { voltaParaAHome } from '@/lib/erp/volta';
import { acaoRemoverLancamento, acaoSalvarDia } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpFaturamentoDoDiaPage(
  props: { params: Promise<{ lojaId: string; data: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'faturamento.ver');
  const data = lerData(params.data);
  if (!data || data > hojeNoRio() || data < LIMITES_DO_FATURAMENTO.dataMinima) notFound();
  const dia = await obterDia(ctx.cliente, ctx.alcance, params.lojaId, data);
  if (!dia) notFound();
  const lojaId = dia.loja.id;
  const hrefIntegracao = dia.origemAnalytics && pode(ctx.alcance, 'integracao.ver', { lojaId }) && await moduloLiberado(ctx.cliente, 'integracao')
    ? `/erp/integracoes?loja=${encodeURIComponent(lojaId)}&dia=${data}` : undefined;
  return (
    <TelaDoDia
      dia={dia}
      hrefIntegracao={hrefIntegracao}
      base="/erp/faturamento"
      feito={fraseDoDia(typeof searchParams.feito === 'string' ? searchParams.feito : undefined)}
      acao={acaoSalvarDia.bind(null, lojaId, data)}
      remover={(canal) => acaoRemoverLancamento.bind(null, lojaId, data, canal)}
      podeLancar={pode(ctx.alcance, 'faturamento.lancar', { lojaId })}
      verPeriodos={pode(ctx.alcance, 'dre.ver')}
      bloqueio={ctx.bloqueio}
      volta={voltaParaAHome(searchParams.volta, '/erp')}
    />
  );
}
