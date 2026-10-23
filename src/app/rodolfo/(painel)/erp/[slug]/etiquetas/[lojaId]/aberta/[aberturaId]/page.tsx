/** ERP, uma embalagem aberta de um Parceiro Flow, pelo nível 1 (3.4): vê e emite a etiqueta (quem abriu assina). */

import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { aberturaParaEtiqueta } from '@/lib/erp/etiquetas';
import { TelaEmbalagemAberta } from '@/components/erp/telas/etiquetas/aberta';
import { fraseDasEtiquetas } from '@/components/erp/telas/etiquetas/estado';
import { acaoEmitirDaAbertura } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEmbalagemAbertaPage({ params, searchParams }: { params: { slug: string; lojaId: string; aberturaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  const d = await aberturaParaEtiqueta(ctx.cliente, ctx.alcance, params.lojaId, params.aberturaId);
  if (!d) notFound();
  return (
    <TelaEmbalagemAberta
      d={d}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/etiquetas`}
      contexto={ctx.parceiro.nome}
      feito={fraseDasEtiquetas(searchParams.feito)}
      acao={acaoEmitirDaAbertura.bind(null, ctx.parceiro.slug, d.loja.id, d.abertura.id)}
      envio={`env-${randomUUID()}`}
      bloqueio={ctx.bloqueio}
    />
  );
}
