/**
 * ERP do parceiro — Insumos. A mesma tela do nível 1, com o cliente do portão
 * resolvido pela SESSÃO da pessoa (`exigirParceiroDaSessao`).
 */

import { exigirParceiroDaSessao } from '@/lib/erp/contexto';
import { TelaInsumos } from '@/app/rodolfo/erp/tela-insumos';
import { FormInsumo } from '@/app/rodolfo/erp/[slug]/form-insumo';
import { acaoCadastrarInsumoDaSessao } from './actions';

export const dynamic = 'force-dynamic';

export default async function ErpInsumosPage() {
  const { cliente, bloqueio } = await exigirParceiroDaSessao();
  return <TelaInsumos cliente={cliente} bloqueio={bloqueio} formulario={<FormInsumo acao={acaoCadastrarInsumoDaSessao} />} />;
}
