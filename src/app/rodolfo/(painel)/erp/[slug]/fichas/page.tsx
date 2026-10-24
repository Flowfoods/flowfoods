/**
 * ERP, Fichas técnicas de um Parceiro Flow, pelo nível 1. Tudo o que esta tela
 * lê passa pelo cliente de `exigirParceiro` (portão de tenant + RLS); a URL só
 * escolhe o parceiro — o isolamento é o portão.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarFichas } from '@/lib/erp/fichas';
import { cmvDaLista } from '@/lib/erp/canais';
import { lerFiltrosDeFicha, temFiltroDeFicha } from '@/lib/erp/ficha-campos';
import { FICHAS, subtituloDaLista } from '@/components/erp/telas/cadastro/subtitulo';
import { FiltrosDasFichas, TelaListaFichas } from '@/components/erp/telas/fichas/lista';
import { CabecalhoDasFichas } from '@/components/erp/telas/fichas/paginas';
import { AvisoDaListaDeFichas } from '@/components/erp/telas/fichas/aviso-da-lista';
import { PainelDeSaude } from '@/components/erp/telas/fichas/saude';
import { saudeDoCardapio } from '@/lib/erp/saude-do-cardapio';

export const dynamic = 'force-dynamic';

export default async function ParceiroFichasPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  const filtros = lerFiltrosDeFicha(searchParams);
  const [pagina, { visao }] = await Promise.all([listarFichas(ctx.cliente, filtros, { verPrecos: true }), visaoDaRequisicao(ctx)]);
  const precos = await cmvDaLista(ctx.cliente, pagina.linhas);
  const saude = !temFiltroDeFicha(filtros) && pagina.pagina === 1 ? await saudeDoCardapio(ctx.cliente) : null;
  return (
    <div className="space-y-6">
      <CabecalhoDasFichas
        subtitulo={`${ctx.parceiro.nome} · ${subtituloDaLista(visao, pagina.total, FICHAS, temFiltroDeFicha(filtros))}`}
        base={base}
        podeEditar
        bloqueio={ctx.bloqueio}
      >
        <FiltrosDasFichas base={base} filtros={filtros} />
      </CabecalhoDasFichas>
      <AvisoDaListaDeFichas cliente={ctx.cliente} base={base} filtros={filtros} feito={searchParams.feito} referencia={searchParams.ref} />
      {saude && <PainelDeSaude saude={saude} base={base} configuracaoHref={`${base}/canais`} />}
      <TelaListaFichas
        base={base}
        filtros={filtros}
        {...pagina}
        novaHref={ctx.bloqueio ? undefined : `${base}/nova`}
        importarHref={ctx.bloqueio ? undefined : `${base}/importar`}
        cmv={precos}
        acoes={!ctx.bloqueio}
      />
    </div>
  );
}
