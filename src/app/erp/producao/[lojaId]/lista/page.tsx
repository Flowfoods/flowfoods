/**
 * ERP do parceiro — a lista do dia de uma loja (3.2). Vê quem tem "ver produção" NA loja; define (rascunho e confirmar) quem tem
 * "definir a lista do dia". Loja de outro parceiro ou fora do acesso é 404. A rota estática `lista` vence o `[ordemId]`.
 * O rascunho mora na URL (`?dia=` e `l=ficha~quanto`): a prévia não grava nada.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { obterListaDoDia } from '@/lib/erp/lista-do-dia';
import { hrefDaLista, lerPaginaDaLista } from '@/lib/erp/lista-do-dia-campos';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { TelaListaDoDia } from '@/components/erp/telas/producao/lista';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoConfirmarLista } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpListaDoDiaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { dia?: string; l?: string | string[]; f?: string; q?: string; feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const agora = new Date();
  const hoje = hojeNoRio(agora);
  const p = lerPaginaDaLista(searchParams, hoje);
  if (p.nova) redirect(`${hrefDaLista(`/erp/producao/${encodeURIComponent(params.lojaId)}/lista`, p.dia, hoje, [...p.linhas, p.nova])}#rascunho`);
  const d = await obterListaDoDia(ctx.cliente, ctx.alcance, params.lojaId, { dia: p.dia, linhas: p.linhas, excedeu: p.excedeu }, agora);
  if (!d) notFound();
  return (
    <TelaListaDoDia
      d={d}
      base="/erp/producao"
      feito={fraseDoEstoque(searchParams.feito)}
      digitadas={d.pode.planejar ? p.linhas : []}
      acao={acaoConfirmarLista.bind(null, d.loja.id)}
      periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, '/erp')}
      bloqueio={ctx.bloqueio}
      agora={agora}
    />
  );
}
