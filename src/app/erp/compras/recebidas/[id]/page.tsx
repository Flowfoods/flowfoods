/**
 * ERP do parceiro — a nota recebida por XML. O id da URL só ESCOLHE: a leitura passa pelo portão da sessão e pelas lojas do alcance,
 * então documento de outro parceiro ou de loja fora do acesso é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterDocumento, opcoesDeInsumosDoDocumento } from '@/lib/erp/documentos-fiscais';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { TelaDocumento } from '@/components/erp/telas/compras/tela-documento';
import { acaoCancelarDocumento, acaoConferirDocumento } from '../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/compras';

export default async function ErpNotaRecebidaPage({ params, searchParams }: { params: { id: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  const doc = await obterDocumento(ctx.cliente, ctx.alcance, params.id);
  if (!doc) notFound();
  // Com a loja resolvida, a permissão é DELA; sem loja (duas lojas com o mesmo CNPJ), vale ter alguma das lojas do CNPJ para lançar.
  const podeLancar = doc.loja ? pode(ctx.alcance, 'compras.lancar', { lojaId: doc.loja.id }) : doc.lojasCandidatas.length > 0;
  const insumos = doc.situacao === 'AGUARDANDO_CONFERENCIA' && podeLancar ? await opcoesDeInsumosDoDocumento(ctx.cliente, ctx.alcance, doc) : [];
  return (
    <TelaDocumento
      doc={doc}
      base={`${BASE}/recebidas`}
      comprasBase={BASE}
      fornecedoresBase={`${BASE}/fornecedores`}
      insumosBase={pode(ctx.alcance, 'insumos.ver') ? '/erp/insumos' : undefined}
      feito={searchParams.feito}
      podeLancar={podeLancar}
      podeEditarVinculos={pode(ctx.alcance, 'fornecedores.editar')}
      podeEditarFornecedor={pode(ctx.alcance, 'fornecedores.editar')}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
      bloqueio={ctx.bloqueio}
      opcoesDeInsumos={insumos}
      hoje={hojeNoRio()}
      acaoConferir={acaoConferirDocumento.bind(null, doc.id)}
      acaoCancelar={acaoCancelarDocumento.bind(null, doc.id)}
    />
  );
}
