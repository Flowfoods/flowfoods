/**
 * ERP do parceiro — Integrações (INT-1.8, segunda parte; decisão 491). Só leitura: as lojas do iFood ligadas às lojas do
 * alcance da pessoa (o filtro vai na consulta) e o estado de cada módulo. Precisa da permissão `integracao.ver` e do módulo
 * Integração liberado para o parceiro; sem um dos dois, volta para a primeira tela permitida, com aviso.
 */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, telasPermitidas } from '@/lib/erp/contexto';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { COR } from '@/lib/erp/modulos';
import { integracoesParaOParceiro } from '@/lib/integracoes/core/do-parceiro';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { TelaIntegracoes } from '@/components/erp/telas/integracoes/tela-integracoes';

export const dynamic = 'force-dynamic';

export default async function ErpIntegracoesPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'integracao.ver');
  if (!(await moduloLiberado(ctx.cliente, 'integracao'))) redirect(`${telasPermitidas(ctx.alcance)[0].href}?sem-acesso=1`);
  const integracoes = await integracoesParaOParceiro(ctx.cliente, ctx.alcance);
  return (
    <div className="space-y-6">
      <PageHeader
        icone="canais"
        cor={COR.rede}
        titulo="Integrações"
        subtitulo={`${ctx.alcance.lojas === 'todas' ? 'Rede Completa' : 'Suas lojas'} · ${integracoes.length} ${integracoes.length === 1 ? 'loja do iFood ligada' : 'lojas do iFood ligadas'}`}
      />
      <TelaIntegracoes integracoes={integracoes} />
    </div>
  );
}
