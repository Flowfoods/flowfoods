/** ERP, editar fornecedor de um Parceiro Flow, pelo nível 1. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterFornecedor } from '@/lib/erp/compras';
import { TelaFormFornecedor } from '@/components/erp/telas/compras/paginas';
import { acaoEditarFornecedor } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEditarFornecedorPage({ params }: { params: { slug: string; id: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fornecedores.editar');
  const f = await obterFornecedor(ctx.cliente, ctx.alcance, params.id);
  if (!f) notFound();
  return (
    <TelaFormFornecedor
      fornecedor={f}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/compras/fornecedores`}
      contexto={ctx.parceiro.nome}
      acao={acaoEditarFornecedor.bind(null, ctx.parceiro.slug, f.id)}
      bloqueio={ctx.bloqueio}
    />
  );
}
