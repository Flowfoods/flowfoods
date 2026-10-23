/** ERP do parceiro — uma embalagem aberta (3.4): "imprimir etiquetas" NA loja (de outra loja ou parceiro, 404). */

import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { aberturaParaEtiqueta } from '@/lib/erp/etiquetas';
import { TelaEmbalagemAberta } from '@/components/erp/telas/etiquetas/aberta';
import { fraseDasEtiquetas } from '@/components/erp/telas/etiquetas/estado';
import { acaoEmitirDaAbertura } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEmbalagemAbertaPage({ params, searchParams }: { params: { lojaId: string; aberturaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'etiquetas.imprimir');
  const d = await aberturaParaEtiqueta(ctx.cliente, ctx.alcance, params.lojaId, params.aberturaId);
  if (!d) notFound();
  return <TelaEmbalagemAberta d={d} base="/erp/etiquetas" feito={fraseDasEtiquetas(searchParams.feito)} acao={acaoEmitirDaAbertura.bind(null, d.loja.id, d.abertura.id)} envio={`env-${randomUUID()}`} bloqueio={ctx.bloqueio} />;
}
