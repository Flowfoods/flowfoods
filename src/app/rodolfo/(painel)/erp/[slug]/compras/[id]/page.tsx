/** ERP, detalhe de uma nota de compra de um Parceiro Flow, pelo nível 1 (lida pelo portão deste parceiro). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterNota } from '@/lib/erp/compras';
import { lerFiltrosDeNota, queryDosFiltrosDeNota } from '@/lib/erp/compra-campos';
import { TelaDetalheNota } from '@/components/erp/telas/compras/detalhe-nota';
import { acaoCancelarNota } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNotaPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: { de?: string; feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const nota = await obterNota(ctx.cliente, ctx.alcance, params.id);
  if (!nota) notFound();
  const de = queryDosFiltrosDeNota(lerFiltrosDeNota(Object.fromEntries(new URLSearchParams(searchParams.de ?? ''))));
  return (
    <TelaDetalheNota
      nota={nota}
      base={`${base}/compras`}
      voltar={de ? `${base}/compras?${de}` : `${base}/compras`}
      feito={searchParams.feito}
      contexto={ctx.parceiro.nome}
      podeLancar
      bloqueio={ctx.bloqueio}
      insumosBase={`${base}/insumos`}
      fornecedoresBase={`${base}/compras/fornecedores`}
      estoqueBase={`${base}/estoque`}
      acaoCancelar={acaoCancelarNota.bind(null, ctx.parceiro.slug, nota.id)}
    />
  );
}
