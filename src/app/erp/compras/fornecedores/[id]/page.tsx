/**
 * ERP do parceiro — detalhe do fornecedor. Lido pelo portão da sessão:
 * fornecedor de outro parceiro é 404. As notas são as das lojas do alcance.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterFornecedor } from '@/lib/erp/compras';
import { TelaDetalheFornecedor } from '@/components/erp/telas/compras/fornecedores';
import { acaoSituacaoFornecedor } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpFornecedorPage({ params, searchParams }: { params: { id: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  const f = await obterFornecedor(ctx.cliente, ctx.alcance, params.id);
  if (!f) notFound();
  return (
    <TelaDetalheFornecedor
      fornecedor={f}
      base="/erp/compras/fornecedores"
      notasBase="/erp/compras"
      insumosBase={pode(ctx.alcance, 'insumos.ver') ? '/erp/insumos' : undefined}
      feito={searchParams.feito}
      podeEditar={pode(ctx.alcance, 'fornecedores.editar')}
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoFornecedor.bind(null, f.id)}
    />
  );
}
