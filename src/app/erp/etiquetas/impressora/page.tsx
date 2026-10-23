/** ERP do parceiro — Etiquetas (3.4), a Impressora: a Zebra deste computador (Browser Print) e a etiqueta de teste. */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { TelaDaImpressora } from '@/components/erp/telas/etiquetas/impressora';
import { acaoZplDeTeste } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpImpressoraPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'etiquetas.imprimir');
  return <TelaDaImpressora zplDeTeste={acaoZplDeTeste} />;
}
