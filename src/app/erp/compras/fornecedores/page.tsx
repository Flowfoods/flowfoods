/**
 * ERP do parceiro — Fornecedores (lista). Ver exige "ver compras e notas";
 * "Novo fornecedor" só com "cadastrar fornecedores". Fornecedor é cadastro da
 * rede; as contagens de nota são das lojas do alcance.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarFornecedores, type CadastroDoFornecedor, type SituacaoDoFornecedor } from '@/lib/erp/compras';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { TelaListaFornecedores } from '@/components/erp/telas/compras/fornecedores';

export const dynamic = 'force-dynamic';

const BASE = '/erp/compras/fornecedores';
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function ErpFornecedoresPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.ver');
  const q = um(searchParams.q).slice(0, 80);
  const s = um(searchParams.situacao);
  const situacao: SituacaoDoFornecedor = s === 'desativados' || s === 'todos' ? s : 'ativos';
  const c = um(searchParams.cadastro);
  const cadastro: CadastroDoFornecedor = c === 'a-completar' || c === 'completos' ? c : 'todos';
  const [linhas, { visao }] = await Promise.all([listarFornecedores(ctx.cliente, ctx.alcance, { q, situacao, cadastro }), visaoDaRequisicao(ctx)]);
  return (
    <TelaListaFornecedores
      base={BASE}
      notasBase="/erp/compras"
      contexto={visao.tipo === 'loja' ? `${visao.nome} · cadastro da rede` : rotuloDaVisao(visao)}
      linhas={linhas}
      q={q}
      situacao={situacao}
      cadastro={cadastro}
      novoHref={pode(ctx.alcance, 'fornecedores.editar') ? `${BASE}/novo` : undefined}
      bloqueio={ctx.bloqueio}
    />
  );
}
