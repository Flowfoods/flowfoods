/**
 * ERP do parceiro — o estoque de uma loja (1.6). O id da URL só ESCOLHE: a
 * leitura passa pelo portão da sessão e pelo alcance ("ver o estoque" NA
 * loja), então loja de outro parceiro ou fora do acesso é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterEstoqueDaLoja } from '@/lib/erp/estoque';
import { situacaoDoPeriodo } from '@/lib/erp/contagem';
import { lojasDasRequisicoes } from '@/lib/erp/requisicao';
import { lerFiltrosDoSaldo, TelaEstoqueDaLoja } from '@/components/erp/telas/estoque/loja';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoDescartarAbertura, acaoIniciarAbertura } from '../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/estoque';

export default async function ErpEstoqueDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ver');
  const filtros = lerFiltrosDoSaldo(searchParams);
  const e = await obterEstoqueDaLoja(ctx.cliente, ctx.alcance, params.lojaId, filtros);
  if (!e) notFound();
  // 1.7: com o estoque aberto, o período (cobertura × piso) e as contagens do dia a dia.
  const periodo = e.estado === 'ABERTO' ? await situacaoDoPeriodo(ctx.cliente, ctx.alcance, e.loja.id, ctx.parceiro) : null;
  const lojaId = e.loja.id;
  // 1.8: requisições pendentes da loja (quem pede ou atende).
  const veRequisicoes = pode(ctx.alcance, 'requisicao.pedir', { lojaId }) || pode(ctx.alcance, 'requisicao.atender', { lojaId });
  const requisicoes = e.estado === 'ABERTO' && veRequisicoes ? ((await lojasDasRequisicoes(ctx.cliente, ctx.alcance)).find((l) => l.id === lojaId) ?? null) : null;
  return (
    <TelaEstoqueDaLoja
      e={e}
      base={BASE}
      feito={fraseDoEstoque(typeof searchParams.feito === 'string' ? searchParams.feito : undefined)}
      filtros={filtros}
      insumosBase={pode(ctx.alcance, 'insumos.ver') ? '/erp/insumos' : undefined}
      notasBase={pode(ctx.alcance, 'compras.ver', { lojaId }) ? '/erp/compras' : undefined}
      pode={{ contar: pode(ctx.alcance, 'estoque.contar', { lojaId }), ajustar: pode(ctx.alcance, 'estoque.ajustar', { lojaId }), requisicoes: veRequisicoes, pedir: pode(ctx.alcance, 'requisicao.pedir', { lojaId }) }}
      acoes={{ abrir: acaoIniciarAbertura.bind(null, lojaId), descartar: acaoDescartarAbertura.bind(null, lojaId) }}
      bloqueio={ctx.bloqueio}
      periodo={periodo}
      requisicoes={requisicoes}
    />
  );
}
