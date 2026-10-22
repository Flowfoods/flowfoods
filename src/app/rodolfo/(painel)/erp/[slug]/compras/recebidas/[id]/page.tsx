/** ERP, a nota recebida por XML de um Parceiro Flow, pelo nível 1 (lida pelo portão deste parceiro). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterDocumento, opcoesDeInsumosDoDocumento } from '@/lib/erp/documentos-fiscais';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { TelaDocumento } from '@/components/erp/telas/compras/tela-documento';
import { acaoCancelarDocumento, acaoConferirDocumento } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNotaRecebidaPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const doc = await obterDocumento(ctx.cliente, ctx.alcance, params.id);
  if (!doc) notFound();
  const insumos = doc.situacao === 'AGUARDANDO_CONFERENCIA' ? await opcoesDeInsumosDoDocumento(ctx.cliente, ctx.alcance, doc) : [];
  return (
    <TelaDocumento
      doc={doc}
      base={`${base}/compras/recebidas`}
      comprasBase={`${base}/compras`}
      fornecedoresBase={`${base}/compras/fornecedores`}
      insumosBase={`${base}/insumos`}
      feito={searchParams.feito}
      contexto={ctx.parceiro.nome}
      podeLancar
      podeEditarVinculos
      podeEditarFornecedor
      bloqueio={ctx.bloqueio}
      opcoesDeInsumos={insumos}
      hoje={hojeNoRio()}
      acaoConferir={acaoConferirDocumento.bind(null, ctx.parceiro.slug, doc.id)}
      acaoCancelar={acaoCancelarDocumento.bind(null, ctx.parceiro.slug, doc.id)}
    />
  );
}
