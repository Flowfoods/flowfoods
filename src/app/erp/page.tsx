/**
 * ERP do parceiro — hub "Módulos da Rede", a tela de entrada. Livre (só a
 * sessão): mostra só o que `modulosDoParceiro(alcance)` libera, e é para cá
 * que `exigirPermissaoNaPagina` manda quem abre uma tela fora do acesso.
 */

import { exigirParceiroDaSessao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { modulosDoParceiro } from '@/lib/erp/modulos';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { HubDoParceiro } from '@/components/erp/telas/hub-do-parceiro';

export const dynamic = 'force-dynamic';

export default async function HubDaRede({ searchParams }: { searchParams: { 'sem-acesso'?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  const { visao } = await visaoDaRequisicao(ctx);
  return (
    <HubDoParceiro
      titulo="Módulos da Rede"
      subtitulo={`${ctx.parceiro.nome} · ${rotuloDaVisao(visao)} · ${ctx.pessoa.perfilRotulo ?? 'acesso próprio'}`}
      modulos={modulosDoParceiro(ctx.alcance)}
      semAcesso={Boolean(searchParams['sem-acesso'])}
    />
  );
}
