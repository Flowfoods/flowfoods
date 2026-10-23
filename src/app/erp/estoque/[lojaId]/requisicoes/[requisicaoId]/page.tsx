/** ERP do parceiro — uma requisição (1.8): quem pede ou quem atende NA loja; de outra loja ou parceiro, 404. */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterRequisicao } from '@/lib/erp/requisicao';
import { TelaDetalheDaRequisicao } from '@/components/erp/telas/requisicoes/detalhe';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoCancelarRequisicao, acaoDevolverNaRequisicao } from '../../../actions';
import { voltaDoRelatorio } from '@/lib/erp/volta';

export const dynamic = 'force-dynamic';

export default async function ErpRequisicaoPage({ params, searchParams }: { params: { lojaId: string; requisicaoId: string }; searchParams: { feito?: string; volta?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  if (!pode(ctx.alcance, 'requisicao.atender')) exigirPermissaoNaPagina(ctx, 'requisicao.pedir');
  const d = await obterRequisicao(ctx.cliente, ctx.alcance, params.lojaId, params.requisicaoId);
  if (!d) notFound();
  const lojaId = d.loja.id;
  const atender = pode(ctx.alcance, 'requisicao.atender', { lojaId });
  return (
    <TelaDetalheDaRequisicao
      d={d}
      base="/erp/estoque"
      voltar={voltaDoRelatorio(searchParams.volta, '/erp')}
      feito={fraseDoEstoque(searchParams.feito)}
      pode={{ atender, cancelar: atender || pode(ctx.alcance, 'requisicao.pedir', { lojaId }) }}
      acoes={{ devolver: acaoDevolverNaRequisicao.bind(null, lojaId, d.requisicao.id), cancelar: acaoCancelarRequisicao.bind(null, lojaId, d.requisicao.id) }}
      bloqueio={ctx.bloqueio}
      hrefProducao={pode(ctx.alcance, 'producao.ver', { lojaId }) ? `/erp/producao/${lojaId}` : null}
    />
  );
}
