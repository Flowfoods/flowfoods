/** ERP, planejar um lote numa loja de um Parceiro Flow, pelo nível 1 (3.1). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { listaDaProducao, opcoesDaProducao } from '@/lib/erp/producao';
import { TelaNovaProducao } from '@/components/erp/telas/producao/nova';
import { acaoPlanejarProducao } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovaProducaoPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { ficha?: string; quantas?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.registrar');
  const o = await opcoesDaProducao(ctx.cliente, ctx.alcance, params.lojaId);
  if (!o) notFound();
  const escolha = { ficha: searchParams.ficha ?? '', quantas: searchParams.quantas ?? '' };
  const lista = escolha.ficha && escolha.quantas ? await listaDaProducao(ctx.cliente, ctx.alcance, o.loja.id, escolha.ficha, escolha.quantas) : null;
  return (
    <TelaNovaProducao
      o={o}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/producao`}
      contexto={ctx.parceiro.nome}
      acao={acaoPlanejarProducao.bind(null, ctx.parceiro.slug, o.loja.id)}
      lista={lista?.ok ? lista : null}
      erroDaLista={lista && !lista.ok ? (Object.values(lista.erros)[0] ?? null) : null}
      escolha={escolha}
      bloqueio={ctx.bloqueio}
    />
  );
}
