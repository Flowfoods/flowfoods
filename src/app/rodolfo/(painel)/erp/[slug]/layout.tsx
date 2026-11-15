/**
 * ERP — espaço de um Parceiro Flow (nível 1). O menu do parceiro mora no
 * shell (módulo Parceiros Flow); aqui fica só o aviso de situação, comum a
 * todas as telas do parceiro. `exigirParceiro` resolve sessão + slug (slug
 * desconhecido é 404); a URL só escolhe, o portão isola.
 *
 * `janela` (UX-MOD-2, piloto de 15/11/2026): o espaço da janela de módulo. Navegar dentro do parceiro para Lojas e marcas,
 * Equipe ou Histórico abre a tela numa janela por cima desta página (`@janela`); em qualquer outro caso fica vazio.
 */

import { exigirParceiro } from '@/lib/erp/contexto';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { Aviso } from '@/components/erp/ui/superficies';

export const dynamic = 'force-dynamic';

export default async function ParceiroLayout(
  props: {
    children: React.ReactNode;
    janela: React.ReactNode;
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;

  const {
    children,
    janela
  } = props;

  const { parceiro, bloqueio } = await exigirParceiro(params.slug);
  const status = STATUS_DO_PARCEIRO[parceiro.status];

  // A janela fica FORA da pilha `space-y-6`: a margem entre irmãos a deslocaria (o diálogo é posicionado pela tela).
  return (
    <>
    <div className="space-y-6">
      {bloqueio && (
        <Aviso tom={parceiro.status === 'SUSPENSO' ? 'erro' : 'alerta'} titulo={`${status.rotulo}.`}>
          {parceiro.status === 'SUSPENSO'
            ? 'Insumos, fichas técnicas, lojas e marcas ficam bloqueados até reativar. O nome do parceiro ainda pode ser corrigido em Cadastro do parceiro.'
            : 'Insumos, fichas técnicas, lojas e marcas abrem quando o parceiro for ativado em Cadastro do parceiro.'}
        </Aviso>
      )}
      {children}
    </div>
    {janela}
    </>
  );
}
