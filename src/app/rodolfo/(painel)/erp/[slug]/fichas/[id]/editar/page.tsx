/** ERP, editar ficha técnica de um parceiro, pelo nível 1. */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { insumosParaFicha, obterFicha } from '@/lib/erp/fichas';
import { TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { acaoEditarFicha } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEditarFichaPage({ params }: { params: { slug: string; id: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  const ficha = await obterFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  if (!ficha.ativa) redirect(`${base}/fichas/${ficha.id}`);
  return (
    <TelaFormFicha
      ficha={ficha}
      base={`${base}/fichas`}
      contexto={ctx.parceiro.nome}
      acao={acaoEditarFicha.bind(null, ctx.parceiro.slug, ficha.id)}
      opcoes={await insumosParaFicha(ctx.cliente, ficha.itens.map((i) => i.insumoId).filter((x): x is string => !!x))}
      bloqueio={ctx.bloqueio}
      novoInsumo={`${base}/insumos/novo`}
    />
  );
}
