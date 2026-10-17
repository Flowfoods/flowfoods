/** ERP, canais de venda e taxa do iFood de um parceiro, pelo nível 1. */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterTaxaDoIfood } from '@/lib/erp/canais';
import { TelaCanaisDeVenda } from '@/components/erp/telas/fichas/canais';
import { acaoSalvarMargensAlvo, acaoSalvarTaxaDoIfood } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroCanaisDeVendaPage({ params, searchParams }: { params: { slug: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'precos.ver');
  const t = await obterTaxaDoIfood(ctx.cliente);
  return (
    <TelaCanaisDeVenda
      base={`/rodolfo/erp/${ctx.parceiro.slug}/fichas`}
      contexto={ctx.parceiro.nome}
      taxa={t.taxa}
      versao={t.versao}
      historico={t.historico}
      podeEditar
      podeVerFichas
      bloqueio={ctx.bloqueio}
      acao={acaoSalvarTaxaDoIfood.bind(null, ctx.parceiro.slug)}
      feito={searchParams.feito}
      margens={t.margens}
      versaoDasMargens={t.versaoDasMargens}
      acaoMargens={acaoSalvarMargensAlvo.bind(null, ctx.parceiro.slug)}
    />
  );
}
