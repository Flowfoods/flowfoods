/**
 * ERP, ficha técnica de um parceiro para imprimir ou salvar em PDF, pelo nível 1 (N.5). Decisão de 31/10/2026: a página
 * sai sempre sem preços e custos; "Com preços e custos" é escolhido a cada impressão e lido pela ação do servidor.
 */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao, pode } from '@/lib/erp/contexto';
import { obterFichaParaImpressao } from '@/lib/erp/ficha-impressao';
import { deSeguroDaFicha } from '@/lib/erp/ficha-campos';
import { TelaImpressaoFicha } from '@/components/erp/telas/fichas/impressao';
import { acaoImpressaoFinanceira, acaoImpressaoOperacional } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroImprimirFichaPage(
  props: { searchParams?: Promise<{ de?: string | string[] }>; params: Promise<{ slug: string; id: string }> }
) {
  const searchParams = (await props.searchParams) ?? {};
  const params = await props.params;
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.ver');
  const ficha = await obterFichaParaImpressao(ctx.cliente, params.id);
  const de = deSeguroDaFicha(searchParams.de, pode(ctx.alcance, 'precos.ver'));
  const busca = de ? '?de=' + encodeURIComponent(de) : '';
  if (!ficha) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  return (
    <TelaImpressaoFicha
      ficha={ficha}
      podeFinanceiro={pode(ctx.alcance, 'precos.ver')}
      carregarOperacional={acaoImpressaoOperacional.bind(null, ctx.parceiro.slug)}
      carregarFinanceiro={acaoImpressaoFinanceira.bind(null, ctx.parceiro.slug)}
      contexto={ctx.parceiro.nome}
      base={base}
      voltar={`${base}/${ficha.id}${busca}`}
      geradoEm={new Date()}
    />
  );
}
