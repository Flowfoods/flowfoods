/**
 * ERP, Notas de compra de um Parceiro Flow, pelo nível 1. A MESMA tela da
 * pessoa do parceiro; tudo passa pelo cliente de `exigirParceiro` (portão +
 * RLS). O nível 1 alcança todas as lojas; a visão do topo filtra.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarNotas, opcoesDosFiltrosDeNota } from '@/lib/erp/compras';
import { lerFiltrosDeNota, temFiltroDeNota } from '@/lib/erp/compra-campos';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { CabecalhoDasNotas, FiltrosDasNotas, subtituloDasNotas, TelaListaNotas } from '@/components/erp/telas/compras/lista-notas';

export const dynamic = 'force-dynamic';

export default async function ParceiroNotasPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/compras`;
  const { visao } = await visaoDaRequisicao(ctx);
  const lidos = lerFiltrosDeNota(searchParams);
  const filtros = !lidos.lojaId && visao.tipo === 'loja' ? { ...lidos, lojaId: visao.lojaId } : lidos;
  const [pagina, opcoes] = await Promise.all([listarNotas(ctx.cliente, ctx.alcance, filtros), opcoesDosFiltrosDeNota(ctx.cliente, ctx.alcance)]);
  return (
    <div className="space-y-6">
      <CabecalhoDasNotas
        subtitulo={`${ctx.parceiro.nome} · ${subtituloDasNotas(rotuloDaVisao(visao), pagina.total, pagina.somaCentavos, temFiltroDeNota(lidos))}`}
        novaHref={`${base}/nova`}
        bloqueio={ctx.bloqueio}
      >
        <FiltrosDasNotas base={base} filtros={filtros} lojas={opcoes.lojas} fornecedores={opcoes.fornecedores} />
      </CabecalhoDasNotas>
      <TelaListaNotas
        base={base}
        filtros={filtros}
        {...pagina}
        novaHref={ctx.bloqueio ? undefined : `${base}/nova`}
        temFornecedor={opcoes.fornecedores.length > 0}
        fornecedoresHref={`${base}/fornecedores`}
      />
    </div>
  );
}
