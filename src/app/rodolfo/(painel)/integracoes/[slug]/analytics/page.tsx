/** Mesmo painel de leitura, pelo contexto autenticado do parceiro no nível 1. */
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';
import { lerPainelAnalytics } from '@/lib/integracoes/core/painel-analytics';
import { PainelAnalytics } from '@/components/erp/telas/integracoes/painel-analytics';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Voltar } from '@/components/erp/telas/cadastro/partes';

export const dynamic = 'force-dynamic';

export default async function PainelAnalyticsNoNivel1(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await props.params;
  const ctx = await exigirParceiro(slug);
  exigirPermissao(ctx, 'integracao.ver');
  exigirPermissao(ctx, 'faturamento.ver');
  const filtro = (await props.searchParams) ?? {};
  const resultado = await lerPainelAnalytics(ctx.cliente, ctx.alcance,
    { parceiroId: ctx.parceiro.id, homologacaoDeIntegracao: ctx.parceiro.homologacaoDeIntegracao },
    { lojaId: filtro.loja, inicio: filtro.inicio, fim: filtro.fim, merchants: filtro.merchant });
  const central = `/rodolfo/integracoes/${encodeURIComponent(ctx.parceiro.slug)}`;
  return <div className="space-y-6">
    <Voltar href={central}>Voltar para Integrações</Voltar>
    <PageHeader icone="canais" cor={COR.parceiros} titulo={`Painel iFood · ${ctx.parceiro.nome}`} subtitulo="Números de venda por loja e período" />
    <PainelAnalytics resultado={resultado} base={`${central}/analytics`} baseSituacao={central} teste={ctx.parceiro.homologacaoDeIntegracao} />
  </div>;
}
