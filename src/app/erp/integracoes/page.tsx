/**
 * Central de Integrações do parceiro (INT-1.8 e P-03). A permissão `integracao.ver` dá acesso à Central.
 * A liberação do módulo também é exigida para consultar fontes e leituras das lojas do alcance da pessoa.
 */

import Link from 'next/link';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { pode } from '@/lib/erp/permissoes';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { COR } from '@/lib/erp/modulos';
import { capacidadesIfoodPorLoja, integracoesParaOParceiro } from '@/lib/integracoes/core/do-parceiro';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { CentralIntegracoesInformativa, TelaIntegracoes } from '@/components/erp/telas/integracoes/tela-integracoes';
import { PainelSituacaoAnalytics } from '@/components/erp/telas/integracoes/painel-situacao-analytics';
import { lerSituacaoAnalyticsDaLoja } from '@/lib/integracoes/core/situacao-analytics';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso } from '@/components/erp/ui/superficies';

export const dynamic = 'force-dynamic';

export default async function ErpIntegracoesPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'integracao.ver');
  const filtro = (await props.searchParams) ?? {};
  const escopo = ctx.alcance.lojas === 'todas' ? 'Rede Completa' : 'Suas lojas';
  if (!(await moduloLiberado(ctx.cliente, 'integracao'))) {
    const lojaId = typeof filtro.loja === 'string' ? filtro.loja.trim() : '';
    const lojaDisponivel = filtro.loja === undefined || filtro.loja === '' || (
      lojaId.length > 0 && lojaId.length <= 128 && pode(ctx.alcance, 'integracao.ver', { lojaId }) &&
      !!await ctx.cliente.loja.findFirst({ where: { id: lojaId }, select: { id: true } })
    );
    return (
      <div className="space-y-6">
        <PageHeader icone="canais" cor={COR.integracao} titulo="Integrações" subtitulo={escopo} />
        {lojaDisponivel ? <CentralIntegracoesInformativa /> : <Aviso titulo="Esta loja não está disponível no seu acesso." />}
      </div>
    );
  }

  const ambiente = ctx.parceiro.homologacaoDeIntegracao ? 'TEST' : 'PRODUCAO';
  const [integracoes, resultado, capacidades] = await Promise.all([
    integracoesParaOParceiro(ctx.cliente, ctx.alcance),
    lerSituacaoAnalyticsDaLoja(ctx.cliente, ctx.alcance,
      { parceiroId: ctx.parceiro.id, homologacaoDeIntegracao: ctx.parceiro.homologacaoDeIntegracao },
      { lojaId: filtro.loja, dia: filtro.dia }),
    capacidadesIfoodPorLoja(ctx.cliente, ctx.alcance, ambiente, filtro.loja),
  ]);
  const lojaDaConsulta = resultado.ok ? resultado.situacao?.loja.id : undefined;
  const vePainel = pode(ctx.alcance, 'faturamento.ver', lojaDaConsulta ? { lojaId: lojaDaConsulta } : undefined);
  const painelHref = `/erp/integracoes/analytics${lojaDaConsulta ? `?loja=${encodeURIComponent(lojaDaConsulta)}` : ''}`;
  return (
    <div className="space-y-6">
      <PageHeader
        icone="canais"
        cor={COR.integracao}
        titulo="Integrações"
        subtitulo={`${escopo} · ${integracoes.length} ${integracoes.length === 1 ? 'loja do iFood ligada' : 'lojas do iFood ligadas'}`}
      />
      {vePainel && <nav aria-label="Conferências iFood" className="flex flex-wrap gap-x-6">
        <Link href={painelHref} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Ver painel iFood por período</Link>
        <Link href={`/erp/integracoes/financial${lojaDaConsulta ? `?loja=${encodeURIComponent(lojaDaConsulta)}` : ''}`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Conferir financeiro do iFood</Link>
      </nav>}
      <TelaIntegracoes integracoes={integracoes} capacidades={capacidades}
        painel={<PainelSituacaoAnalytics resultado={resultado} teste={ctx.parceiro.homologacaoDeIntegracao} base="/erp/integracoes" baseFaturamento="/erp/faturamento" />} />
    </div>
  );
}
