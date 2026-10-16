/** ERP do parceiro — Novo insumo. Só com "cadastrar e editar insumos" (a action confere de novo). */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { TelaFormInsumo } from '@/components/erp/telas/insumos/paginas';
import { acaoCadastrarInsumo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovoInsumoPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.editar');
  return <TelaFormInsumo base="/erp/insumos" contexto={ctx.parceiro.nome} acao={acaoCadastrarInsumo} bloqueio={ctx.bloqueio} />;
}
