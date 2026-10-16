/**
 * ERP do parceiro — Insumos. A mesma tela do nível 1, com o cliente do portão
 * resolvido pela SESSÃO da pessoa (`exigirParceiroDaSessao`). Ver exige
 * "ver insumos"; o cadastro só aparece com "cadastrar e editar insumos" (e a
 * action recusa do mesmo jeito, venha de onde vier).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { TelaInsumos } from '@/app/rodolfo/erp/tela-insumos';
import { FormInsumo } from '@/app/rodolfo/erp/[slug]/form-insumo';
import { acaoCadastrarInsumoDaSessao } from './actions';

export const dynamic = 'force-dynamic';

export default async function ErpInsumosPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.ver');
  return (
    <TelaInsumos
      cliente={ctx.cliente}
      bloqueio={ctx.bloqueio}
      formulario={pode(ctx.alcance, 'insumos.editar') ? <FormInsumo acao={acaoCadastrarInsumoDaSessao} /> : undefined}
    />
  );
}
