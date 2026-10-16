/**
 * ERP — estrutura do parceiro (N2 → N3) pelo nível 1: as lojas (onde a
 * operação acontece) e as marcas do grupo. Mesma tela de /erp/lojas.
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { listarEstrutura } from '@/lib/erp/estrutura';
import { FormNome } from '../../form-nome';
import { TelaEstrutura } from '../../tela-estrutura';
import { acaoCadastrarLoja, acaoCadastrarMarca } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EstruturaPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'lojas.ver');
  const { lojas, marcas } = await listarEstrutura(ctx.cliente, ctx.alcance);
  const slug = ctx.parceiro.slug;
  return (
    <TelaEstrutura
      lojas={lojas}
      marcas={marcas}
      bloqueio={ctx.bloqueio}
      mostrarLink
      formLoja={<FormNome acao={acaoCadastrarLoja.bind(null, slug)} tipo="loja" />}
      formMarca={<FormNome acao={acaoCadastrarMarca.bind(null, slug)} tipo="marca" />}
    />
  );
}
