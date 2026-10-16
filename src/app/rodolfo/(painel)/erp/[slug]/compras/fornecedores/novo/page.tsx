/** ERP, novo fornecedor de um Parceiro Flow, pelo nível 1. */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { TelaFormFornecedor } from '@/components/erp/telas/compras/paginas';
import { acaoCadastrarFornecedor } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovoFornecedorPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fornecedores.editar');
  return (
    <TelaFormFornecedor
      base={`/rodolfo/erp/${ctx.parceiro.slug}/compras/fornecedores`}
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarFornecedor.bind(null, ctx.parceiro.slug)}
      bloqueio={ctx.bloqueio}
    />
  );
}
