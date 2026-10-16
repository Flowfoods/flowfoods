/** ERP, detalhe de um fornecedor de um Parceiro Flow, pelo nível 1 (lido pelo portão deste parceiro). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterFornecedor } from '@/lib/erp/compras';
import { TelaDetalheFornecedor } from '@/components/erp/telas/compras/fornecedores';
import { acaoSituacaoFornecedor } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroFornecedorPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const f = await obterFornecedor(ctx.cliente, ctx.alcance, params.id);
  if (!f) notFound();
  return (
    <TelaDetalheFornecedor
      fornecedor={f}
      base={`${base}/compras/fornecedores`}
      notasBase={`${base}/compras`}
      insumosBase={`${base}/insumos`}
      feito={searchParams.feito}
      contexto={ctx.parceiro.nome}
      podeEditar
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoFornecedor.bind(null, ctx.parceiro.slug, f.id)}
    />
  );
}
