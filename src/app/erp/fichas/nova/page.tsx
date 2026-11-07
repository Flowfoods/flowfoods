/** ERP do parceiro — Nova ficha técnica. Só com "criar e editar fichas técnicas" (a action confere de novo). */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { lerEdicaoDaFicha } from '@/lib/erp/fichas';
import { carregarClassificacaoDoFormulario, TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { acaoBuscarClassificacao, acaoCadastrarFichaUnificada, acaoGerirClassificacao } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpNovaFichaPage({ searchParams = {} }: { searchParams?: { de?: string | string[] } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.editar');
  const verCustos = pode(ctx.alcance, 'precos.ver');
  const dados = await lerEdicaoDaFicha(ctx.cliente, null, { verPrecos: verCustos });
  if (!dados) throw new Error('Não foi possível abrir a ficha.');
  return (
    <TelaFormFicha
      base="/erp/fichas"
      contexto={ctx.parceiro.nome}
      acao={acaoCadastrarFichaUnificada}
      de={deSeguroDaFicha(searchParams.de, verCustos)}
      classificacao={await carregarClassificacaoDoFormulario(acaoBuscarClassificacao, acaoGerirClassificacao)}
      opcoes={dados.opcoes}
      preparos={dados.preparos}
      materiais={dados.materiais}
      verFichas={pode(ctx.alcance, 'fichas.ver')}
      verCustos={verCustos}
      bloqueio={ctx.bloqueio}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
