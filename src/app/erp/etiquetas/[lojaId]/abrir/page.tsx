/**
 * ERP do parceiro — abrir uma embalagem numa loja (3.4): "imprimir etiquetas" NA loja (fora do acesso ou de outro parceiro,
 * 404). O insumo vem da URL (`?insumo=`, só escolhe: a regra confere de novo). Nota e fornecedor do lote só para quem vê compras.
 */

import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { opcoesDeAbertura } from '@/lib/erp/etiquetas';
import { TelaAbrirEmbalagem } from '@/components/erp/telas/etiquetas/abrir';
import { acaoAbrirEmbalagem } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpAbrirEmbalagemDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { insumo?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'etiquetas.imprimir');
  const d = await opcoesDeAbertura(ctx.cliente, ctx.alcance, params.lojaId, searchParams.insumo);
  if (!d) notFound();
  return <TelaAbrirEmbalagem d={d} base="/erp/etiquetas" acao={acaoAbrirEmbalagem.bind(null, d.loja.id)} envio={`env-${randomUUID()}`} podeAbrir motivoSemAbrir={null} bloqueio={ctx.bloqueio} />;
}
