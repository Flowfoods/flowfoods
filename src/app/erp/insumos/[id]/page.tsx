/**
 * ERP do parceiro — detalhe do insumo. O id da URL só ESCOLHE: a leitura passa
 * pelo cliente do portão da sessão, então insumo de outro parceiro é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterInsumo } from '@/lib/erp/insumos';
import { lerFiltros, queryDosFiltros } from '@/lib/erp/insumo-campos';
import { TelaDetalheInsumo } from '@/components/erp/telas/insumos/detalhe';
import { acaoSituacaoInsumo } from '../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/insumos';

export default async function ErpInsumoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { de?: string; feito?: string };
}) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.ver');
  const insumo = await obterInsumo(ctx.cliente, params.id);
  if (!insumo) notFound();
  // Volta para a lista como ela estava (só os filtros conhecidos passam).
  const de = queryDosFiltros(lerFiltros(Object.fromEntries(new URLSearchParams(searchParams.de ?? ''))));
  return (
    <TelaDetalheInsumo
      insumo={insumo}
      base={BASE}
      voltar={de ? `${BASE}?${de}` : BASE}
      feito={searchParams.feito}
      podeEditar={pode(ctx.alcance, 'insumos.editar')}
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoInsumo.bind(null, insumo.id)}
    />
  );
}
