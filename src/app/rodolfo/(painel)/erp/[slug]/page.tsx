/**
 * ERP — um Parceiro Flow visto pelo nível 1: o MESMO hub "Áreas da Rede" da
 * pessoa do parceiro, com o alcance do nível 1 (tudo) e as telas sob
 * /rodolfo/erp/<slug>. O parceiro vem de `exigirParceiro` (sessão + slug); a
 * URL só escolhe, o portão isola.
 */

import { exigirParceiro } from '@/lib/erp/contexto';
import { modulosDoParceiro } from '@/lib/erp/modulos';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { HubDoParceiro } from '@/components/erp/telas/hub-do-parceiro';
import { painelDoDia } from '@/lib/erp/painel-do-dia';

export const dynamic = 'force-dynamic';

export default async function HubDoParceiroNoNivel1({ params }: { params: { slug: string } }) {
  const { parceiro, alcance, cliente } = await exigirParceiro(params.slug);
  const painel = await painelDoDia(cliente, alcance, `/rodolfo/erp/${parceiro.slug}`);
  return (
    <HubDoParceiro
      titulo={parceiro.nome}
      subtitulo={`Parceiro Flow · ${STATUS_DO_PARCEIRO[parceiro.status].rotulo} · visto pelo nível 1`}
      modulos={modulosDoParceiro(alcance, `/rodolfo/erp/${parceiro.slug}`)}
      semAcesso={false}
      painel={painel}
    />
  );
}
