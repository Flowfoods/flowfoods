/** ERP do parceiro — novo fornecedor. Exige "cadastrar fornecedores". */

import { randomUUID } from 'node:crypto';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { caminhoDeVolta } from '@/lib/erp/volta';
import { TelaFormFornecedor } from '@/components/erp/telas/compras/paginas';
import { acaoCadastrarFornecedor } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovoFornecedorPage({ searchParams }: { searchParams: { volta?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fornecedores.editar');
  // A chave deste envio nasce aqui, a cada abertura do formulário: o servidor reconhece o reenvio e não cria outro fornecedor.
  return (
    <TelaFormFornecedor
      base="/erp/compras/fornecedores"
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarFornecedor}
      bloqueio={ctx.bloqueio}
      envio={randomUUID()}
      volta={caminhoDeVolta(searchParams.volta, '/erp/')}
    />
  );
}
