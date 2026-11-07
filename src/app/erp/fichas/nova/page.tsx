/** ERP do parceiro — Nova ficha técnica. Só com "criar e editar fichas técnicas" (a action confere de novo). */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { insumosParaFicha, opcoesDaFichaNaTela, preparosParaFicha } from '@/lib/erp/fichas';
import { carregarClassificacaoDoFormulario, TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { acaoBuscarClassificacao, acaoCadastrarFicha, acaoGerirClassificacao } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovaFichaPage({ searchParams = {} }: { searchParams?: { de?: string | string[] } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  const verCustos = pode(ctx.alcance, 'precos.ver');
  const [opcoes, preparos] = await Promise.all([insumosParaFicha(ctx.cliente), preparosParaFicha(ctx.cliente)]);
  return (
    <TelaFormFicha
      base="/erp/fichas"
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarFicha}
      de={deSeguroDaFicha(searchParams.de, verCustos)}
      classificacao={await carregarClassificacaoDoFormulario(acaoBuscarClassificacao, acaoGerirClassificacao)}
      {...opcoesDaFichaNaTela(opcoes, preparos, verCustos)}
      verCustos={verCustos}
      bloqueio={ctx.bloqueio}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
