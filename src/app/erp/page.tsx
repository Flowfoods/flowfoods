/**
 * ERP do parceiro — hub "Áreas da Rede", a tela de entrada. Livre (só a
 * sessão): mostra só o que `modulosDoParceiro` libera (permissão e módulos liberados), e é para cá
 * que `exigirPermissaoNaPagina` manda quem abre uma tela fora do acesso.
 */

import { exigirParceiroDaSessao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { modulosLiberados } from '@/lib/erp/liberacao';
import { modulosDoParceiro } from '@/lib/erp/modulos';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { HubDoParceiro } from '@/components/erp/telas/hub-do-parceiro';
import { painelDoDia } from '@/lib/erp/painel-do-dia';

export const dynamic = 'force-dynamic';

export default async function HubDaRede({ searchParams }: { searchParams: { 'sem-acesso'?: string; 'sem-modulo'?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  const [{ visao }, liberados] = await Promise.all([visaoDaRequisicao(ctx), modulosLiberados(ctx.cliente)]);
  const painel = await painelDoDia(ctx.cliente, ctx.alcance, '/erp', undefined, visao);
  return (
    <HubDoParceiro
      titulo="Áreas da Rede"
      subtitulo={`${ctx.parceiro.nome} · ${rotuloDaVisao(visao)} · ${ctx.pessoa.perfilRotulo ?? 'acesso próprio'}`}
      modulos={modulosDoParceiro(ctx.alcance, '/erp', liberados)}
      semAcesso={Boolean(searchParams['sem-acesso'])}
      semModulo={searchParams['sem-modulo'] === 'integracao'}
      painel={painel}
    />
  );
}
