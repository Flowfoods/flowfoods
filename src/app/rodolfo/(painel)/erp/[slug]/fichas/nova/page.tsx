/** ERP, Nova ficha técnica de um parceiro, pelo nível 1. */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { lerEdicaoDaFicha } from '@/lib/erp/fichas';
import { carregarClassificacaoDoFormulario, TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { acaoBuscarClassificacao, acaoCadastrarFichaUnificada, acaoGerirClassificacao } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovaFichaPage(
  props: { params: Promise<{ slug: string }>; searchParams?: Promise<{ de?: string | string[] }> }
) {
  const searchParams = (await props.searchParams) ?? {};
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  const dados = await lerEdicaoDaFicha(ctx.cliente, null, { verPrecos: true });
  if (!dados) throw new Error('Não foi possível abrir a ficha.');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <TelaFormFicha
      verCustos
      base={`${base}/fichas`}
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarFichaUnificada.bind(null, ctx.parceiro.slug)}
      de={deSeguroDaFicha(searchParams.de)}
      classificacao={await carregarClassificacaoDoFormulario(acaoBuscarClassificacao.bind(null, ctx.parceiro.slug), acaoGerirClassificacao.bind(null, ctx.parceiro.slug))}
      opcoes={dados.opcoes}
      preparos={dados.preparos}
      materiais={dados.materiais}
      bloqueio={ctx.bloqueio}
      novoInsumo={`${base}/insumos/novo`}
    />
  );
}
