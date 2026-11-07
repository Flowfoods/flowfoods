/** ERP, lançar nota num Parceiro Flow, pelo nível 1. */

import { exigirParceiro, exigirPermissao, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { dadosDoFormularioDeNota } from '@/lib/erp/compras';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { TelaFormNota } from '@/components/erp/telas/compras/paginas';
import { lerRetornoDeCompra } from '@/lib/erp/compra-retorno';
import { acaoSalvarNota } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroLancarNotaPage(
  props: { params: Promise<{ slug: string }>; searchParams?: Promise<{ feito?: string; loja?: string; nova?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.lancar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const [opcoes, { visao }] = await Promise.all([dadosDoFormularioDeNota(ctx.cliente, ctx.alcance), visaoDaRequisicao(ctx)]);
  const retorno = lerRetornoDeCompra(searchParams);
  return (
    <TelaFormNota
      base={`${base}/compras`}
      contexto={`${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`}
      opcoes={opcoes}
      lojaSugerida={retorno?.lojaId ?? (visao.tipo === 'loja' ? visao.lojaId : undefined)}
      retornoDoLancamento={retorno}
      voltarParaInicio={!pode(ctx.alcance, 'compras.ver')}
      acao={acaoSalvarNota.bind(null, ctx.parceiro.slug, '')}
      bloqueio={ctx.bloqueio}
      periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, `/rodolfo/erp/${ctx.parceiro.slug}`)}
      novoFornecedor={`${base}/compras/fornecedores/novo`}
      novoInsumo={`${base}/insumos/novo`}
    />
  );
}
