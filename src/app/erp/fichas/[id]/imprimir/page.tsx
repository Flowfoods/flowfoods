/**
 * ERP do parceiro — ficha técnica para imprimir ou salvar em PDF (N.5). A visão sai da permissão EFETIVA da sessão: sem
 * "ver preços", a ficha chega sem nenhum valor de custo e sem a área de preços (o número nem sai do servidor). O id da URL
 * só escolhe: a leitura passa pelo portão do parceiro, então ficha de outro parceiro é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { fichaNaTela, obterFicha } from '@/lib/erp/fichas';
import { custoPorCanal } from '@/lib/erp/canais';
import { TelaImpressaoFicha } from '@/components/erp/telas/fichas/impressao';

export const dynamic = 'force-dynamic';

const BASE = '/erp/fichas';

export default async function ErpImprimirFichaPage({ params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.ver');
  const verPrecos = pode(ctx.alcance, 'precos.ver');
  const ficha = await obterFicha(ctx.cliente, params.id, { verPrecos });
  if (!ficha) notFound();
  const canais = verPrecos ? ((await custoPorCanal(ctx.cliente, ficha))?.cmv ?? null) : null;
  return (
    <TelaImpressaoFicha
      ficha={fichaNaTela(ficha, verPrecos)}
      canais={canais}
      contexto={ctx.parceiro.nome}
      base={BASE}
      voltar={`${BASE}/${ficha.id}`}
      geradoEm={new Date()}
    />
  );
}
