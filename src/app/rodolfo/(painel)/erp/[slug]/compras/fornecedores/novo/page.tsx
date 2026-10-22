/** ERP, novo fornecedor de um Parceiro Flow, pelo nível 1. */

import { randomUUID } from 'node:crypto';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { caminhoDeVolta } from '@/lib/erp/volta';
import { TelaFormFornecedor } from '@/components/erp/telas/compras/paginas';
import { acaoCadastrarFornecedor } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovoFornecedorPage({ params, searchParams }: { params: { slug: string }; searchParams: { volta?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fornecedores.editar');
  return (
    <TelaFormFornecedor
      base={`/rodolfo/erp/${ctx.parceiro.slug}/compras/fornecedores`}
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarFornecedor.bind(null, ctx.parceiro.slug)}
      bloqueio={ctx.bloqueio}
      envio={randomUUID()}
      volta={caminhoDeVolta(searchParams.volta, `/rodolfo/erp/${ctx.parceiro.slug}/`)}
    />
  );
}
