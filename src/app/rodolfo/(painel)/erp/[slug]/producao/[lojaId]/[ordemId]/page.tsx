/** ERP, um lote de um Parceiro Flow, pelo nível 1 (3.1). 3.3: o nível 1 vê quem está com o lote, solta e passa; não pega. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { pessoasQueProduzem } from '@/lib/erp/credenciais';
import { obterOrdem } from '@/lib/erp/producao';
import { TelaDoLote } from '@/components/erp/telas/producao/lote';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoCancelarProducao, acaoEstornarProducao, acaoPassarLote, acaoPegarLote, acaoSoltarLote } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroLotePage({ params, searchParams }: { params: { slug: string; lojaId: string; ordemId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.ver');
  const d = await obterOrdem(ctx.cliente, ctx.alcance, params.lojaId, params.ordemId);
  if (!d) notFound();
  const lojaId = d.loja.id;
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <TelaDoLote
      d={d}
      base={`${raiz}/producao`}
      contexto={ctx.parceiro.nome}
      feito={fraseDoEstoque(searchParams.feito)}
      pode={{ registrar: true, estornar: true, gerenciar: true, pegar: false }}
      hrefs={{ requisicao: `${raiz}/estoque/${lojaId}/requisicoes`, estoque: `${raiz}/estoque/${lojaId}`, etiqueta: `${raiz}/etiquetas/${lojaId}/lote/${d.ordem.id}` }}
      acoes={{
        pegar: acaoPegarLote.bind(null, ctx.parceiro.slug, lojaId),
        soltar: acaoSoltarLote.bind(null, ctx.parceiro.slug, lojaId),
        passar: acaoPassarLote.bind(null, ctx.parceiro.slug, lojaId),
        cancelar: acaoCancelarProducao.bind(null, ctx.parceiro.slug, lojaId, d.ordem.id),
        estornar: acaoEstornarProducao.bind(null, ctx.parceiro.slug, lojaId, d.ordem.id),
      }}
      pessoas={d.ordem.status === 'EM_EXECUCAO' ? await pessoasQueProduzem(ctx.parceiro.id, lojaId) : []}
      bloqueio={ctx.bloqueio}
    />
  );
}
