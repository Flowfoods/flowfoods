/** ERP, embalagens por canal de uma ficha de prato de um parceiro, pelo nível 1 (lida pelo portão do parceiro do slug: de outro, 404). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterFicha } from '@/lib/erp/fichas';
import { custoPorCanal, embalagensParaEscolher } from '@/lib/erp/canais';
import { TelaEmbalagensDaFicha } from '@/components/erp/telas/fichas/canais';
import { acaoSalvarEmbalagens } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEmbalagensDaFichaPage({ params }: { params: { slug: string; id: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  exigirPermissao(ctx, 'precos.ver');
  const ficha = await obterFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const canais = await custoPorCanal(ctx.cliente, ficha);
  if (!ficha.ativa || !canais) redirect(`${base}/fichas/${ficha.id}`);
  return (
    <TelaEmbalagensDaFicha
      ficha={ficha}
      canais={canais}
      base={`${base}/fichas`}
      contexto={ctx.parceiro.nome}
      acao={acaoSalvarEmbalagens.bind(null, ctx.parceiro.slug, ficha.id)}
      opcoes={await embalagensParaEscolher(ctx.cliente, canais.embalagens.map((e) => e.insumoId))}
      bloqueio={ctx.bloqueio}
      novoInsumo={`${base}/insumos/novo`}
    />
  );
}
