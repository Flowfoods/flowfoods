/**
 * ERP do parceiro — Embalagens por canal de uma ficha de prato (1.9). Quem
 * edita fichas e vê a precificação (a action confere de novo). Ficha lida
 * pelo portão da sessão: de outro parceiro, 404.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterFichaComCanais } from '@/lib/erp/fichas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { embalagensParaEscolher } from '@/lib/erp/canais';
import { TelaEmbalagensDaFicha } from '@/components/erp/telas/fichas/canais';
import { acaoSalvarEmbalagens } from '../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/fichas';

export default async function ErpEmbalagensDaFichaPage({ params, searchParams }: { params: { id: string }; searchParams?: { feito?: string; de?: string | string[] } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  exigirPermissaoNaPagina(ctx, 'precos.ver');
  const leitura = await ctx.cliente.transacao(async tx => {
    const dados = await obterFichaComCanais(tx, params.id, { verPrecos: true });
    if (!dados) return null;
    return { ...dados, opcoes: dados.canais ? await embalagensParaEscolher(tx, dados.canais.embalagens.map(e => e.insumoId)) : [] };
  }, { repetivel: true });
  if (!leitura) notFound();
  const { ficha, canais, opcoes } = leitura;
  const de = deSeguroDaFicha(searchParams?.de);
  if ((!ficha.ativa || !canais) && !pode(ctx.alcance, 'fichas.ver')) notFound();
  if (!ficha.ativa || !canais) redirect(`${BASE}/${ficha.id}${de ? `?de=${encodeURIComponent(de)}` : ''}`);
  return (
    <TelaEmbalagensDaFicha
      ficha={ficha}
      canais={canais}
      base={BASE}
      de={de}
      contexto={ctx.parceiro.nome}
      acao={acaoSalvarEmbalagens.bind(null, ficha.id)}
      opcoes={opcoes}
      bloqueio={ctx.bloqueio}
      feito={searchParams?.feito}
      podeConferirPrecos={pode(ctx.alcance, 'fichas.ver')}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
