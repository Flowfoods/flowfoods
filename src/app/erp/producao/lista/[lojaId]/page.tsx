/**
 * ERP do parceiro — a lista do dia de uma loja (3.2): vê quem tem "ver a produção" NA loja (a cozinha lê); monta, muda e gera
 * os lotes quem tem "definir a lista do dia". Loja de outro parceiro ou fora do acesso é 404. O dia vem em `?dia=aaaa-mm-dd`.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterListaDoDia } from '@/lib/erp/producao-lista';
import { TelaListaDoDia } from '@/components/erp/telas/producao/lista';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoGerarLotesDaLista, acaoPorNaListaDoDia, acaoSalvarListaDoDia } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpListaDoDiaDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { dia?: string; feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.ver');
  const d = await obterListaDoDia(ctx.cliente, ctx.alcance, params.lojaId, searchParams.dia);
  if (!d) notFound();
  return (
    <TelaListaDoDia
      d={d}
      base="/erp/producao"
      raiz="/erp"
      feito={fraseDoEstoque(searchParams.feito)}
      acoes={{ salvar: acaoSalvarListaDoDia.bind(null, d.loja.id), gerar: acaoGerarLotesDaLista.bind(null, d.loja.id), por: acaoPorNaListaDoDia.bind(null, d.loja.id) }}
      bloqueio={ctx.bloqueio}
      periodosHref={pode(ctx.alcance, 'dre.ver') ? '/erp/dre/periodos' : null}
    />
  );
}
