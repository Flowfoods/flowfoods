/**
 * ERP do parceiro — detalhe da ficha técnica. O id da URL só ESCOLHE: a
 * leitura passa pelo cliente do portão da sessão, então ficha de outro
 * parceiro é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterFicha } from '@/lib/erp/fichas';
import { custoPorCanal } from '@/lib/erp/canais';
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
  // 1.9: o custo por canal só sai do servidor para quem vê a precificação.
  const verPrecos = pode(ctx.alcance, 'precos.ver');
  const canais = verPrecos ? await custoPorCanal(ctx.cliente, ficha) : null;
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
      canais={canais}
      linkDasEmbalagens={pode(ctx.alcance, 'fichas.editar') && verPrecos && !ctx.bloqueio ? `${BASE}/${ficha.id}/canais` : undefined}
      linkDaTaxa={verPrecos ? `${BASE}/canais` : undefined}
      podeConfigurarTaxa={pode(ctx.alcance, 'precos.editar') && !ctx.bloqueio}
    />
  );
}
