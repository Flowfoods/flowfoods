/** ERP do parceiro — Etiquetas (3.4), a aba Abrir embalagem: uma loja no acesso vai direto; mais de uma, a escolha. */

import { redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { lojasDasEtiquetas } from '@/lib/erp/etiquetas';
import { TelaLojasDasEtiquetas } from '@/components/erp/telas/etiquetas/partes';

export const dynamic = 'force-dynamic';

export default async function ErpAbrirEmbalagemPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'etiquetas.imprimir');
  const lojas = await lojasDasEtiquetas(ctx.cliente, ctx.alcance);
  if (lojas.length === 1) redirect(`/erp/etiquetas/${lojas[0].id}/abrir`);
  return <TelaLojasDasEtiquetas qual="abrir" lojas={lojas} base="/erp/etiquetas" />;
}
