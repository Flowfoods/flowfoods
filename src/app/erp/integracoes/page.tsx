/**
 * ERP do parceiro — Integrações (INT-1.8, segunda parte; decisão 491). Só leitura: as lojas do iFood ligadas às lojas do
 * alcance da pessoa (o filtro vai na consulta) e o estado de cada módulo. Precisa da permissão `integracao.ver` e do módulo
 * Integração liberado para o parceiro; sem a permissão, volta para a primeira tela permitida; sem o módulo, para o hub, com o
 * aviso de que quem libera é a FlowFoods.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { pode } from '@/lib/erp/permissoes';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { COR } from '@/lib/erp/modulos';
import { integracoesParaOParceiro } from '@/lib/integracoes/core/do-parceiro';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { TelaIntegracoes } from '@/components/erp/telas/integracoes/tela-integracoes';
import { PainelSituacaoAnalytics } from '@/components/erp/telas/integracoes/painel-situacao-analytics';
import { lerSituacaoAnalyticsDaLoja } from '@/lib/integracoes/core/situacao-analytics';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';

export const dynamic = 'force-dynamic';

export default async function ErpIntegracoesPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'integracao.ver');
  // Módulo não liberado: o hub diz que é a FlowFoods quem libera (não "quem cuida da equipe").
  if (!(await moduloLiberado(ctx.cliente, 'integracao'))) redirect('/erp?sem-modulo=integracao');
  const filtro = (await props.searchParams) ?? {};
  const [integracoes, resultado] = await Promise.all([
    integracoesParaOParceiro(ctx.cliente, ctx.alcance),
    lerSituacaoAnalyticsDaLoja(ctx.cliente, ctx.alcance,
      { parceiroId: ctx.parceiro.id, homologacaoDeIntegracao: ctx.parceiro.homologacaoDeIntegracao },
      { lojaId: filtro.loja, dia: filtro.dia }),
  ]);
  const lojaDaConsulta = resultado.ok ? resultado.situacao?.loja.id : undefined;
  const vePainel = pode(ctx.alcance, 'faturamento.ver', lojaDaConsulta ? { lojaId: lojaDaConsulta } : undefined);
  const painelHref = `/erp/integracoes/analytics${lojaDaConsulta ? `?loja=${encodeURIComponent(lojaDaConsulta)}` : ''}`;
  return (
    <div className="space-y-6">
      <PageHeader
        icone="canais"
        cor={COR.rede}
        titulo="Integrações"
        subtitulo={`${ctx.alcance.lojas === 'todas' ? 'Rede Completa' : 'Suas lojas'} · ${integracoes.length} ${integracoes.length === 1 ? 'loja do iFood ligada' : 'lojas do iFood ligadas'}`}
      />
      {vePainel && <Link href={painelHref} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Ver painel iFood por período</Link>}
      <TelaIntegracoes integracoes={integracoes} painel={<PainelSituacaoAnalytics resultado={resultado} teste={ctx.parceiro.homologacaoDeIntegracao} base="/erp/integracoes" baseFaturamento="/erp/faturamento" />} />
    </div>
  );
}
