/** ERP, importar fichas por planilha num parceiro, pelo nível 1. */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { TelaImportar } from '@/components/erp/telas/fichas/paginas';
import { acaoImportarPlanilha, acaoPreviaDaPlanilha } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroImportarFichasPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <TelaImportar
      base={`${base}/fichas`}
      contexto={ctx.parceiro.nome}
      acaoPrevia={acaoPreviaDaPlanilha.bind(null, ctx.parceiro.slug)}
      acaoImportar={acaoImportarPlanilha.bind(null, ctx.parceiro.slug)}
      novoInsumo={`${base}/insumos/novo`}
      bloqueio={ctx.bloqueio}
    />
  );
}
