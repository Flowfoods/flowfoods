/** ERP do parceiro — Nova ficha técnica. Só com "criar e editar fichas técnicas" (a action confere de novo). */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { insumosParaFicha, opcoesDaFichaNaTela, preparosParaFicha } from '@/lib/erp/fichas';
import { TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { acaoCadastrarFicha } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovaFichaPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  const verCustos = pode(ctx.alcance, 'precos.ver');
  const [opcoes, preparos] = await Promise.all([insumosParaFicha(ctx.cliente), preparosParaFicha(ctx.cliente)]);
  return (
    <TelaFormFicha
      base="/erp/fichas"
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarFicha}
      {...opcoesDaFichaNaTela(opcoes, preparos, verCustos)}
      verCustos={verCustos}
      bloqueio={ctx.bloqueio}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
