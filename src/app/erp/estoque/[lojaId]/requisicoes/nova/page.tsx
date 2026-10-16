/**
 * ERP do parceiro — nova requisição (1.8): "pedir requisição" NA loja. O setor
 * da pessoa vem marcado (setor não concede nada). "Puxar de uma ficha" monta a
 * lista no servidor pela receita (?ficha=&quantas=).
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { listaDaFicha, opcoesDoPedido } from '@/lib/erp/requisicao';
import { TelaNovaRequisicao } from '@/components/erp/telas/requisicoes/nova';
import { setorDoPedido } from '@/components/erp/telas/requisicoes/setor';
import { acaoPedirRequisicao } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovaRequisicaoPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { ficha?: string; quantas?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'requisicao.pedir');
  const o = await opcoesDoPedido(ctx.cliente, ctx.alcance, params.lojaId);
  if (!o) notFound();
  const escolha = { ficha: searchParams.ficha ?? '', quantas: searchParams.quantas ?? '' };
  const lista = escolha.ficha ? await listaDaFicha(ctx.cliente, ctx.alcance, o.loja.id, escolha.ficha, escolha.quantas) : null;
  return (
    <TelaNovaRequisicao
      o={o}
      base="/erp/estoque"
      acao={acaoPedirRequisicao.bind(null, o.loja.id)}
      setorInicial={setorDoPedido(ctx.pessoa.setores)}
      daFicha={lista?.ok ? lista : null}
      erroDaFicha={lista && !lista.ok ? Object.values(lista.erros)[0] ?? null : null}
      escolha={escolha}
      bloqueio={ctx.bloqueio}
    />
  );
}
