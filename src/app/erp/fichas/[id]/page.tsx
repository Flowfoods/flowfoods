/**
 * ERP do parceiro — detalhe da ficha técnica. O id da URL só ESCOLHE: a
 * leitura passa pelo cliente do portão da sessão, então ficha de outro
 * parceiro é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterFicha } from '@/lib/erp/fichas';
import { lerFiltrosDeFicha, queryDosFiltrosDeFicha } from '@/lib/erp/ficha-campos';
import { TelaDetalheFicha } from '@/components/erp/telas/fichas/detalhe';
import { acaoSituacaoFicha } from '../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/fichas';

export default async function ErpFichaPage({ params, searchParams }: { params: { id: string }; searchParams: { de?: string; feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.ver');
  const ficha = await obterFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  const de = queryDosFiltrosDeFicha(lerFiltrosDeFicha(Object.fromEntries(new URLSearchParams(searchParams.de ?? ''))));
  return (
    <TelaDetalheFicha
      ficha={ficha}
      base={BASE}
      voltar={de ? `${BASE}?${de}` : BASE}
      feito={searchParams.feito}
      podeEditar={pode(ctx.alcance, 'fichas.editar')}
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoFicha.bind(null, ficha.id)}
      linkDoInsumo={pode(ctx.alcance, 'insumos.ver') ? '/erp/insumos' : undefined}
    />
  );
}
