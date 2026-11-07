/** Painel Analytics: leitura persistida, com permissões de integração e faturamento. */
import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { COR } from '@/lib/erp/modulos';
import { lerPainelAnalytics } from '@/lib/integracoes/core/painel-analytics';
import { PainelAnalytics } from '@/components/erp/telas/integracoes/painel-analytics';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Voltar } from '@/components/erp/telas/cadastro/partes';

export const dynamic = 'force-dynamic';

export default async function ErpPainelAnalyticsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'integracao.ver');
  exigirPermissaoNaPagina(ctx, 'faturamento.ver');
  if (!await moduloLiberado(ctx.cliente, 'integracao')) redirect('/erp?sem-modulo=integracao');
  const filtro = (await props.searchParams) ?? {};
  const resultado = await lerPainelAnalytics(ctx.cliente, ctx.alcance,
    { parceiroId: ctx.parceiro.id, homologacaoDeIntegracao: ctx.parceiro.homologacaoDeIntegracao },
    { lojaId: filtro.loja, inicio: filtro.inicio, fim: filtro.fim, merchants: filtro.merchant });
  return <div className="space-y-6">
    <Voltar href="/erp/integracoes">Voltar para Integrações</Voltar>
    <PageHeader icone="canais" cor={COR.rede} titulo="Painel iFood" subtitulo="Números de venda por loja e período" />
    <PainelAnalytics resultado={resultado} base="/erp/integracoes/analytics" baseSituacao="/erp/integracoes" teste={ctx.parceiro.homologacaoDeIntegracao} />
  </div>;
}
