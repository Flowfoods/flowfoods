/**
 * ERP do parceiro — Fichas técnicas (lista). A mesma tela do nível 1, com o
 * cliente do portão resolvido pela SESSÃO da pessoa. Ver exige "ver fichas
 * técnicas"; "Nova ficha" e "Importar planilha" só com "criar e editar fichas
 * técnicas" (e a action recusa do mesmo jeito, venha de onde vier).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarFichas } from '@/lib/erp/fichas';
import { cmvDaLista } from '@/lib/erp/canais';
import { lerFiltrosDeFicha, temFiltroDeFicha } from '@/lib/erp/ficha-campos';
import { FICHAS, subtituloDaLista } from '@/components/erp/telas/cadastro/subtitulo';
import { FiltrosDasFichas, linhasSemCusto, TelaListaFichas } from '@/components/erp/telas/fichas/lista';
import { CabecalhoDasFichas } from '@/components/erp/telas/fichas/paginas';
import { AvisoDaListaDeFichas } from '@/components/erp/telas/fichas/aviso-da-lista';
import { PainelDeSaude } from '@/components/erp/telas/fichas/saude';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';

export const dynamic = 'force-dynamic';

const BASE = '/erp/fichas';

export default async function ErpFichasPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.ver');
  // N.2: preço e CMV por canal na lista só para quem vê preços (nem sai do servidor para os outros); o filtro pelo CMV também.
  const verPrecos = pode(ctx.alcance, 'precos.ver');
  const lidos = lerFiltrosDeFicha(searchParams);
  const filtros = verPrecos ? lidos : { ...lidos, cmv: null };
  const [pagina, { visao }] = await Promise.all([listarFichas(ctx.cliente, filtros, { verPrecos }), visaoDaRequisicao(ctx)]);
  const edita = pode(ctx.alcance, 'fichas.editar');
  const livre = edita && !ctx.bloqueio;
  const precos = verPrecos ? await cmvDaLista(ctx.cliente, pagina.linhas) : undefined;
  // 24/10 (referência Nina): a saúde do cardápio, só para quem vê preços e na lista sem filtro (com filtro, a lista já é o recorte).
  const saude = verPrecos && !temFiltroDeFicha(filtros) && pagina.pagina === 1 ? await saudeDoCardapio(ctx.cliente) : null;
  return (
    <div className="space-y-6">
      <CabecalhoDasFichas
        subtitulo={subtituloDaLista(visao, pagina.total, FICHAS, temFiltroDeFicha(filtros))}
        base={BASE}
        podeEditar={edita}
        bloqueio={ctx.bloqueio}
      >
        <FiltrosDasFichas base={BASE} filtros={filtros} verCustos={verPrecos} />
      </CabecalhoDasFichas>
      <AvisoDaListaDeFichas cliente={ctx.cliente} base={BASE} filtros={filtros} feito={searchParams.feito} referencia={searchParams.ref} />
      {saude && <PainelDeSaude saude={saude} base={BASE} configuracaoHref={`${BASE}/canais`} />}
      <TelaListaFichas
        base={BASE}
        filtros={filtros}
        {...pagina}
        // N.5: quem só opera recebe a lista sem nenhum valor de custo (visão operacional automática).
        linhas={verPrecos ? pagina.linhas : linhasSemCusto(pagina.linhas)}
        novaHref={livre ? `${BASE}/nova` : undefined}
        importarHref={livre ? `${BASE}/importar` : undefined}
        cmv={precos}
        acoes={livre}
      />
    </div>
  );
}
