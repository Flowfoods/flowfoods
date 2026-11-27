import { redirect } from 'next/navigation';
import { TelaConsultoriaDelivery } from '@/components/erp/telas/consultoria-delivery';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lerConsultoriaDelivery } from '@/lib/integracoes/core/consultoria-delivery';

export const dynamic = 'force-dynamic';

export default async function ConsultoriaNoERP(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'consultoria.ver');
  const filtros = await props.searchParams;
  const resultado = await lerConsultoriaDelivery(ctx.cliente, ctx.alcance,
    { parceiroId: ctx.parceiro.id, homologacaoDeIntegracao: ctx.parceiro.homologacaoDeIntegracao },
    { lojaId: filtros?.loja, fonteId: filtros?.fonte });
  if (!resultado.ok && resultado.motivo === 'bloqueada') redirect('/erp?sem-modulo=consultoria-de-delivery');
  return <TelaConsultoriaDelivery resultado={resultado} base="/erp/consultoria-delivery" inicio="/erp" teste={ctx.parceiro.homologacaoDeIntegracao} />;
}
