/** ERP, fornecedores de um Parceiro Flow, pelo nível 1. */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { listarFornecedores, type SituacaoDoFornecedor } from '@/lib/erp/compras';
import { TelaListaFornecedores } from '@/components/erp/telas/compras/fornecedores';

export const dynamic = 'force-dynamic';

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function ParceiroFornecedoresPage({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/compras`;
  const q = um(searchParams.q).slice(0, 80);
  const s = um(searchParams.situacao);
  const situacao: SituacaoDoFornecedor = s === 'desativados' || s === 'todos' ? s : 'ativos';
  const linhas = await listarFornecedores(ctx.cliente, ctx.alcance, { q, situacao });
  return (
    <TelaListaFornecedores
      base={`${base}/fornecedores`}
      notasBase={base}
      contexto={`${ctx.parceiro.nome} · cadastro da rede`}
      linhas={linhas}
      q={q}
      situacao={situacao}
      novoHref={`${base}/fornecedores/novo`}
      bloqueio={ctx.bloqueio}
    />
  );
}
