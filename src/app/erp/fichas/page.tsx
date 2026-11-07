/**
 * ERP do parceiro — Fichas técnicas (lista). A mesma tela do nível 1, com o
 * cliente do portão resolvido pela SESSÃO da pessoa. Ver exige "ver fichas
 * técnicas"; "Nova ficha" e "Importar planilha" só com "criar e editar fichas
 * técnicas" (e a action recusa do mesmo jeito, venha de onde vier).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarFichas } from '@/lib/erp/fichas';
import { lerFiltrosDeFicha, queryDosFiltrosDeFicha, temFiltroDeFicha } from '@/lib/erp/ficha-campos';
import { FICHAS, subtituloDaLista } from '@/components/erp/telas/cadastro/subtitulo';
import { FiltrosDasFichas, linhasSemCusto, TelaListaFichas } from '@/components/erp/telas/fichas/lista';
import { CabecalhoDasFichas, carregarClassificacaoDosFiltros } from '@/components/erp/telas/fichas/paginas';
import { acaoBuscarClassificacao, acaoGerirClassificacao } from './actions';
import { Aviso } from '@/components/erp/ui/superficies';
import { AvisoDaListaDeFichas } from '@/components/erp/telas/fichas/aviso-da-lista';
import { PainelDeSaude } from '@/components/erp/telas/fichas/saude';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';

export const dynamic = 'force-dynamic';

const BASE = '/erp/fichas';

export default async function ErpFichasPage(
  props: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.ver');
  // N.2: preço e CMV por canal na lista só para quem vê preços (nem sai do servidor para os outros); o filtro pelo CMV também.
  const verPrecos = pode(ctx.alcance, 'precos.ver');
  const lidos = lerFiltrosDeFicha(searchParams);
  const [pagina, { visao }] = await Promise.all([listarFichas(ctx.cliente, lidos, { verPrecos }), visaoDaRequisicao(ctx)]);
  const filtros = pagina.filtros;
  const de = queryDosFiltrosDeFicha(filtros);
  const edita = pode(ctx.alcance, 'fichas.editar');
  const livre = edita && !ctx.bloqueio;
  const classificacao = await carregarClassificacaoDosFiltros(acaoBuscarClassificacao, filtros.secao, filtros.subsecao);
  // 24/10 (referência Nina): a saúde do cardápio, só para quem vê preços e na lista sem filtro (com filtro, a lista já é o recorte).
  const saude = verPrecos && !temFiltroDeFicha(filtros) && pagina.pagina === 1 ? await saudeDoCardapio(ctx.cliente) : null;
  return (
    <div className="space-y-6">
      <CabecalhoDasFichas
        subtitulo={subtituloDaLista(visao, pagina.total, FICHAS, temFiltroDeFicha(filtros))}
        base={BASE}
        podeEditar={edita}
        bloqueio={ctx.bloqueio}
        de={de}
      >
        <FiltrosDasFichas key={de} base={BASE} filtros={filtros} verCustos={verPrecos} classificacao={{ ...classificacao, gerir: livre ? acaoGerirClassificacao : undefined }} />
      </CabecalhoDasFichas>
      <AvisoDaListaDeFichas cliente={ctx.cliente} base={BASE} filtros={filtros} feito={searchParams.feito} referencia={searchParams.ref} />
      {pagina.avisoFiltro && <Aviso tom="alerta" titulo={pagina.avisoFiltro} />}
      {saude && <PainelDeSaude saude={saude} base={BASE} configuracaoHref={`${BASE}/canais`} />}
      <TelaListaFichas
        base={BASE}
        {...pagina}
        // N.5: quem só opera recebe a lista sem nenhum valor de custo (visão operacional automática).
        linhas={verPrecos ? pagina.linhas : linhasSemCusto(pagina.linhas)}
        novaHref={livre ? `${BASE}/nova${de ? `?de=${encodeURIComponent(de)}` : ''}` : undefined}
        importarHref={livre ? `${BASE}/importar` : undefined}
        acoes={livre}
      />
    </div>
  );
}
