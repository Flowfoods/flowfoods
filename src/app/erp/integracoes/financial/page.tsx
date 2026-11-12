import { redirect } from 'next/navigation';
import { TelaConferenciaFinancial } from '@/components/erp/telas/integracoes/tela-conferencia-financial';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { moduloLiberado } from '@/lib/erp/liberacao';

export const dynamic = 'force-dynamic';

export default async function ConferenciaFinancialDoParceiro(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'integracao.ver');
  exigirPermissaoNaPagina(ctx, 'faturamento.ver');
  if (!await moduloLiberado(ctx.cliente, 'integracao')) redirect('/erp?sem-modulo=integracao');
  return <TelaConferenciaFinancial ctx={ctx} central="/erp/integracoes" busca={await props.searchParams} />;
}
