/** ERP, remover (desativar) a ficha de um parceiro pelo nível 1 (F4). Lida pelo portão do parceiro do slug: de outro, 404. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { lerRemocaoDaFicha } from '@/lib/erp/fichas';
import { TelaRemoverFicha } from '@/components/erp/telas/fichas/remover';
import { acaoSituacaoFicha } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroRemoverFichaPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: { de?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  const ficha = await lerRemocaoDaFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  return (
    <TelaRemoverFicha
      ficha={ficha}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/fichas`}
      de={deSeguroDaFicha(searchParams.de)}
      contexto={ctx.parceiro.nome}
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoFicha.bind(null, ctx.parceiro.slug, ficha.id)}
    />
  );
}
