/**
 * ERP do parceiro — um lote (3.1): "ver produção" NA loja; de outra loja ou parceiro, 404. O custo só vai para quem vê custos.
 * 3.3: quem está com o lote (comparado com o login de quem lê); pegar e soltar = "registrar produção"; a gerência ("definir a
 * lista do dia") passa para outra pessoa — quem pode receber vem das credenciais.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { pessoasQueProduzem } from '@/lib/erp/credenciais';
import { obterOrdem } from '@/lib/erp/producao';
import { TelaDoLote } from '@/components/erp/telas/producao/lote';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoCancelarProducao, acaoEstornarProducao, acaoPassarLote, acaoPegarLote, acaoSoltarLote } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpLotePage({ params, searchParams }: { params: { lojaId: string; ordemId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const d = await obterOrdem(ctx.cliente, ctx.alcance, params.lojaId, params.ordemId, new Date(), ctx.sessao.userId);
  if (!d) notFound();
  const lojaId = d.loja.id;
  const registrar = pode(ctx.alcance, 'producao.registrar', { lojaId });
  const gerenciar = pode(ctx.alcance, 'producao.planejar', { lojaId });
  const veRequisicao = pode(ctx.alcance, 'requisicao.pedir', { lojaId }) || pode(ctx.alcance, 'requisicao.atender', { lojaId });
  return (
    <TelaDoLote
      d={d}
      base="/erp/producao"
      feito={fraseDoEstoque(searchParams.feito)}
      pode={{ registrar, estornar: registrar && pode(ctx.alcance, 'estoque.ajustar', { lojaId }), gerenciar, pegar: true }}
      hrefs={{
        requisicao: veRequisicao ? `/erp/estoque/${lojaId}/requisicoes` : null,
        estoque: pode(ctx.alcance, 'estoque.ver', { lojaId }) ? `/erp/estoque/${lojaId}` : null,
        etiqueta: pode(ctx.alcance, 'etiquetas.imprimir', { lojaId }) ? `/erp/etiquetas/${lojaId}/lote/${d.ordem.id}` : null,
      }}
      acoes={{
        pegar: acaoPegarLote.bind(null, lojaId),
        soltar: acaoSoltarLote.bind(null, lojaId),
        passar: acaoPassarLote.bind(null, lojaId),
        cancelar: acaoCancelarProducao.bind(null, lojaId, d.ordem.id),
        estornar: acaoEstornarProducao.bind(null, lojaId, d.ordem.id),
      }}
      pessoas={gerenciar && d.ordem.status === 'EM_EXECUCAO' ? await pessoasQueProduzem(ctx.parceiro.id, lojaId) : []}
      bloqueio={ctx.bloqueio}
    />
  );
}
