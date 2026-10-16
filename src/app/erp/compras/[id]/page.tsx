/**
 * ERP do parceiro — detalhe da nota. O id da URL só ESCOLHE: a leitura passa
 * pelo portão da sessão e pelas lojas do alcance, então nota de outro
 * parceiro ou de loja fora do acesso é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterNota } from '@/lib/erp/compras';
import { lerFiltrosDeNota, queryDosFiltrosDeNota } from '@/lib/erp/compra-campos';
import { TelaDetalheNota } from '@/components/erp/telas/compras/detalhe-nota';
import { acaoCancelarNota } from '../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/compras';

export default async function ErpNotaPage({ params, searchParams }: { params: { id: string }; searchParams: { de?: string; feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  const nota = await obterNota(ctx.cliente, ctx.alcance, params.id);
  if (!nota) notFound();
  const de = queryDosFiltrosDeNota(lerFiltrosDeNota(Object.fromEntries(new URLSearchParams(searchParams.de ?? ''))));
  return (
    <TelaDetalheNota
      nota={nota}
      base={BASE}
      voltar={de ? `${BASE}?${de}` : BASE}
      feito={searchParams.feito}
      podeLancar={pode(ctx.alcance, 'compras.lancar', { lojaId: nota.lojaId })}
      bloqueio={ctx.bloqueio}
      insumosBase={pode(ctx.alcance, 'insumos.ver') ? '/erp/insumos' : undefined}
      fornecedoresBase={`${BASE}/fornecedores`}
      estoqueBase={pode(ctx.alcance, 'estoque.ver', { lojaId: nota.lojaId }) ? '/erp/estoque' : undefined}
      acaoCancelar={acaoCancelarNota.bind(null, nota.id)}
    />
  );
}
