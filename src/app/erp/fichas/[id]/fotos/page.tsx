/**
 * ERP do parceiro — Fotos da ficha (F4): a principal e as de apoio. Exige "criar e editar fichas técnicas"; a action
 * confere de novo. O id da URL só ESCOLHE: a leitura passa pelo cliente do portão da sessão (de outro parceiro, 404).
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { obterFotosDaFicha } from '@/lib/erp/ficha-fotos';
import { PaginaFotosDaFicha } from '@/components/erp/telas/fichas/pagina-fotos';
import { acaoFotosDaFicha } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpFotosDaFichaPage({ params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  const fotos = await obterFotosDaFicha(ctx.cliente, params.id);
  if (!fotos) notFound();
  return <PaginaFotosDaFicha fotos={fotos} base="/erp/fichas" contexto={ctx.parceiro.nome} bloqueio={ctx.bloqueio} acao={acaoFotosDaFicha.bind(null, fotos.id)} />;
}
