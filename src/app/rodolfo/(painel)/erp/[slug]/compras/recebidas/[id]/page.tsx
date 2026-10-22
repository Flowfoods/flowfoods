/** ERP, a nota recebida por XML de um Parceiro Flow, pelo nível 1 (lida pelo portão deste parceiro). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterDocumento, opcoesDeInsumosDoDocumento } from '@/lib/erp/documentos-fiscais';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { caminhoDeVolta, rotuloDaVolta } from '@/lib/erp/volta';
import { TelaDocumento } from '@/components/erp/telas/compras/tela-documento';
import { acaoCancelarDocumento, acaoConferirDocumento } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNotaRecebidaPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: { feito?: string; volta?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const doc = await obterDocumento(ctx.cliente, ctx.alcance, params.id);
  if (!doc) notFound();
  const insumos = doc.situacao === 'AGUARDANDO_CONFERENCIA' ? await opcoesDeInsumosDoDocumento(ctx.cliente, ctx.alcance, doc) : [];
  // L.2: veio do relatório ou da nota de compra? Volta para lá (só caminho interno da área, pelo mesmo filtro da volta da nota).
  const deOnde = caminhoDeVolta(searchParams.volta, `${base}/`, 2000);
  return (
    <TelaDocumento
      doc={doc}
      voltar={deOnde ?? undefined}
      voltarRotulo={deOnde ? rotuloDaVolta(deOnde) : undefined}
      base={`${base}/compras/recebidas`}
      comprasBase={`${base}/compras`}
      fornecedoresBase={`${base}/compras/fornecedores`}
      insumosBase={`${base}/insumos`}
      feito={searchParams.feito}
      contexto={ctx.parceiro.nome}
      podeLancar
      podeEditarVinculos
      podeEditarFornecedor
      novoInsumo={`${base}/insumos/novo`}
      bloqueio={ctx.bloqueio}
      opcoesDeInsumos={insumos}
      hoje={hojeNoRio()}
      acaoConferir={acaoConferirDocumento.bind(null, ctx.parceiro.slug, doc.id)}
      acaoCancelar={acaoCancelarDocumento.bind(null, ctx.parceiro.slug, doc.id)}
    />
  );
}
