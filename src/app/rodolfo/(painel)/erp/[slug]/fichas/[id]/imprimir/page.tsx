/**
 * ERP, ficha técnica de um parceiro para imprimir ou salvar em PDF, pelo nível 1 (N.5). Decisão de 31/10/2026: a página
 * sai sempre sem preços e custos; "Com preços e custos" é escolhido a cada impressão e lido pela ação do servidor.
 */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao, pode } from '@/lib/erp/contexto';
import { fichaNaTela, obterFicha } from '@/lib/erp/fichas';
import { fichaNoPapel } from '@/lib/erp/ficha-papel';
import { TelaImpressaoFicha } from '@/components/erp/telas/fichas/impressao';
import { acaoImpressaoFinanceira } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroImprimirFichaPage({ params }: { params: { slug: string; id: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'fichas.ver');
  const ficha = await obterFicha(ctx.cliente, params.id, { verPrecos: false });
  if (!ficha) notFound();
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/fichas`;
  return (
    <TelaImpressaoFicha
      ficha={fichaNoPapel(fichaNaTela(ficha, false))}
      podeFinanceiro={pode(ctx.alcance, 'precos.ver')}
      carregarFinanceiro={acaoImpressaoFinanceira.bind(null, ctx.parceiro.slug)}
      contexto={ctx.parceiro.nome}
      base={base}
      voltar={`${base}/${ficha.id}`}
      geradoEm={new Date()}
    />
  );
}
