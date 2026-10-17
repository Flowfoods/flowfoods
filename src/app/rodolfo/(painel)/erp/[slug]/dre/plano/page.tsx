/** ERP, Plano de contas de um Parceiro Flow, pelo nível 1. */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDoPlano } from '@/components/erp/telas/dre/paginas';
import { acaoCriarLinhaDoPlano, acaoOcultarLinhaDoPlano, acaoRenomearLinhaDoPlano } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroPlanoPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'metas.editar');
  const { visao } = await visaoDaRequisicao(ctx);
  const { slug } = params;
  return (
    <PaginaDoPlano
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: `${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`, raiz: `/rodolfo/erp/${ctx.parceiro.slug}` }}
      acoes={{ criar: acaoCriarLinhaDoPlano.bind(null, slug), renomear: acaoRenomearLinhaDoPlano.bind(null, slug), ocultar: acaoOcultarLinhaDoPlano.bind(null, slug) }}
    />
  );
}
