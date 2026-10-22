/**
 * ERP, Notas recebidas por XML de um Parceiro Flow, pelo nível 1. A MESMA tela da pessoa do parceiro; tudo passa pelo cliente de
 * `exigirParceiro` (portão + RLS). O nível 1 alcança todas as lojas; a visão do topo filtra.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarDocumentos, opcoesDosFiltrosDeDocumento } from '@/lib/erp/documentos-fiscais';
import { lerFiltrosDeDocumento, temFiltroDeDocumento } from '@/lib/erp/documento-fiscal-campos';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { CabecalhoDosDocumentos, FiltrosDosDocumentos, subtituloDosDocumentos, TelaListaDocumentos } from '@/components/erp/telas/compras/lista-documentos';

export const dynamic = 'force-dynamic';

export default async function ParceiroNotasRecebidasPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/compras/recebidas`;
  const { visao } = await visaoDaRequisicao(ctx);
  const lidos = lerFiltrosDeDocumento(searchParams);
  const filtros = !lidos.lojaId && visao.tipo === 'loja' ? { ...lidos, lojaId: visao.lojaId } : lidos;
  const [pagina, opcoes] = await Promise.all([listarDocumentos(ctx.cliente, ctx.alcance, filtros), opcoesDosFiltrosDeDocumento(ctx.cliente, ctx.alcance)]);
  return (
    <div className="space-y-6">
      <CabecalhoDosDocumentos subtitulo={`${ctx.parceiro.nome} · ${subtituloDosDocumentos(rotuloDaVisao(visao), filtros, pagina.total, pagina.naFila)}`} importarHref={`${base}/importar`} bloqueio={ctx.bloqueio}>
        <FiltrosDosDocumentos filtrado={temFiltroDeDocumento(lidos)} base={base} filtros={filtros} lojas={opcoes.lojas} fornecedores={opcoes.fornecedores} />
      </CabecalhoDosDocumentos>
      <TelaListaDocumentos
        filtrado={temFiltroDeDocumento(lidos)}
        base={base}
        filtros={filtros}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={pagina.pagina}
        paginas={pagina.paginas}
        importarHref={ctx.bloqueio ? undefined : `${base}/importar`}
      />
    </div>
  );
}
