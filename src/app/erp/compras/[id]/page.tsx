/**
 * ERP do parceiro — detalhe da nota. O id da URL só ESCOLHE: a leitura passa
 * pelo portão da sessão e pelas lojas do alcance, então nota de outro
 * parceiro ou de loja fora do acesso é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterNota } from '@/lib/erp/compras';
import { lerFiltrosDeNota, queryDosFiltrosDeNota } from '@/lib/erp/compra-campos';
import { caminhoDeVolta, rotuloDaVolta } from '@/lib/erp/volta';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { orcamentoDaNotaLancada } from '@/lib/erp/orcamento';
import { TelaDetalheNota } from '@/components/erp/telas/compras/detalhe-nota';
import { acaoCancelarNota } from '../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/compras';

export default async function ErpNotaPage({ params, searchParams }: { params: { id: string }; searchParams: { de?: string; feito?: string; volta?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  const nota = await obterNota(ctx.cliente, ctx.alcance, params.id);
  if (!nota) notFound();
  const de = queryDosFiltrosDeNota(lerFiltrosDeNota(Object.fromEntries(new URLSearchParams(searchParams.de ?? ''))));
  // L.2: veio de um relatório de compras? Volta para ele, com o recorte que estava (só caminho interno da área: nunca endereço de fora).
  const dosRelatorios = caminhoDeVolta(searchParams.volta, '/erp/', 2000);
  return (
    <TelaDetalheNota
      nota={nota}
      base={BASE}
      voltar={dosRelatorios ?? (de ? `${BASE}?${de}` : BASE)}
      voltarRotulo={dosRelatorios ? rotuloDaVolta(dosRelatorios) : undefined}
      feito={searchParams.feito}
      podeLancar={pode(ctx.alcance, 'compras.lancar', { lojaId: nota.lojaId })}
      bloqueio={ctx.bloqueio}
      insumosBase={pode(ctx.alcance, 'insumos.ver') ? '/erp/insumos' : undefined}
      fornecedoresBase={`${BASE}/fornecedores`}
      estoqueBase={pode(ctx.alcance, 'estoque.ver', { lojaId: nota.lojaId }) ? '/erp/estoque' : undefined}
      acaoCancelar={acaoCancelarNota.bind(null, nota.id)}
      periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, '/erp')}
      orcamento={await orcamentoDaNotaLancada(ctx.cliente, ctx.alcance, nota)}
      orcamentoHref={`${BASE}/orcamento`}
      lotesHref={`${BASE}/${nota.id}/lotes`}
      documentoHref={nota.documentoId ? `${BASE}/recebidas/${nota.documentoId}?volta=${encodeURIComponent(`${BASE}/${nota.id}${dosRelatorios ? `?volta=${encodeURIComponent(dosRelatorios)}` : ''}`)}` : undefined}
    />
  );
}
