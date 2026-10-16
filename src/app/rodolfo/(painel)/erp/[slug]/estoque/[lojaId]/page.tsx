/** ERP, o estoque de uma loja de um Parceiro Flow, pelo nível 1 (1.6; lida pelo portão deste parceiro). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterEstoqueDaLoja } from '@/lib/erp/estoque';
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
  return (
    <TelaEstoqueDaLoja
      e={e}
      base={`${base}/estoque`}
      contexto={ctx.parceiro.nome}
      feito={fraseDoEstoque(typeof searchParams.feito === 'string' ? searchParams.feito : undefined)}
      filtros={filtros}
      insumosBase={`${base}/insumos`}
      notasBase={`${base}/compras`}
      pode={{ contar: true, ajustar: true }}
      acoes={{ abrir: acaoIniciarAbertura.bind(null, ctx.parceiro.slug, e.loja.id), descartar: acaoDescartarAbertura.bind(null, ctx.parceiro.slug, e.loja.id) }}
      bloqueio={ctx.bloqueio}
    />
  );
}
