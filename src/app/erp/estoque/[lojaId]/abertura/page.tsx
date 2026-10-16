/**
 * ERP do parceiro — contagem de abertura da loja (1.6), feita no celular.
 * Contar exige "fazer contagem" NA loja; sem contagem em andamento (não
 * começada ou já concluída), volta para o estoque da loja.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterContagemDeAbertura } from '@/lib/erp/estoque';
import { TelaPaginaDaContagem } from '@/components/erp/telas/estoque/paginas';
import { acaoContarItem } from '../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/estoque';

export default async function ErpContagemDeAberturaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.contar');
  const c = await obterContagemDeAbertura(ctx.cliente, ctx.alcance, params.lojaId);
  if (!c) notFound();
  if (!pode(ctx.alcance, 'estoque.contar', { lojaId: c.loja.id }) || ctx.bloqueio || c.contagem?.status !== 'ABERTA') redirect(`${BASE}/${c.loja.id}`);
  return (
    <TelaPaginaDaContagem
      c={c}
      base={BASE}
      feito={searchParams.feito}
      acao={acaoContarItem.bind(null, c.loja.id)}
      podeConcluir={pode(ctx.alcance, 'estoque.ajustar', { lojaId: c.loja.id })}
    />
  );
}
