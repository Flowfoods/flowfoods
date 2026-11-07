/** ERP, editar ficha técnica de um parceiro, pelo nível 1. */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { fichaNaTela, insumosParaFicha, obterFicha, preparosParaFicha } from '@/lib/erp/fichas';
import { carregarClassificacaoDoFormulario, TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { acaoBuscarClassificacao, acaoEditarFicha, acaoGerirClassificacao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEditarFichaPage({ params, searchParams = {} }: { params: { slug: string; id: string }; searchParams?: { de?: string | string[] } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  const ficha = await obterFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const de = deSeguroDaFicha(searchParams.de);
  if (!ficha.ativa) redirect(`${base}/fichas/${ficha.id}${de ? `?de=${encodeURIComponent(de)}` : ''}`);
  return (
    <TelaFormFicha
      verCustos
      ficha={fichaNaTela(ficha, true)}
      base={`${base}/fichas`}
      contexto={ctx.parceiro.nome}
      acao={acaoEditarFicha.bind(null, ctx.parceiro.slug, ficha.id)}
      de={de}
      classificacao={await carregarClassificacaoDoFormulario(acaoBuscarClassificacao.bind(null, ctx.parceiro.slug), acaoGerirClassificacao.bind(null, ctx.parceiro.slug), ficha.classificacao)}
      opcoes={await insumosParaFicha(ctx.cliente, ficha.itens.map((i) => i.insumoId).filter((x): x is string => !!x))}
      preparos={await preparosParaFicha(ctx.cliente, ficha.itens.map((i) => i.subfichaId).filter((x): x is string => !!x), ficha.id)}
      bloqueio={ctx.bloqueio}
      novoInsumo={`${base}/insumos/novo`}
    />
  );
}
