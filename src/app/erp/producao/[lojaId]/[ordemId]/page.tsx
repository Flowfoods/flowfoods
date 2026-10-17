/** ERP do parceiro — um lote (3.1): "ver produção" NA loja; de outra loja ou parceiro, 404. O custo só vai para quem vê custos. */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { obterOrdem } from '@/lib/erp/producao';
import { TelaDoLote } from '@/components/erp/telas/producao/lote';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoCancelarProducao, acaoEstornarProducao, acaoIniciarProducao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpLotePage({ params, searchParams }: { params: { lojaId: string; ordemId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const d = await obterOrdem(ctx.cliente, ctx.alcance, params.lojaId, params.ordemId);
  if (!d) notFound();
  const lojaId = d.loja.id;
  const registrar = pode(ctx.alcance, 'producao.registrar', { lojaId });
  const veRequisicao = pode(ctx.alcance, 'requisicao.pedir', { lojaId }) || pode(ctx.alcance, 'requisicao.atender', { lojaId });
  return (
    <TelaDoLote
      d={d}
      base="/erp/producao"
      feito={fraseDoEstoque(searchParams.feito)}
      pode={{ registrar, estornar: registrar && pode(ctx.alcance, 'estoque.ajustar', { lojaId }), planejar: pode(ctx.alcance, 'producao.planejar', { lojaId }) }}
      hrefs={{ requisicao: veRequisicao ? `/erp/estoque/${lojaId}/requisicoes` : null, estoque: pode(ctx.alcance, 'estoque.ver', { lojaId }) ? `/erp/estoque/${lojaId}` : null }}
      acoes={{ iniciar: acaoIniciarProducao.bind(null, lojaId, d.ordem.id), cancelar: acaoCancelarProducao.bind(null, lojaId, d.ordem.id), estornar: acaoEstornarProducao.bind(null, lojaId, d.ordem.id) }}
      bloqueio={ctx.bloqueio}
      periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, '/erp')}
    />
  );
}
