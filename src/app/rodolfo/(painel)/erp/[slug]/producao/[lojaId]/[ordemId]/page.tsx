/** ERP, um lote de um Parceiro Flow, pelo nível 1 (3.1). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { obterOrdem } from '@/lib/erp/producao';
import { TelaDoLote } from '@/components/erp/telas/producao/lote';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoCancelarProducao, acaoEstornarProducao, acaoIniciarProducao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroLotePage({ params, searchParams }: { params: { slug: string; lojaId: string; ordemId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const d = await obterOrdem(ctx.cliente, ctx.alcance, params.lojaId, params.ordemId);
  if (!d) notFound();
  const lojaId = d.loja.id;
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <TelaDoLote
      d={d}
      base={`${raiz}/producao`}
      contexto={ctx.parceiro.nome}
      feito={fraseDoEstoque(searchParams.feito)}
      pode={{ registrar: true, estornar: true, planejar: true }}
      hrefs={{ requisicao: `${raiz}/estoque/${lojaId}/requisicoes`, estoque: `${raiz}/estoque/${lojaId}` }}
      acoes={{
        iniciar: acaoIniciarProducao.bind(null, ctx.parceiro.slug, lojaId, d.ordem.id),
        cancelar: acaoCancelarProducao.bind(null, ctx.parceiro.slug, lojaId, d.ordem.id),
        estornar: acaoEstornarProducao.bind(null, ctx.parceiro.slug, lojaId, d.ordem.id),
      }}
      bloqueio={ctx.bloqueio}
      periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, `/rodolfo/erp/${ctx.parceiro.slug}`)}
    />
  );
}
