/** ERP, fotos da ficha de um parceiro pelo nível 1 (F4). Lida pelo portão do parceiro do slug: de outro, 404. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterFotosDaFicha } from '@/lib/erp/ficha-fotos';
import { PaginaFotosDaFicha } from '@/components/erp/telas/fichas/pagina-fotos';
import { acaoFotosDaFicha } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroFotosDaFichaPage({ params }: { params: { slug: string; id: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  const fotos = await obterFotosDaFicha(ctx.cliente, params.id);
  if (!fotos) notFound();
  return (
    <PaginaFotosDaFicha
      fotos={fotos}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/fichas`}
      contexto={ctx.parceiro.nome}
      bloqueio={ctx.bloqueio}
      acao={acaoFotosDaFicha.bind(null, ctx.parceiro.slug, fotos.id)}
    />
  );
}
