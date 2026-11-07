/** ERP do parceiro — Editar ficha técnica (lida pelo portão da sessão: de outro parceiro, 404). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { lerEdicaoDaFicha } from '@/lib/erp/fichas';
import { carregarClassificacaoDoFormulario, TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { acaoBuscarClassificacao, acaoEditarFichaUnificada, acaoGerirClassificacao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEditarFichaPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { de?: string | string[] } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  const verCustos = pode(ctx.alcance, 'precos.ver');
  const de = deSeguroDaFicha(searchParams.de, verCustos);
  const dados = await lerEdicaoDaFicha(ctx.cliente, params.id, { verPrecos: verCustos });
  const ficha = dados?.ficha;
  if (!dados || !ficha) notFound();
  if (!ficha.ativa && !pode(ctx.alcance, 'fichas.ver')) notFound();
  if (!ficha.ativa) redirect(`/erp/fichas/${ficha.id}${de ? `?de=${encodeURIComponent(de)}` : ''}`);
  return (
    <TelaFormFicha
      ficha={ficha}
      base="/erp/fichas"
      contexto={ctx.parceiro.nome}
      acao={acaoEditarFichaUnificada.bind(null, ficha.id)}
      de={de}
      classificacao={await carregarClassificacaoDoFormulario(acaoBuscarClassificacao, acaoGerirClassificacao, ficha.classificacao)}
      opcoes={dados.opcoes}
      preparos={dados.preparos}
      materiais={dados.materiais}
      verFichas={pode(ctx.alcance, 'fichas.ver')}
      verCustos={verCustos}
      bloqueio={ctx.bloqueio}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
