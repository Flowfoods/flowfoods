/**
 * ERP do parceiro — Remover ficha (F4): mostra onde a ficha é usada e oferece desativar. Exige "criar e editar fichas
 * técnicas"; a action confere de novo. O id da URL só ESCOLHE: a leitura passa pelo cliente do portão da sessão.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { lerRemocaoDaFicha } from '@/lib/erp/fichas';
import { TelaRemoverFicha } from '@/components/erp/telas/fichas/remover';
import { acaoSituacaoFicha } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpRemoverFichaPage({ params, searchParams }: { params: { id: string }; searchParams: { de?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  const ficha = await lerRemocaoDaFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  return (
    <TelaRemoverFicha
      ficha={ficha}
      base="/erp/fichas"
      de={deSeguroDaFicha(searchParams.de)}
      contexto={ctx.parceiro.nome}
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoFicha.bind(null, ficha.id)}
    />
  );
}
