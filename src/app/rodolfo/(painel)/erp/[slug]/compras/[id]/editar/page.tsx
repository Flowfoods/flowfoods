/** ERP, editar nota de compra de um Parceiro Flow, pelo nível 1. Cancelada não se edita. */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { dadosDoFormularioDeNota, obterNota } from '@/lib/erp/compras';
import { TelaFormNota } from '@/components/erp/telas/compras/paginas';
import { acaoSalvarNota } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEditarNotaPage({ params }: { params: { slug: string; id: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.lancar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/compras`;
  const nota = await obterNota(ctx.cliente, ctx.alcance, params.id);
  if (!nota) notFound();
  if (nota.cancelada) redirect(`${base}/${nota.id}`);
  const opcoes = await dadosDoFormularioDeNota(ctx.cliente, ctx.alcance, {
    lojaId: nota.lojaId,
    fornecedorId: nota.fornecedor?.id,
    insumoIds: nota.itens.map((i) => i.insumoId ?? '').filter(Boolean),
  });
  return (
    <TelaFormNota
      nota={nota}
      base={base}
      contexto={`${ctx.parceiro.nome} · ${nota.loja}`}
      opcoes={opcoes}
      acao={acaoSalvarNota.bind(null, ctx.parceiro.slug, nota.id)}
      bloqueio={ctx.bloqueio}
      novoFornecedor={`${base}/fornecedores/novo`}
    />
  );
}
