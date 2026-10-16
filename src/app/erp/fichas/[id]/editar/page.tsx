/** ERP do parceiro — Editar ficha técnica (lida pelo portão da sessão: de outro parceiro, 404). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { insumosParaFicha, obterFicha } from '@/lib/erp/fichas';
import { TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { acaoEditarFicha } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEditarFichaPage({ params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  const ficha = await obterFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  if (!ficha.ativa) redirect(`/erp/fichas/${ficha.id}`);
  const opcoes = await insumosParaFicha(ctx.cliente, ficha.itens.map((i) => i.insumoId).filter((x): x is string => !!x));
  return (
    <TelaFormFicha
      ficha={ficha}
      base="/erp/fichas"
      contexto={ctx.parceiro.nome}
      acao={acaoEditarFicha.bind(null, ficha.id)}
      opcoes={opcoes}
      bloqueio={ctx.bloqueio}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
