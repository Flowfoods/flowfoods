/**
 * ERP do parceiro — ficha técnica para imprimir ou salvar em PDF (N.5). Decisão de 31/10/2026: a página sai SEMPRE sem
 * preços e custos (o número nem sai do servidor), inclusive por URL direta, recarga ou Ctrl+P. "Com preços e custos" é
 * uma escolha explícita a cada impressão; a ação confere `precos.ver` no servidor e só então devolve os valores. O id da
 * URL só escolhe: a leitura passa pelo portão do parceiro, então ficha de outro parceiro é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { obterFichaParaImpressao } from '@/lib/erp/ficha-impressao';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { TelaImpressaoFicha } from '@/components/erp/telas/fichas/impressao';
import { acaoImpressaoFinanceira, acaoImpressaoOperacional } from '../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/fichas';

export default async function ErpImprimirFichaPage({ params, searchParams = {} }: { searchParams?: { de?: string | string[] }; params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.ver');
  const ficha = await obterFichaParaImpressao(ctx.cliente, params.id);
  const de = deSeguroDaFicha(searchParams.de, pode(ctx.alcance, 'precos.ver'));
  const busca = de ? '?de=' + encodeURIComponent(de) : '';
  if (!ficha) notFound();
  return (
    <TelaImpressaoFicha
      ficha={ficha}
      podeFinanceiro={pode(ctx.alcance, 'precos.ver')}
      carregarOperacional={acaoImpressaoOperacional}
      carregarFinanceiro={acaoImpressaoFinanceira}
      contexto={ctx.parceiro.nome}
      base={BASE}
      voltar={`${BASE}/${ficha.id}${busca}`}
      geradoEm={new Date()}
    />
  );
}
