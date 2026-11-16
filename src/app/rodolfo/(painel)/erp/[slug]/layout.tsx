/**
 * ERP — espaço de um Parceiro Flow (nível 1). O menu do parceiro mora no
 * shell (módulo Parceiros Flow); aqui fica só o aviso de situação, comum a
 * todas as telas do parceiro. `exigirParceiro` resolve sessão + slug (slug
 * desconhecido é 404); a URL só escolhe, o portão isola.
 *
 * `janela` (UX-MOD-2, piloto de 15/11/2026): o espaço da janela de módulo. Navegar dentro do parceiro para Lojas e marcas,
 * Equipe ou Histórico abre a tela numa janela por cima desta página (`@janela`); em qualquer outro caso fica vazio. A
 * moldura decide quando a janela não abre (a página de trás já é uma dessas telas, ou o destino é de outro parceiro).
 */

import { exigirParceiro } from '@/lib/erp/contexto';
import { AvisoDoParceiro } from '@/components/erp/shell/aviso-do-parceiro';
import { MolduraDaJanela } from '@/components/erp/shell/MolduraDaJanela';

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

  // A janela fica FORA da pilha `space-y-6`: a margem entre irmãos a deslocaria (o diálogo é posicionado pela tela).
  return (
    <>
    <div className="space-y-6">
      <AvisoDoParceiro status={parceiro.status} bloqueio={bloqueio} />
      {children}
    </div>
    <MolduraDaJanela base={`/rodolfo/erp/${parceiro.slug}`}>{janela}</MolduraDaJanela>
    </>
  );
}
