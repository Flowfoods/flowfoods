/**
 * ERP do parceiro — conferir e concluir a abertura (1.6). Ver exige "ver o
 * estoque" NA loja; concluir, "ajustar saldo" (a action e a regra conferem).
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { conferenciaDaAbertura } from '@/lib/erp/estoque';
import { TelaConferencia } from '@/components/erp/telas/estoque/conferencia';
import { acaoConcluirAbertura } from '../../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/estoque';

export default async function ErpConferirAberturaPage({ params }: { params: { lojaId: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ver');
  const c = await conferenciaDaAbertura(ctx.cliente, ctx.alcance, params.lojaId);
  if (!c) notFound();
  if (c.contagem?.status !== 'ABERTA') redirect(`${BASE}/${c.loja.id}`);
  return (
    <TelaConferencia
      c={c}
      base={BASE}
      acao={acaoConcluirAbertura.bind(null, c.loja.id)}
      podeConcluir={pode(ctx.alcance, 'estoque.ajustar', { lojaId: c.loja.id })}
      bloqueio={ctx.bloqueio}
      verValores={pode(ctx.alcance, 'compras.ver', { lojaId: c.loja.id })}
    />
  );
}
