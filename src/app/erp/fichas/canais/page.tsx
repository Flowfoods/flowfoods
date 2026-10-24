/**
 * ERP do parceiro — Canais de venda (1.9): como cada canal entra no custo do
 * prato e a taxa do iFood do parceiro. Ver: "ver preços e margens"; mudar a
 * taxa: "mudar preços e margens" (a action confere de novo).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterTaxaDoIfood } from '@/lib/erp/canais';
import { TelaCanaisDeVenda } from '@/components/erp/telas/fichas/canais';
import { acaoSalvarMargensAlvo, acaoSalvarMetasDeCmv, acaoSalvarTaxaDoIfood } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpCanaisDeVendaPage({ searchParams }: { searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'precos.ver');
  const t = await obterTaxaDoIfood(ctx.cliente);
  return (
    <TelaCanaisDeVenda
      base="/erp/fichas"
      contexto={ctx.parceiro.nome}
      taxa={t.taxa}
      versao={t.versao}
      historico={t.historico}
      podeEditar={pode(ctx.alcance, 'precos.editar')}
      podeVerFichas={pode(ctx.alcance, 'fichas.ver')}
      bloqueio={ctx.bloqueio}
      acao={acaoSalvarTaxaDoIfood}
      feito={searchParams.feito}
      margens={t.margens}
      versaoDasMargens={t.versaoDasMargens}
      acaoMargens={acaoSalvarMargensAlvo}
      metas={t.metas}
      versaoDasMetas={t.versaoDasMetas}
      acaoMetas={acaoSalvarMetasDeCmv}
    />
  );
}
