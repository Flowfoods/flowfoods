/** ERP do parceiro — novo fornecedor. Exige "cadastrar fornecedores". */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { TelaFormFornecedor } from '@/components/erp/telas/compras/paginas';
import { acaoCadastrarFornecedor } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovoFornecedorPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fornecedores.editar');
  return <TelaFormFornecedor base="/erp/compras/fornecedores" contexto={ctx.parceiro.nome} acao={acaoCadastrarFornecedor} bloqueio={ctx.bloqueio} />;
}
