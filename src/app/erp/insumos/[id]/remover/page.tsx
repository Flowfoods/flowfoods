/**
 * ERP do parceiro — Remover insumo (L.1). Mostra o que está ligado ao insumo e só então oferece desativar ou, sem nenhum vínculo,
 * excluir de vez. Exige "cadastrar e editar insumos"; as actions conferem de novo. O id da URL só ESCOLHE: a leitura passa pelo
 * cliente do portão da sessão (insumo de outro parceiro é 404).
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { deSeguro } from '@/lib/erp/insumo-campos';
import { lerRemocao } from '@/lib/erp/insumo-remocao';
import { TelaRemoverInsumo } from '@/components/erp/telas/insumos/remover';
import { acaoExcluirInsumo, acaoSituacaoInsumo } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpRemoverInsumoPage({ params, searchParams }: { params: { id: string }; searchParams: { de?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.editar');
  const insumo = await lerRemocao(ctx.cliente, params.id);
  if (!insumo) notFound();
  // Pré-preparo nasce e muda pela ficha técnica: não se remove por aqui (o detalhe explica).
  if (insumo.preparo) redirect(`/erp/insumos/${insumo.id}`);
  return (
    <TelaRemoverInsumo
      insumo={insumo}
      base="/erp/insumos"
      de={deSeguro(searchParams.de)}
      contexto={ctx.parceiro.nome}
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoInsumo.bind(null, insumo.id)}
      acaoExcluir={acaoExcluirInsumo.bind(null, insumo.id)}
    />
  );
}
