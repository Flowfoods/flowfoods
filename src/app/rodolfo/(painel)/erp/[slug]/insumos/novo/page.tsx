/** ERP — Novo insumo de um parceiro, pelo nível 1. */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { TelaFormInsumo } from '@/components/erp/telas/insumos/paginas';
import { acaoCadastrarInsumo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovoInsumoPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.editar');
  return (
    <TelaFormInsumo
      base={`/rodolfo/erp/${ctx.parceiro.slug}/insumos`}
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarInsumo.bind(null, ctx.parceiro.slug)}
      bloqueio={ctx.bloqueio}
    />
  );
}
