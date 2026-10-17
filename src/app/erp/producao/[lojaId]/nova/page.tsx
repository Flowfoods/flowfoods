/**
 * ERP do parceiro — planejar um lote (3.1): "registrar produção" NA loja. O pré-preparo e quanto vêm por ?ficha=&quantas= e a
 * lista de insumos sai da receita no servidor (bruta, com o fator de correção).
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { listaDaProducao, opcoesDaProducao } from '@/lib/erp/producao';
import { TelaNovaProducao } from '@/components/erp/telas/producao/nova';
import { acaoPlanejarProducao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovaProducaoPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { ficha?: string; quantas?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.registrar');
  const o = await opcoesDaProducao(ctx.cliente, ctx.alcance, params.lojaId);
  if (!o) notFound();
  const escolha = { ficha: searchParams.ficha ?? '', quantas: searchParams.quantas ?? '' };
  const lista = escolha.ficha && escolha.quantas ? await listaDaProducao(ctx.cliente, ctx.alcance, o.loja.id, escolha.ficha, escolha.quantas) : null;
  return (
    <TelaNovaProducao
      o={o}
      base="/erp/producao"
      acao={acaoPlanejarProducao.bind(null, o.loja.id)}
      lista={lista?.ok ? lista : null}
      erroDaLista={lista && !lista.ok ? (Object.values(lista.erros)[0] ?? null) : null}
      escolha={escolha}
      bloqueio={ctx.bloqueio}
    />
  );
}
