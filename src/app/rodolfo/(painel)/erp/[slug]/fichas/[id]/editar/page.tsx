/** ERP, editar ficha técnica de um parceiro, pelo nível 1. */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lerEdicaoDaFicha } from '@/lib/erp/fichas';
import { carregarClassificacaoDoFormulario, TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { acaoBuscarClassificacao, acaoEditarFichaUnificada, acaoGerirClassificacao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEditarFichaPage({ params, searchParams = {} }: { params: { slug: string; id: string }; searchParams?: { de?: string | string[] } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  const dados = await lerEdicaoDaFicha(ctx.cliente, params.id, { verPrecos: true });
  const ficha = dados?.ficha;
  if (!dados || !ficha) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const de = deSeguroDaFicha(searchParams.de);
  if (!ficha.ativa) redirect(`${base}/fichas/${ficha.id}${de ? `?de=${encodeURIComponent(de)}` : ''}`);
  return (
    <TelaFormFicha
      verCustos
      ficha={ficha}
      base={`${base}/fichas`}
      contexto={ctx.parceiro.nome}
      acao={acaoEditarFichaUnificada.bind(null, ctx.parceiro.slug, ficha.id)}
      de={de}
      classificacao={await carregarClassificacaoDoFormulario(acaoBuscarClassificacao.bind(null, ctx.parceiro.slug), acaoGerirClassificacao.bind(null, ctx.parceiro.slug), ficha.classificacao)}
      opcoes={dados.opcoes}
      preparos={dados.preparos}
      materiais={dados.materiais}
      bloqueio={ctx.bloqueio}
      novoInsumo={`${base}/insumos/novo`}
    />
  );
}
