/**
 * ERP do parceiro — Lançar despesa (2.2a), ou as do mês passado (`?modo=mes-passado`).
 * Exige "lançar despesas". A loja e a linha escolhidas no formulário são conferidas de
 * novo na gravação (loja do acesso, linha que existe, ativa e que não é calculada).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDeNovaDespesa } from '@/components/erp/telas/dre/paginas';
import { acaoLancarDespesa, acaoLancarDoMesPassado } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovaDespesaPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'despesas.lancar');
  const { visao } = await visaoDaRequisicao(ctx);
  return <PaginaDeNovaDespesa c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: rotuloDaVisao(visao), raiz: '/erp' }} visao={visao} query={searchParams} acoes={{ lancar: acaoLancarDespesa, mesPassado: acaoLancarDoMesPassado }} />;
}
