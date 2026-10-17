/** ERP, lançar despesa (ou as do mês passado) de um Parceiro Flow, pelo nível 1. */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDeNovaDespesa } from '@/components/erp/telas/dre/paginas';
import { acaoLancarDespesa, acaoLancarDoMesPassado } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovaDespesaPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'despesas.lancar');
  const { visao } = await visaoDaRequisicao(ctx);
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <PaginaDeNovaDespesa
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: `${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`, raiz }}
      visao={visao}
      query={searchParams}
      acoes={{ lancar: acaoLancarDespesa.bind(null, params.slug), mesPassado: acaoLancarDoMesPassado.bind(null, params.slug) }}
    />
  );
}
