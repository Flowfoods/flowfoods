/**
 * ERP do parceiro — contar uma contagem do dia a dia ou do fechamento (1.7),
 * no celular. Contar exige "fazer contagem" NA loja; contagem que já não
 * está em andamento (aplicada, fechou sozinha, venceu, descartada) vai para
 * o resultado.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterContagem } from '@/lib/erp/contagem';
import { TelaPaginaDaContagemDoDia } from '@/components/erp/telas/estoque/paginas';
import { acaoContarNaContagem } from '../../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/estoque';

export default async function ErpContagemDoDiaPage({ params, searchParams }: { params: { lojaId: string; contagemId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.contar');
  const c = await obterContagem(ctx.cliente, ctx.alcance, params.lojaId, params.contagemId, ctx.parceiro);
  if (!c || c.contagem.tipo === 'ABERTURA') notFound();
  const lojaId = c.loja.id;
  if (!pode(ctx.alcance, 'estoque.contar', { lojaId }) || ctx.bloqueio || c.contagem.status !== 'ABERTA') redirect(`${BASE}/${lojaId}/contagens/${c.contagem.id}/conferir`);
  return (
    <TelaPaginaDaContagemDoDia
      c={c}
      base={BASE}
      feito={searchParams.feito}
      acao={acaoContarNaContagem.bind(null, lojaId, c.contagem.id)}
      podeConcluir={pode(ctx.alcance, 'estoque.ajustar', { lojaId })}
    />
  );
}
