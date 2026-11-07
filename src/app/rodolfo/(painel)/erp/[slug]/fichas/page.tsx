/**
 * ERP, Fichas técnicas de um Parceiro Flow, pelo nível 1. Tudo o que esta tela
 * lê passa pelo cliente de `exigirParceiro` (portão de tenant + RLS); a URL só
 * escolhe o parceiro — o isolamento é o portão.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarFichas } from '@/lib/erp/fichas';
import { lerFiltrosDeFicha, queryDosFiltrosDeFicha, temFiltroDeFicha } from '@/lib/erp/ficha-campos';
import { FICHAS, subtituloDaLista } from '@/components/erp/telas/cadastro/subtitulo';
import { FiltrosDasFichas, TelaListaFichas } from '@/components/erp/telas/fichas/lista';
import { CabecalhoDasFichas, carregarClassificacaoDosFiltros } from '@/components/erp/telas/fichas/paginas';
import { acaoBuscarClassificacao, acaoGerirClassificacao } from './actions';
import { Aviso } from '@/components/erp/ui/superficies';
import { AvisoDaListaDeFichas } from '@/components/erp/telas/fichas/aviso-da-lista';
import { PainelDeSaude } from '@/components/erp/telas/fichas/saude';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';

export const dynamic = 'force-dynamic';

export default async function ParceiroFichasPage(
  props: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  const [pagina, { visao }] = await Promise.all([listarFichas(ctx.cliente, lerFiltrosDeFicha(searchParams), { verPrecos: true }), visaoDaRequisicao(ctx)]);
  const filtros = pagina.filtros;
  const de = queryDosFiltrosDeFicha(filtros);
  const classificacao = await carregarClassificacaoDosFiltros(acaoBuscarClassificacao.bind(null, ctx.parceiro.slug), filtros.secao, filtros.subsecao);
  const saude = !temFiltroDeFicha(filtros) && pagina.pagina === 1 ? await saudeDoCardapio(ctx.cliente) : null;
  return (
    <div className="space-y-6">
      <CabecalhoDasFichas
        subtitulo={`${ctx.parceiro.nome} · ${subtituloDaLista(visao, pagina.total, FICHAS, temFiltroDeFicha(filtros))}`}
        base={base}
        podeEditar
        bloqueio={ctx.bloqueio}
        de={de}
      >
        <FiltrosDasFichas key={de} base={base} filtros={filtros} classificacao={{ ...classificacao, gerir: ctx.bloqueio ? undefined : acaoGerirClassificacao.bind(null, ctx.parceiro.slug) }} />
      </CabecalhoDasFichas>
      <AvisoDaListaDeFichas cliente={ctx.cliente} base={base} filtros={filtros} feito={searchParams.feito} referencia={searchParams.ref} />
      {pagina.avisoFiltro && <Aviso tom="alerta" titulo={pagina.avisoFiltro} />}
      {saude && <PainelDeSaude saude={saude} base={base} configuracaoHref={`${base}/canais`} />}
      <TelaListaFichas
        base={base}
        {...pagina}
        novaHref={ctx.bloqueio ? undefined : `${base}/nova${de ? `?de=${encodeURIComponent(de)}` : ''}`}
        importarHref={ctx.bloqueio ? undefined : `${base}/importar`}
        acoes={!ctx.bloqueio}
      />
    </div>
  );
}
