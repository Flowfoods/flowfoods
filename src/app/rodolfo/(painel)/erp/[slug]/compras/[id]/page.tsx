/** ERP, detalhe de uma nota de compra de um Parceiro Flow, pelo nível 1 (lida pelo portão deste parceiro). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterNota } from '@/lib/erp/compras';
import { lerFiltrosDeNota, queryDosFiltrosDeNota } from '@/lib/erp/compra-campos';
import { caminhoDeVolta, rotuloDaVolta } from '@/lib/erp/volta';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { orcamentoDaNotaLancada } from '@/lib/erp/orcamento';
import { TelaDetalheNota } from '@/components/erp/telas/compras/detalhe-nota';
import { acaoCancelarNota } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNotaPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams: { de?: string; feito?: string; volta?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const nota = await obterNota(ctx.cliente, ctx.alcance, params.id);
  if (!nota) notFound();
  const de = queryDosFiltrosDeNota(lerFiltrosDeNota(Object.fromEntries(new URLSearchParams(searchParams.de ?? ''))));
  // L.2: veio de um relatório de compras? Volta para ele, com o recorte que estava (só caminho interno da área: nunca endereço de fora).
  const dosRelatorios = caminhoDeVolta(searchParams.volta, `${base}/`, 2000);
  return (
    <TelaDetalheNota
      nota={nota}
      base={`${base}/compras`}
      voltar={dosRelatorios ?? (de ? `${base}/compras?${de}` : `${base}/compras`)}
      voltarRotulo={dosRelatorios ? rotuloDaVolta(dosRelatorios) : undefined}
      feito={searchParams.feito}
      contexto={ctx.parceiro.nome}
      podeLancar
      bloqueio={ctx.bloqueio}
      insumosBase={`${base}/insumos`}
      fornecedoresBase={`${base}/compras/fornecedores`}
      estoqueBase={`${base}/estoque`}
      acaoCancelar={acaoCancelarNota.bind(null, ctx.parceiro.slug, nota.id)}
      periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, `/rodolfo/erp/${ctx.parceiro.slug}`)}
      orcamento={await orcamentoDaNotaLancada(ctx.cliente, ctx.alcance, nota)}
      orcamentoHref={`${base}/compras/orcamento`}
      lotesHref={`${base}/compras/${nota.id}/lotes`}
      documentoHref={nota.documentoId ? `${base}/compras/recebidas/${nota.documentoId}?volta=${encodeURIComponent(`${base}/compras/${nota.id}${dosRelatorios ? `?volta=${encodeURIComponent(dosRelatorios)}` : ''}`)}` : undefined}
    />
  );
}
