/**
 * ERP do parceiro — ficha técnica para imprimir ou salvar em PDF (N.5). Decisão de 31/10/2026: a página sai SEMPRE sem
 * preços e custos (o número nem sai do servidor), inclusive por URL direta, recarga ou Ctrl+P. "Com preços e custos" é
 * uma escolha explícita a cada impressão; a ação confere `precos.ver` no servidor e só então devolve os valores. O id da
 * URL só escolhe: a leitura passa pelo portão do parceiro, então ficha de outro parceiro é 404.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { fichaNaTela, obterFicha } from '@/lib/erp/fichas';
import { fichaNoPapel } from '@/lib/erp/ficha-papel';
import { TelaImpressaoFicha } from '@/components/erp/telas/fichas/impressao';
import { acaoImpressaoFinanceira } from '../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/fichas';

export default async function ErpImprimirFichaPage({ params }: { params: { id: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'fichas.ver');
  const ficha = await obterFicha(ctx.cliente, params.id, { verPrecos: false });
  if (!ficha) notFound();
  return (
    <TelaImpressaoFicha
      ficha={fichaNoPapel(fichaNaTela(ficha, false))}
      podeFinanceiro={pode(ctx.alcance, 'precos.ver')}
      carregarFinanceiro={acaoImpressaoFinanceira}
      contexto={ctx.parceiro.nome}
      base={BASE}
      voltar={`${BASE}/${ficha.id}`}
      geradoEm={new Date()}
    />
  );
}
