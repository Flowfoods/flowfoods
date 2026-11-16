/**
 * Situação do parceiro (suspenso ou em implantação): o aviso do topo de todas as telas do parceiro no nível 1. O mesmo
 * aviso aparece dentro da janela de módulo (UX-MOD-2), porque as telas contam com ele (Lojas e marcas esconde o campo de
 * loja nova e remete a este aviso).
 */

import type { ParceiroStatus } from '@prisma/client';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { Aviso } from '../ui/superficies';

/** `bloqueio`: o de `exigirParceiro` (texto quando a escrita está bloqueada; `null` quando não está). */
export function AvisoDoParceiro({ status, bloqueio }: { status: ParceiroStatus; bloqueio: string | null }) {
  if (!bloqueio) return null;
  return (
    <Aviso tom={status === 'SUSPENSO' ? 'erro' : 'alerta'} titulo={`${STATUS_DO_PARCEIRO[status].rotulo}.`}>
      {status === 'SUSPENSO'
        ? 'Insumos, fichas técnicas, lojas e marcas ficam bloqueados até reativar. O nome do parceiro ainda pode ser corrigido em Cadastro do parceiro.'
        : 'Insumos, fichas técnicas, lojas e marcas abrem quando o parceiro for ativado em Cadastro do parceiro.'}
    </Aviso>
  );
}
