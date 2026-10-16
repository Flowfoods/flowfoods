/**
 * ERP do parceiro — Notas de compra (lista). A MESMA tela do nível 1, com o
 * cliente do portão resolvido pela SESSÃO. Ver exige "ver compras e notas";
 * a lista só traz as lojas do alcance (e, com uma loja escolhida no topo, só
 * ela — a visão filtra, nunca concede). "Lançar nota" só com "lançar nota".
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarNotas, opcoesDosFiltrosDeNota } from '@/lib/erp/compras';
import { lerFiltrosDeNota, temFiltroDeNota } from '@/lib/erp/compra-campos';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { CabecalhoDasNotas, FiltrosDasNotas, subtituloDasNotas, TelaListaNotas } from '@/components/erp/telas/compras/lista-notas';

export const dynamic = 'force-dynamic';

const BASE = '/erp/compras';

export default async function ErpNotasPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const lidos = lerFiltrosDeNota(searchParams);
  // Sem loja no filtro, vale a loja escolhida no topo (Rede Completa = todas do alcance).
  const filtros = !lidos.lojaId && visao.tipo === 'loja' ? { ...lidos, lojaId: visao.lojaId } : lidos;
  const [pagina, opcoes] = await Promise.all([listarNotas(ctx.cliente, ctx.alcance, filtros), opcoesDosFiltrosDeNota(ctx.cliente, ctx.alcance)]);
  const lanca = pode(ctx.alcance, 'compras.lancar');
  return (
    <div className="space-y-6">
      <CabecalhoDasNotas
        subtitulo={subtituloDasNotas(rotuloDaVisao(visao), pagina.total, pagina.somaCentavos, temFiltroDeNota(lidos))}
        novaHref={lanca ? `${BASE}/nova` : undefined}
        bloqueio={ctx.bloqueio}
      >
        <FiltrosDasNotas filtrado={temFiltroDeNota(lidos)} base={BASE} filtros={filtros} lojas={opcoes.lojas} fornecedores={opcoes.fornecedores} />
      </CabecalhoDasNotas>
      <TelaListaNotas
        filtrado={temFiltroDeNota(lidos)}
        base={BASE}
        filtros={filtros}
        {...pagina}
        novaHref={lanca && !ctx.bloqueio ? `${BASE}/nova` : undefined}
        temFornecedor={opcoes.fornecedores.length > 0}
        fornecedoresHref={`${BASE}/fornecedores`}
        cadastraFornecedor={pode(ctx.alcance, 'fornecedores.editar')}
      />
    </div>
  );
}
