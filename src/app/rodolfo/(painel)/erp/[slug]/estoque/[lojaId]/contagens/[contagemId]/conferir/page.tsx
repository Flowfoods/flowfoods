/** ERP, conferir e aplicar uma contagem do dia a dia ou do fechamento de um Parceiro Flow, pelo nível 1 (1.7). */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { conferenciaDaContagem } from '@/lib/erp/contagem';
import { TelaConferirContagem } from '@/components/erp/telas/estoque/conferir-contagem';
import { acaoConcluirContagem, acaoDescartarContagem } from '../../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroConferirContagemPage({ params, searchParams }: { params: { slug: string; lojaId: string; contagemId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.ver');
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const c = await conferenciaDaContagem(ctx.cliente, ctx.alcance, params.lojaId, params.contagemId, ctx.parceiro);
  if (!c) notFound();
  const s = ctx.parceiro.slug;
  return (
    <TelaConferirContagem
      c={c}
      base={`${base}/estoque`}
      contexto={ctx.parceiro.nome}
      feito={searchParams.feito}
      notasBase={`${base}/compras`}
      acoes={{ concluir: acaoConcluirContagem.bind(null, s, c.loja.id, c.contagem.id), descartar: acaoDescartarContagem.bind(null, s, c.loja.id, c.contagem.id) }}
      podeAplicar
      podeContar
      bloqueio={ctx.bloqueio}
    />
  );
}
