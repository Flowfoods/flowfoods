/** ERP do parceiro — Editar ficha técnica (lida pelo portão da sessão: de outro parceiro, 404). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { fichaNaTela, insumosParaFicha, opcoesDaFichaNaTela, preparosParaFicha, obterFicha } from '@/lib/erp/fichas';
import { TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { acaoEditarFicha } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEditarFichaPage({ params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  const verCustos = pode(ctx.alcance, 'precos.ver');
  const ficha = await obterFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  if (!ficha.ativa) redirect(`/erp/fichas/${ficha.id}`);
  const [opcoes, preparos] = await Promise.all([
    insumosParaFicha(ctx.cliente, ficha.itens.map((i) => i.insumoId).filter((x): x is string => !!x)),
    preparosParaFicha(ctx.cliente, ficha.itens.map((i) => i.subfichaId).filter((x): x is string => !!x), ficha.id),
  ]);
  return (
    <TelaFormFicha
      ficha={fichaNaTela(ficha, verCustos)}
      base="/erp/fichas"
      contexto={ctx.parceiro.nome}
      acao={acaoEditarFicha.bind(null, ficha.id)}
      {...opcoesDaFichaNaTela(opcoes, preparos, verCustos)}
      verCustos={verCustos}
      bloqueio={ctx.bloqueio}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
