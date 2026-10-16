/** ERP do parceiro — editar fornecedor. Exige "cadastrar fornecedores". */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { obterFornecedor } from '@/lib/erp/compras';
import { TelaFormFornecedor } from '@/components/erp/telas/compras/paginas';
import { acaoEditarFornecedor } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEditarFornecedorPage({ params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fornecedores.editar');
  const f = await obterFornecedor(ctx.cliente, ctx.alcance, params.id);
  if (!f) notFound();
  return <TelaFormFornecedor fornecedor={f} base="/erp/compras/fornecedores" contexto={ctx.parceiro.nome} acao={acaoEditarFornecedor.bind(null, f.id)} bloqueio={ctx.bloqueio} />;
}
