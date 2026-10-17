/**
 * ERP do parceiro — editar nota. Exige "lançar nota de compra" NA LOJA da
 * nota; cancelada não se edita (volta ao detalhe).
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { dadosDoFormularioDeNota, obterNota } from '@/lib/erp/compras';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { TelaFormNota } from '@/components/erp/telas/compras/paginas';
import { acaoSalvarNota } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEditarNotaPage({ params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.lancar');
  const nota = await obterNota(ctx.cliente, ctx.alcance, params.id);
  if (!nota) notFound();
  exigirPermissaoNaPagina(ctx, 'compras.lancar', { lojaId: nota.lojaId });
  if (nota.cancelada) redirect(`/erp/compras/${nota.id}`);
  const opcoes = await dadosDoFormularioDeNota(ctx.cliente, ctx.alcance, {
    lojaId: nota.lojaId,
    fornecedorId: nota.fornecedor?.id,
    insumoIds: nota.itens.map((i) => i.insumoId ?? '').filter(Boolean),
  });
  return (
    <TelaFormNota
      nota={nota}
      base="/erp/compras"
      contexto={nota.loja}
      opcoes={opcoes}
      acao={acaoSalvarNota.bind(null, nota.id)}
      bloqueio={ctx.bloqueio}
      periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, '/erp')}
      novoFornecedor={pode(ctx.alcance, 'fornecedores.editar') ? '/erp/compras/fornecedores/novo' : undefined}
    />
  );
}
