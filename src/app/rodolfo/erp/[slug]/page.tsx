/**
 * ERP — espaço de um Parceiro Flow: Insumos. Tudo o que esta tela lê passa pelo
 * cliente de `exigirParceiro` (portão de tenant + RLS); trocar de parceiro é
 * trocar de URL, e a URL só escolhe — o isolamento é o portão.
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { TelaInsumos } from '../tela-insumos';
import { acaoCadastrarInsumo } from './actions';
import { FormInsumo } from './form-insumo';

export const dynamic = 'force-dynamic';

export default async function ParceiroInsumosPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.ver');
  const { parceiro, cliente, bloqueio } = ctx;
  return (
    <TelaInsumos
      cliente={cliente}
      bloqueio={bloqueio}
      formulario={<FormInsumo acao={acaoCadastrarInsumo.bind(null, parceiro.slug)} />}
    />
  );
}
