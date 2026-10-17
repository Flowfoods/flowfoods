/**
 * ERP, DRE de um Parceiro Flow, pelo nível 1. A MESMA tela da pessoa do parceiro;
 * tudo passa pelo cliente de `exigirParceiro` (portão + RLS). O nível 1 alcança
 * todas as lojas; a visão do topo só filtra.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { carregarDre } from '@/components/erp/telas/dre/carregar';
import { TelaDoDre } from '@/components/erp/telas/dre/dre';
import { Painel, Vazio } from '@/components/erp/ui/superficies';

export const dynamic = 'force-dynamic';

export default async function ParceiroDrePage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'dre.ver');
  const { visao, lojas } = await visaoDaRequisicao(ctx);
  const d = await carregarDre(ctx.cliente, ctx.alcance, visao, lojas, searchParams);
  if (!d) {
    return (
      <Painel>
        <Vazio titulo="Este parceiro ainda não tem loja.">Cadastre a primeira em Lojas e marcas.</Vazio>
      </Painel>
    );
  }
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <TelaDoDre
      d={d}
      base={`${raiz}/dre`}
      raiz={raiz}
      contexto={`${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`}
      pode={{ lancarDespesa: true, definirMetas: true, fecharPeriodo: true, verFaturamento: true, verPrecos: true, verCompras: true, verEstoque: true, veRede: true }}
      bloqueio={ctx.bloqueio}
    />
  );
}
