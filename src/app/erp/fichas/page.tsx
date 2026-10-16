/**
 * ERP do parceiro — Fichas técnicas (lista). A mesma tela do nível 1, com o
 * cliente do portão resolvido pela SESSÃO da pessoa. Ver exige "ver fichas
 * técnicas"; "Nova ficha" e "Importar planilha" só com "criar e editar fichas
 * técnicas" (e a action recusa do mesmo jeito, venha de onde vier).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarFichas } from '@/lib/erp/fichas';
import { lerFiltrosDeFicha, temFiltroDeFicha } from '@/lib/erp/ficha-campos';
import { FICHAS, subtituloDaLista } from '@/components/erp/telas/cadastro/subtitulo';
import { FiltrosDasFichas, TelaListaFichas } from '@/components/erp/telas/fichas/lista';
import { CabecalhoDasFichas } from '@/components/erp/telas/fichas/paginas';

export const dynamic = 'force-dynamic';

const BASE = '/erp/fichas';

export default async function ErpFichasPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.ver');
  const filtros = lerFiltrosDeFicha(searchParams);
  const [pagina, { visao }] = await Promise.all([listarFichas(ctx.cliente, filtros), visaoDaRequisicao(ctx)]);
  const edita = pode(ctx.alcance, 'fichas.editar');
  const livre = edita && !ctx.bloqueio;
  return (
    <div className="space-y-6">
      <CabecalhoDasFichas
        subtitulo={subtituloDaLista(visao, pagina.total, FICHAS, temFiltroDeFicha(filtros))}
        base={BASE}
        podeEditar={edita}
        bloqueio={ctx.bloqueio}
      >
        <FiltrosDasFichas base={BASE} filtros={filtros} />
      </CabecalhoDasFichas>
      <TelaListaFichas
        base={BASE}
        filtros={filtros}
        {...pagina}
        novaHref={livre ? `${BASE}/nova` : undefined}
        importarHref={livre ? `${BASE}/importar` : undefined}
      />
    </div>
  );
}
