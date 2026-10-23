/** ERP, abrir embalagem numa loja de um Parceiro Flow, pelo nível 1 (3.4): vê os insumos e os lotes; não abre (quem abre assina). */

import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { NIVEL1_NAO_ABRE, opcoesDeAbertura } from '@/lib/erp/etiquetas';
import { TelaAbrirEmbalagem } from '@/components/erp/telas/etiquetas/abrir';
import { acaoAbrirEmbalagem } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroAbrirEmbalagemDaLojaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { insumo?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const d = await opcoesDeAbertura(ctx.cliente, ctx.alcance, params.lojaId, searchParams.insumo);
  if (!d) notFound();
  return (
    <TelaAbrirEmbalagem
      d={d}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`}
      contexto={ctx.parceiro.nome}
      acao={acaoAbrirEmbalagem.bind(null, ctx.parceiro.slug, d.loja.id)}
      envio={`env-${randomUUID()}`}
      podeAbrir={false}
      motivoSemAbrir={NIVEL1_NAO_ABRE}
      bloqueio={ctx.bloqueio}
    />
  );
}
