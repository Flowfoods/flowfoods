/**
 * ERP do parceiro — Notas recebidas por XML (a fila). A MESMA tela do nível 1, com o cliente do portão resolvido pela SESSÃO. Ver exige
 * "ver compras e notas"; a lista só traz as lojas do alcance (a loja escolhida no topo filtra, nunca concede). "Importar XML" só com
 * "lançar nota de compra".
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarDocumentos, opcoesDosFiltrosDeDocumento } from '@/lib/erp/documentos-fiscais';
import { lerFiltrosDeDocumento, temFiltroDeDocumento } from '@/lib/erp/documento-fiscal-campos';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { CabecalhoDosDocumentos, FiltrosDosDocumentos, subtituloDosDocumentos, TelaListaDocumentos } from '@/components/erp/telas/compras/lista-documentos';

export const dynamic = 'force-dynamic';

const BASE = '/erp/compras/recebidas';

export default async function ErpNotasRecebidasPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const lidos = lerFiltrosDeDocumento(searchParams);
  const filtros = !lidos.lojaId && visao.tipo === 'loja' ? { ...lidos, lojaId: visao.lojaId } : lidos;
  const [pagina, opcoes] = await Promise.all([listarDocumentos(ctx.cliente, ctx.alcance, filtros), opcoesDosFiltrosDeDocumento(ctx.cliente, ctx.alcance)]);
  const lanca = pode(ctx.alcance, 'compras.lancar');
  return (
    <div className="space-y-6">
      <CabecalhoDosDocumentos subtitulo={subtituloDosDocumentos(rotuloDaVisao(visao), filtros, pagina.total, pagina.naFila)} importarHref={lanca ? `${BASE}/importar` : undefined} bloqueio={ctx.bloqueio}>
        <FiltrosDosDocumentos filtrado={temFiltroDeDocumento(lidos)} base={BASE} filtros={filtros} lojas={opcoes.lojas} fornecedores={opcoes.fornecedores} />
      </CabecalhoDosDocumentos>
      <TelaListaDocumentos
        base={BASE}
        filtros={filtros}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={pagina.pagina}
        paginas={pagina.paginas}
        temAlguma={pagina.temAlguma}
        importarHref={lanca && !ctx.bloqueio ? `${BASE}/importar` : undefined}
      />
    </div>
  );
}
