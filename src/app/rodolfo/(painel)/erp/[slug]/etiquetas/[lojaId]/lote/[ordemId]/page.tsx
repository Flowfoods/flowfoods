/** ERP, a etiqueta de um lote produzido de um Parceiro Flow, pelo nível 1 (3.4). Quem fez é a pessoa da equipe, nunca a FlowFoods. */

import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { idsDaEquipe } from '@/lib/erp/credenciais';
import { loteParaEtiqueta } from '@/lib/erp/etiquetas';
import { TelaEtiquetaDoLote } from '@/components/erp/telas/etiquetas/lote';
import { acaoEmitirDoLote } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEtiquetaDoLotePage({ params }: { params: { slug: string; lojaId: string; ordemId: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const d = await loteParaEtiqueta(ctx.cliente, ctx.alcance, params.lojaId, params.ordemId, await idsDaEquipe(ctx.parceiro.id));
  if (!d) notFound();
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <TelaEtiquetaDoLote
      d={d}
      base={`${raiz}/etiquetas`}
      contexto={ctx.parceiro.nome}
      acao={acaoEmitirDoLote.bind(null, ctx.parceiro.slug, d.loja.id, d.lote.id)}
      envio={`env-${randomUUID()}`}
      hrefLote={`${raiz}/producao/${d.loja.id}/${d.lote.id}`}
      bloqueio={ctx.bloqueio}
    />
  );
}
