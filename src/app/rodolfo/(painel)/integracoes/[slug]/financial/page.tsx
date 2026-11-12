import { TelaConferenciaFinancial } from '@/components/erp/telas/integracoes/tela-conferencia-financial';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';

export const dynamic = 'force-dynamic';

export default async function ConferenciaFinancialNoNivel1(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await props.params;
  const ctx = await exigirParceiro(slug);
  exigirPermissao(ctx, 'integracao.ver');
  exigirPermissao(ctx, 'faturamento.ver');
  const central = `/rodolfo/integracoes/${encodeURIComponent(ctx.parceiro.slug)}`;
  return <TelaConferenciaFinancial ctx={ctx} central={central} busca={await props.searchParams}
    permitirEnvio={ctx.podeEscrever && !ctx.bloqueio && ctx.parceiro.status === 'ATIVO'} />;
}
