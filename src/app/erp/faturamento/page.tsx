/**
 * ERP do parceiro — Faturamento do mês (2.1). A MESMA tela do nível 1, com o
 * cliente do portão resolvido pela SESSÃO. Ver exige "ver faturamento"; só as
 * lojas do alcance entram (no calendário e na soma da rede), e a loja escolhida
 * no topo só FILTRA e nunca concede. "Lançar o dia" e "Importar planilha" só
 * com "lançar faturamento" (as actions conferem de novo, loja a loja). Aberta
 * pela pendência da Home (decisão 518), `?volta=` só vale a Home exata, `/erp`.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { carregarDoMes } from '@/components/erp/telas/faturamento/carregar';
import { TelaDoMes } from '@/components/erp/telas/faturamento/mes';
import { voltaParaAHome } from '@/lib/erp/volta';

export const dynamic = 'force-dynamic';

export default async function ErpFaturamentoPage(
  props: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'faturamento.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const { m, lojaAberta } = await carregarDoMes(ctx.cliente, ctx.alcance, visao, searchParams);
  return (
    <TelaDoMes
      m={m}
      base="/erp/faturamento"
      lojaAberta={lojaAberta}
      podeLancar={pode(ctx.alcance, 'faturamento.lancar')}
      bloqueio={ctx.bloqueio}
      veRede={ctx.alcance.lojas === 'todas'}
      volta={voltaParaAHome(searchParams.volta, '/erp')}
    />
  );
}
