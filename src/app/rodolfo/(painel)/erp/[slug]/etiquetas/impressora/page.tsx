/** ERP, a impressora (Browser Print) vista pelo nível 1 dentro de um Parceiro Flow (3.4): a mesma tela, deste computador. */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { TelaDaImpressora } from '@/components/erp/telas/etiquetas/impressora';
import { acaoZplDeTeste } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroImpressoraPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'etiquetas.imprimir');
  return <TelaDaImpressora contexto={ctx.parceiro.nome} zplDeTeste={acaoZplDeTeste.bind(null, ctx.parceiro.slug)} />;
}
