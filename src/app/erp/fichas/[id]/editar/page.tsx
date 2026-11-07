/** ERP do parceiro — Editar ficha técnica (lida pelo portão da sessão: de outro parceiro, 404). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { fichaNaTela, insumosParaFicha, opcoesDaFichaNaTela, preparosParaFicha, obterFicha } from '@/lib/erp/fichas';
import { carregarClassificacaoDoFormulario, TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { acaoBuscarClassificacao, acaoEditarFicha, acaoGerirClassificacao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEditarFichaPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { de?: string | string[] } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  const verCustos = pode(ctx.alcance, 'precos.ver');
  const de = deSeguroDaFicha(searchParams.de, verCustos);
  const ficha = await obterFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  if (!ficha.ativa) redirect(`/erp/fichas/${ficha.id}${de ? `?de=${encodeURIComponent(de)}` : ''}`);
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
      de={de}
      classificacao={await carregarClassificacaoDoFormulario(acaoBuscarClassificacao, acaoGerirClassificacao, ficha.classificacao)}
      {...opcoesDaFichaNaTela(opcoes, preparos, verCustos)}
      verCustos={verCustos}
      bloqueio={ctx.bloqueio}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
