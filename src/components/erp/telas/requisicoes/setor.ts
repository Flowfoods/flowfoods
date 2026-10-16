import type { Setor } from '@/lib/erp/permissoes';

/** O setor que já vem marcado no pedido: o da pessoa (a cozinha primeiro); sem setor, nenhum. Não concede nada. */
export function setorDoPedido(setores: readonly Setor[] | undefined): Setor | null {
  if (!setores?.length) return null;
  return setores.includes('COZINHA') ? 'COZINHA' : setores[0];
}
