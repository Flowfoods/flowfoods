/**
 * ERP do parceiro — conferir as divergências e aplicar (ou ver o resultado)
 * de uma contagem do dia a dia ou do fechamento do período (1.7). Ver exige
 * "ver o estoque" NA loja; aplicar e descartar, "ajustar saldo" (a action e
 * a regra conferem).
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { conferenciaDaContagem } from '@/lib/erp/contagem';
import { TelaConferirContagem } from '@/components/erp/telas/estoque/conferir-contagem';
import { acaoConcluirContagem, acaoDescartarContagem } from '../../../../actions';
import { voltaDoRelatorio } from '@/lib/erp/volta';

export const dynamic = 'force-dynamic';

const BASE = '/erp/estoque';

export default async function ErpConferirContagemPage({ params, searchParams }: { params: { lojaId: string; contagemId: string }; searchParams: { feito?: string; volta?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ver');
  const c = await conferenciaDaContagem(ctx.cliente, ctx.alcance, params.lojaId, params.contagemId);
  if (!c) notFound();
  const lojaId = c.loja.id;
  return (
    <TelaConferirContagem
      c={c}
      base={BASE}
      voltar={voltaDoRelatorio(searchParams.volta, '/erp')}
      feito={searchParams.feito}
      notasBase={pode(ctx.alcance, 'compras.ver', { lojaId }) ? '/erp/compras' : undefined}
      acoes={{ concluir: acaoConcluirContagem.bind(null, lojaId, c.contagem.id), descartar: acaoDescartarContagem.bind(null, lojaId, c.contagem.id) }}
      podeAplicar={pode(ctx.alcance, 'estoque.ajustar', { lojaId })}
      podeContar={pode(ctx.alcance, 'estoque.contar', { lojaId })}
      bloqueio={ctx.bloqueio}
      verValores={pode(ctx.alcance, 'compras.ver', { lojaId })}
    />
  );
}
