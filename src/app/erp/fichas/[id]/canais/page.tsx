/**
 * ERP do parceiro — Embalagens por canal de uma ficha de prato (1.9). Quem
 * edita fichas e vê a precificação (a action confere de novo). Ficha lida
 * pelo portão da sessão: de outro parceiro, 404.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterFicha } from '@/lib/erp/fichas';
import { custoPorCanal, embalagensParaEscolher } from '@/lib/erp/canais';
import { TelaEmbalagensDaFicha } from '@/components/erp/telas/fichas/canais';
import { acaoSalvarEmbalagens } from '../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/fichas';

export default async function ErpEmbalagensDaFichaPage({ params, searchParams }: { params: { id: string }; searchParams?: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  exigirPermissaoNaPagina(ctx, 'precos.ver');
  const ficha = await obterFicha(ctx.cliente, params.id);
  if (!ficha) notFound();
  const canais = await custoPorCanal(ctx.cliente, ficha);
  if (!ficha.ativa || !canais) redirect(`${BASE}/${ficha.id}`);
  return (
    <TelaEmbalagensDaFicha
      ficha={ficha}
      canais={canais}
      base={BASE}
      contexto={ctx.parceiro.nome}
      acao={acaoSalvarEmbalagens.bind(null, ficha.id)}
      opcoes={await embalagensParaEscolher(ctx.cliente, canais.embalagens.map((e) => e.insumoId))}
      bloqueio={ctx.bloqueio}
      feito={searchParams?.feito}
      podeConferirPrecos={pode(ctx.alcance, 'fichas.ver')}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
