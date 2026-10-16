/** ERP, conferir e concluir a abertura de uma loja de um Parceiro Flow, pelo nível 1 (1.6). */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { conferenciaDaAbertura } from '@/lib/erp/estoque';
import { TelaConferencia } from '@/components/erp/telas/estoque/conferencia';
import { acaoConcluirAbertura } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroConferirAberturaPage({ params }: { params: { slug: string; lojaId: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}/estoque`;
  const c = await conferenciaDaAbertura(ctx.cliente, ctx.alcance, params.lojaId);
  if (!c) notFound();
  if (c.contagem?.status !== 'ABERTA') redirect(`${base}/${c.loja.id}`);
  return <TelaConferencia c={c} base={base} contexto={ctx.parceiro.nome} acao={acaoConcluirAbertura.bind(null, ctx.parceiro.slug, c.loja.id)} podeConcluir bloqueio={ctx.bloqueio} />;
}
