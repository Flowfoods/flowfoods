/** ERP, detalhe da ficha técnica de um parceiro, pelo nível 1 (lida pelo portão do parceiro do slug: de outro, 404). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { fichaNaTela, obterFichaComCanais } from '@/lib/erp/fichas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { voltaDaFichaAoInsumo } from '@/lib/erp/ficha-volta-insumo';
import { TelaDetalheFicha } from '@/components/erp/telas/fichas/detalhe';
import { acaoSalvarPrecos, acaoSituacaoFicha } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroFichaPage(
  props: {
    params: Promise<{ slug: string; id: string }>;
    searchParams: Promise<{ de?: string | string[]; feito?: string; volta?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.ver');
  // O nível 1 vê a precificação (inclusive no histórico).
  const leitura = await obterFichaComCanais(ctx.cliente, params.id, { verPrecos: true });
  if (!leitura) notFound();
  const { ficha, canais } = leitura;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const de = deSeguroDaFicha(searchParams.de);
  const origem = await voltaDaFichaAoInsumo(searchParams.volta, base, ctx.cliente, ctx.alcance);
  return (
    <TelaDetalheFicha
      // N.5: quem só opera recebe a ficha sem nenhum valor de custo (visão operacional automática).
      ficha={fichaNaTela(ficha, true)}
      base={`${base}/fichas`}
      de={de}
      voltar={origem ?? (de ? `${base}/fichas?${de}` : `${base}/fichas`)}
      rotuloVoltar={origem ? 'Voltar para o insumo' : undefined}
      feito={searchParams.feito}
      contexto={ctx.parceiro.nome}
      podeEditar
      bloqueio={ctx.bloqueio}
      acaoSituacao={acaoSituacaoFicha.bind(null, ctx.parceiro.slug, ficha.id)}
      linkDoInsumo={`${base}/insumos`}
      canais={canais}
      linkDasEmbalagens={ctx.bloqueio ? undefined : `${base}/fichas/${ficha.id}/editar${de ? `?de=${encodeURIComponent(de)}` : ''}#ficha-materiais`}
      linkDaTaxa={`${base}/fichas/canais`}
      linkDoProduzir={ficha.ativa && !ctx.bloqueio ? `/rodolfo/erp/${ctx.parceiro.slug}/producao/nova?ficha=${ficha.id}` : undefined}
      podeConfigurarTaxa={!ctx.bloqueio}
      acaoPrecos={ctx.bloqueio ? undefined : acaoSalvarPrecos.bind(null, ctx.parceiro.slug, ficha.id)}
    />
  );
}
