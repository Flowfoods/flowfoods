/** ERP, o estoque de uma loja de um Parceiro Flow, pelo nível 1 (1.6; lida pelo portão deste parceiro). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterEstoqueDaLoja } from '@/lib/erp/estoque';
import { situacaoDoPeriodo } from '@/lib/erp/contagem';
import { lojasDasRequisicoes } from '@/lib/erp/requisicao';
import { lerFiltrosDoSaldo, TelaEstoqueDaLoja } from '@/components/erp/telas/estoque/loja';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoDescartarAbertura, acaoIniciarAbertura } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEstoqueDaLojaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const filtros = lerFiltrosDoSaldo(searchParams);
  const e = await obterEstoqueDaLoja(ctx.cliente, ctx.alcance, params.lojaId, filtros);
  if (!e) notFound();
  // 1.7: com o estoque aberto, o período (cobertura × piso) e as contagens do dia a dia.
  const periodo = e.estado === 'ABERTO' ? await situacaoDoPeriodo(ctx.cliente, ctx.alcance, e.loja.id) : null;
  const requisicoes = e.estado === 'ABERTO' ? ((await lojasDasRequisicoes(ctx.cliente, ctx.alcance)).find((l) => l.id === e.loja.id) ?? null) : null;
  return (
    <TelaEstoqueDaLoja
      e={e}
      base={`${base}/estoque`}
      contexto={ctx.parceiro.nome}
      feito={fraseDoEstoque(typeof searchParams.feito === 'string' ? searchParams.feito : undefined)}
      filtros={filtros}
      insumosBase={`${base}/insumos`}
      notasBase={`${base}/compras`}
      pode={{ contar: true, ajustar: true, requisicoes: true, pedir: true }}
      acoes={{ abrir: acaoIniciarAbertura.bind(null, ctx.parceiro.slug, e.loja.id), descartar: acaoDescartarAbertura.bind(null, ctx.parceiro.slug, e.loja.id) }}
      bloqueio={ctx.bloqueio}
      periodo={periodo}
      requisicoes={requisicoes}
    />
  );
}
