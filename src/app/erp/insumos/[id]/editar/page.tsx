/** ERP do parceiro — editar insumo (versão lida vai junto; conflito é recusado no servidor). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { obterInsumo } from '@/lib/erp/insumos';
import { TelaFormInsumo } from '@/components/erp/telas/insumos/paginas';
import { acaoEditarInsumo } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEditarInsumoPage({ params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.editar');
  const insumo = await obterInsumo(ctx.cliente, params.id);
  if (!insumo) notFound();
  // Desativado não se edita: primeiro reativa (no detalhe).
  if (!insumo.ativo) redirect(`/erp/insumos/${insumo.id}`);
  return (
    <TelaFormInsumo
      insumo={insumo}
      base="/erp/insumos"
      contexto={ctx.parceiro.nome}
      acao={acaoEditarInsumo.bind(null, insumo.id)}
      bloqueio={ctx.bloqueio}
    />
  );
}
