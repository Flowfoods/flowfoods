/** ERP, ficha técnica de um parceiro para imprimir ou salvar em PDF, pelo nível 1 (N.5): a versão gerencial, com preços. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { fichaNaTela, obterFicha } from '@/lib/erp/fichas';
import { custoPorCanal } from '@/lib/erp/canais';
import { TelaImpressaoFicha } from '@/components/erp/telas/fichas/impressao';

export const dynamic = 'force-dynamic';

export default async function ParceiroImprimirFichaPage({ params }: { params: { slug: string; id: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.ver');
  const ficha = await obterFicha(ctx.cliente, params.id, { verPrecos: true });
  if (!ficha) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  const canais = (await custoPorCanal(ctx.cliente, ficha))?.cmv ?? null;
  return <TelaImpressaoFicha ficha={fichaNaTela(ficha, true)} canais={canais} contexto={ctx.parceiro.nome} base={base} voltar={`${base}/${ficha.id}`} geradoEm={new Date()} />;
}
