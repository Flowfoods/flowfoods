/** ERP, a lista do dia de uma loja de um Parceiro Flow, pelo nível 1 (3.2): a mesma tela, as ações do nível 1 (com rastro). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { obterListaDoDia } from '@/lib/erp/producao-lista';
import { TelaListaDoDia } from '@/components/erp/telas/producao/lista';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoGerarLotesDaLista, acaoPorNaListaDoDia, acaoSalvarListaDoDia } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroListaDoDiaDaLojaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { dia?: string; feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const d = await obterListaDoDia(ctx.cliente, ctx.alcance, params.lojaId, searchParams.dia);
  if (!d) notFound();
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <TelaListaDoDia
      d={d}
      base={`${raiz}/producao`}
      raiz={raiz}
      contexto={ctx.parceiro.nome}
      feito={fraseDoEstoque(searchParams.feito)}
      acoes={{
        salvar: acaoSalvarListaDoDia.bind(null, ctx.parceiro.slug, d.loja.id),
        gerar: acaoGerarLotesDaLista.bind(null, ctx.parceiro.slug, d.loja.id),
        por: acaoPorNaListaDoDia.bind(null, ctx.parceiro.slug, d.loja.id),
      }}
      bloqueio={ctx.bloqueio}
      periodosHref={`${raiz}/dre/periodos`}
    />
  );
}
