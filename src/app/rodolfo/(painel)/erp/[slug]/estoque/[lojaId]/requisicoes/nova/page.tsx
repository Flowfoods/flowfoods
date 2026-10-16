/** ERP, nova requisição numa loja de um Parceiro Flow, pelo nível 1 (1.8). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { listaDaFicha, opcoesDoPedido } from '@/lib/erp/requisicao';
import { TelaNovaRequisicao } from '@/components/erp/telas/requisicoes/nova';
import { acaoPedirRequisicao } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovaRequisicaoPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { ficha?: string; quantas?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'requisicao.pedir');
  const o = await opcoesDoPedido(ctx.cliente, ctx.alcance, params.lojaId);
  if (!o) notFound();
  const escolha = { ficha: searchParams.ficha ?? '', quantas: searchParams.quantas ?? '' };
  const lista = escolha.ficha ? await listaDaFicha(ctx.cliente, ctx.alcance, o.loja.id, escolha.ficha, escolha.quantas) : null;
  return (
    <TelaNovaRequisicao
      o={o}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/estoque`}
      contexto={ctx.parceiro.nome}
      acao={acaoPedirRequisicao.bind(null, ctx.parceiro.slug, o.loja.id)}
      setorInicial={null}
      daFicha={lista?.ok ? lista : null}
      erroDaFicha={lista && !lista.ok ? Object.values(lista.erros)[0] ?? null : null}
      escolha={escolha}
      bloqueio={ctx.bloqueio}
    />
  );
}
