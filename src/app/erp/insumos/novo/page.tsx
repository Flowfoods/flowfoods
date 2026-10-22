/** ERP do parceiro — Novo insumo. Só com "cadastrar e editar insumos" (a action confere de novo). */

import { randomUUID } from 'node:crypto';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { categoriasDoFormulario } from '@/lib/erp/categorias';
import { TelaFormInsumo } from '@/components/erp/telas/insumos/paginas';
import { acaoCadastrarInsumo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovoInsumoPage({ searchParams }: { searchParams: { nome?: string; tipo?: string; unidade?: string; conservacao?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.editar');
  const categorias = await categoriasDoFormulario(ctx.cliente);
  // A chave deste envio nasce aqui, a cada abertura do formulário: o servidor reconhece o reenvio e não cria outro insumo.
  return (
    <TelaFormInsumo
      base="/erp/insumos"
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarInsumo}
      bloqueio={ctx.bloqueio}
      nomeSugerido={searchParams.nome}
      lembrado={{ tipo: searchParams.tipo, unidade: searchParams.unidade, conservacao: searchParams.conservacao }}
      categorias={categorias}
      envio={randomUUID()}
    />
  );
}
