/** ERP do parceiro — editar insumo (versão lida vai junto; conflito é recusado no servidor). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { obterInsumo } from '@/lib/erp/insumos';
import { categoriasDoFormulario } from '@/lib/erp/categorias';
import { deSeguro } from '@/lib/erp/insumo-campos';
import { ondeOInsumoEUsado } from '@/lib/erp/onde-e-usado';
import { TelaFormInsumo } from '@/components/erp/telas/insumos/paginas';
import { acaoEditarInsumo } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEditarInsumoPage({ params, searchParams }: { params: { id: string }; searchParams: { de?: string; origem?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.editar');
  const insumo = await obterInsumo(ctx.cliente, params.id, ctx.alcance);
  if (!insumo) notFound();
  // Desativado não se edita: primeiro reativa (no detalhe).
  // Pré-preparo (1.3) só muda pela ficha técnica.
  if (!insumo.ativo || insumo.preparo) redirect(`/erp/insumos/${insumo.id}`);
  // L.1: de onde a pessoa veio na lista (a caneta da linha manda `origem=lista`); só os filtros conhecidos passam.
  const de = deSeguro(searchParams.de);
  const categorias = await categoriasDoFormulario(ctx.cliente, insumo.categoria?.id);
  const usadoEm = (await ondeOInsumoEUsado(ctx.cliente, insumo.id, insumo.unidade)).total;
  return (
    <TelaFormInsumo
      insumo={insumo}
      categorias={categorias}
      base="/erp/insumos"
      contexto={ctx.parceiro.nome}
      acao={acaoEditarInsumo.bind(null, insumo.id)}
      bloqueio={ctx.bloqueio}
      de={de}
      origemLista={searchParams.origem === 'lista'}
      usadoEm={usadoEm}
    />
  );
}
