/** ERP, embalagens por canal de uma ficha de prato de um parceiro, pelo nível 1 (lida pelo portão do parceiro do slug: de outro, 404). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao, pode } from '@/lib/erp/contexto';
import { obterFichaComCanais } from '@/lib/erp/fichas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { embalagensParaEscolher } from '@/lib/erp/canais';
import { TelaEmbalagensDaFicha } from '@/components/erp/telas/fichas/canais';
import { acaoSalvarEmbalagens } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEmbalagensDaFichaPage({ params, searchParams }: { params: { slug: string; id: string }; searchParams?: { feito?: string; de?: string | string[] } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  exigirPermissao(ctx, 'precos.ver');
  const leitura = await ctx.cliente.transacao(async tx => {
    const dados = await obterFichaComCanais(tx, params.id, { verPrecos: true });
    if (!dados) return null;
    return { ...dados, opcoes: dados.canais ? await embalagensParaEscolher(tx, dados.canais.embalagens.map(e => e.insumoId)) : [] };
  }, { repetivel: true });
  if (!leitura) notFound();
  const { ficha, canais, opcoes } = leitura;
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const de = deSeguroDaFicha(searchParams?.de);
  if (!ficha.ativa || !canais) redirect(`${base}/fichas/${ficha.id}${de ? `?de=${encodeURIComponent(de)}` : ''}`);
  return (
    <TelaEmbalagensDaFicha
      ficha={ficha}
      canais={canais}
      base={`${base}/fichas`}
      de={de}
      contexto={ctx.parceiro.nome}
      acao={acaoSalvarEmbalagens.bind(null, ctx.parceiro.slug, ficha.id)}
      opcoes={opcoes}
      bloqueio={ctx.bloqueio}
      feito={searchParams?.feito}
      podeConferirPrecos={pode(ctx.alcance, 'fichas.ver')}
      novoInsumo={`${base}/insumos/novo`}
    />
  );
}
