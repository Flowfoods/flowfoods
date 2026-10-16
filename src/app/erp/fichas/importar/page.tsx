/** ERP do parceiro — Importar fichas por planilha. Só com "criar e editar fichas técnicas" (as actions conferem de novo). */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { TelaImportar } from '@/components/erp/telas/fichas/paginas';
import { acaoImportarPlanilha, acaoPreviaDaPlanilha } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpImportarFichasPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  return (
    <TelaImportar
      base="/erp/fichas"
      contexto={ctx.parceiro.nome}
      acaoPrevia={acaoPreviaDaPlanilha}
      acaoImportar={acaoImportarPlanilha}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
      bloqueio={ctx.bloqueio}
    />
  );
}
