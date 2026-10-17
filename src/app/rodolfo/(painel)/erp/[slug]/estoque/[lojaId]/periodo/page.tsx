/** ERP, período e contagens de uma loja de um Parceiro Flow, pelo nível 1 (1.7). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { situacaoDoPeriodo } from '@/lib/erp/contagem';
import { TelaPeriodo } from '@/components/erp/telas/estoque/periodo';
import { acaoIniciarFechamento, acaoSalvarRegrasDaContagem } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroPeriodoDaLojaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/estoque`;
  const s = await situacaoDoPeriodo(ctx.cliente, ctx.alcance, params.lojaId);
  if (!s) notFound();
  if (!s.aberto) redirect(`${base}/${s.loja.id}`);
  return (
    <TelaPeriodo
      s={s}
      base={base}
      contexto={ctx.parceiro.nome}
      feito={searchParams.feito}
      pode={{ ajustar: true, contar: true, regras: true, periodos: true }}
      acoes={{ fechar: acaoIniciarFechamento.bind(null, ctx.parceiro.slug, s.loja.id), regras: acaoSalvarRegrasDaContagem.bind(null, ctx.parceiro.slug, s.loja.id) }}
      bloqueio={ctx.bloqueio}
    />
  );
}
