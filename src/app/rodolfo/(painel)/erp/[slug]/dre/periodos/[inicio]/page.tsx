/** ERP, um período de um Parceiro Flow, pelo nível 1: fechar, ver a fotografia e as versões, e REABRIR (só aqui). */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDoFechamento } from '@/components/erp/telas/dre/paginas';
import { acaoFecharPeriodo, acaoReabrirPeriodo } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroPeriodoPage({ params, searchParams }: { params: { slug: string; inicio: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'dre.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const { slug, inicio } = params;
  return (
    <PaginaDoFechamento
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: `${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`, raiz: `/rodolfo/erp/${ctx.parceiro.slug}` }}
      inicio={inicio}
      query={searchParams}
      acoes={{ fechar: acaoFecharPeriodo.bind(null, slug, inicio), reabrir: acaoReabrirPeriodo.bind(null, slug, inicio) }}
    />
  );
}
