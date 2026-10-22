/**
 * ERP do parceiro — Insumos (lista). A mesma tela do nível 1, com o cliente do
 * portão resolvido pela SESSÃO da pessoa. Ver exige "ver insumos"; "Novo
 * insumo" só aparece com "cadastrar e editar insumos" (e a action recusa do
 * mesmo jeito, venha de onde vier).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { contarConservacaoAConfirmar, listarInsumos } from '@/lib/erp/insumos';
import { categoriasParaEscolher } from '@/lib/erp/categorias';
import { resumoDoQueFalta } from '@/lib/erp/classificar';
import { AvisoConservacaoAConfirmar, AvisoDaClassificacao } from '@/components/erp/telas/insumos/aviso-classificar';
import { lerFiltros, temFiltro } from '@/lib/erp/insumo-campos';
import { FiltrosDaLista, TelaListaInsumos } from '@/components/erp/telas/insumos/lista';
import { CabecalhoDaLista } from '@/components/erp/telas/insumos/paginas';
import { INSUMOS, subtituloDaLista } from '@/components/erp/telas/cadastro/subtitulo';

export const dynamic = 'force-dynamic';

const BASE = '/erp/insumos';

export default async function ErpInsumosPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.ver');
  const filtros = lerFiltros(searchParams);
  const [pagina, { visao }, categorias, faltam, aConfirmar] = await Promise.all([
    listarInsumos(ctx.cliente, filtros),
    visaoDaRequisicao(ctx),
    categoriasParaEscolher(ctx.cliente, null, true),
    resumoDoQueFalta(ctx.cliente, ctx.alcance),
    contarConservacaoAConfirmar(ctx.cliente),
  ]);
  const cadastra = pode(ctx.alcance, 'insumos.editar');
  return (
    <div className="space-y-6">
      <CabecalhoDaLista
        subtitulo={subtituloDaLista(visao, pagina.total, INSUMOS, temFiltro(filtros))}
        novoHref={cadastra ? `${BASE}/novo` : undefined}
        bloqueio={ctx.bloqueio}
      >
        <FiltrosDaLista base={BASE} filtros={filtros} categorias={categorias} />
      </CabecalhoDaLista>
      <AvisoConservacaoAConfirmar quantos={aConfirmar} base={BASE} jaFiltrado={filtros.conservacao === 'confirmar'} />
      <AvisoDaClassificacao resumo={faltam} href={cadastra ? `${BASE}/classificar` : undefined} />
      <TelaListaInsumos
        base={BASE}
        filtros={filtros}
        {...pagina}
        novoHref={cadastra && !ctx.bloqueio ? `${BASE}/novo` : undefined}
      />
    </div>
  );
}
