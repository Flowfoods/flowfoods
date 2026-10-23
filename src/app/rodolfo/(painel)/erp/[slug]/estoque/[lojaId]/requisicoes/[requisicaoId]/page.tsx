/** ERP, uma requisição de uma loja de um Parceiro Flow, pelo nível 1 (1.8). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterRequisicao } from '@/lib/erp/requisicao';
import { TelaDetalheDaRequisicao } from '@/components/erp/telas/requisicoes/detalhe';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoCancelarRequisicao, acaoDevolverNaRequisicao } from '../../../actions';
import { voltaDoRelatorio } from '@/lib/erp/volta';

export const dynamic = 'force-dynamic';

export default async function ParceiroRequisicaoPage({ params, searchParams }: { params: { slug: string; lojaId: string; requisicaoId: string }; searchParams: { feito?: string; volta?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'requisicao.pedir');
  const d = await obterRequisicao(ctx.cliente, ctx.alcance, params.lojaId, params.requisicaoId);
  if (!d) notFound();
  return (
    <TelaDetalheDaRequisicao
      d={d}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/estoque`}
      voltar={voltaDoRelatorio(searchParams.volta, `/rodolfo/erp/${ctx.parceiro.slug}`)}
      contexto={ctx.parceiro.nome}
      feito={fraseDoEstoque(searchParams.feito)}
      pode={{ atender: true, cancelar: true }}
      acoes={{
        devolver: acaoDevolverNaRequisicao.bind(null, ctx.parceiro.slug, d.loja.id, d.requisicao.id),
        cancelar: acaoCancelarRequisicao.bind(null, ctx.parceiro.slug, d.loja.id, d.requisicao.id),
      }}
      bloqueio={ctx.bloqueio}
      hrefProducao={`/rodolfo/erp/${ctx.parceiro.slug}/producao/${d.loja.id}`}
    />
  );
}
