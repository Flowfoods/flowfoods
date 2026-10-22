/** ERP, Novo insumo de um parceiro, pelo nível 1. */

import { randomUUID } from 'node:crypto';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { categoriasDoFormulario } from '@/lib/erp/categorias';
import { caminhoDeVolta } from '@/lib/erp/volta';
import { deSeguro } from '@/lib/erp/insumo-campos';
import { TelaFormInsumo } from '@/components/erp/telas/insumos/paginas';
import { acaoCadastrarInsumo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroNovoInsumoPage({ params, searchParams }: { params: { slug: string }; searchParams: { nome?: string; tipo?: string; unidade?: string; volta?: string; de?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.editar');
  const categorias = await categoriasDoFormulario(ctx.cliente);
  return (
    <TelaFormInsumo
      categorias={categorias}
      envio={randomUUID()}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/insumos`}
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarInsumo.bind(null, ctx.parceiro.slug)}
      bloqueio={ctx.bloqueio}
      nomeSugerido={searchParams.nome}
      lembrado={{ tipo: searchParams.tipo, unidade: searchParams.unidade }}
      volta={caminhoDeVolta(searchParams.volta, `/rodolfo/erp/${ctx.parceiro.slug}/`)}
      de={deSeguro(searchParams.de)}
    />
  );
}
