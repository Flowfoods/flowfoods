/** ERP, lançar nota num Parceiro Flow, pelo nível 1. */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { dadosDoFormularioDeNota } from '@/lib/erp/compras';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { TelaFormNota } from '@/components/erp/telas/compras/paginas';
import { acaoSalvarNota } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroLancarNotaPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.lancar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const [opcoes, { visao }] = await Promise.all([dadosDoFormularioDeNota(ctx.cliente, ctx.alcance), visaoDaRequisicao(ctx)]);
  return (
    <TelaFormNota
      base={`${base}/compras`}
      contexto={`${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`}
      opcoes={opcoes}
      lojaSugerida={visao.tipo === 'loja' ? visao.lojaId : undefined}
      acao={acaoSalvarNota.bind(null, ctx.parceiro.slug, '')}
      bloqueio={ctx.bloqueio}
      novoFornecedor={`${base}/compras/fornecedores/novo`}
      novoInsumo={`${base}/insumos/novo`}
    />
  );
}
