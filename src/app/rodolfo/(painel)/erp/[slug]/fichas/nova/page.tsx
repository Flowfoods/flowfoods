/** ERP, Nova ficha técnica de um parceiro, pelo nível 1. */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { insumosParaFicha, preparosParaFicha } from '@/lib/erp/fichas';
import { TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { acaoCadastrarFicha } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovaFichaPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.editar');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <TelaFormFicha
      base={`${base}/fichas`}
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarFicha.bind(null, ctx.parceiro.slug)}
      opcoes={await insumosParaFicha(ctx.cliente)}
      preparos={await preparosParaFicha(ctx.cliente)}
      bloqueio={ctx.bloqueio}
      novoInsumo={`${base}/insumos/novo`}
    />
  );
}
