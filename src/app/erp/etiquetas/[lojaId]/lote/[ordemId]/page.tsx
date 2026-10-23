/**
 * ERP do parceiro — a etiqueta de um lote produzido (3.4): "imprimir etiquetas" NA loja (lote de outra loja ou parceiro, 404).
 * Quem fez é a pessoa da equipe que pegou o lote (das credenciais). O link para o lote na Produção só para quem a vê.
 */

import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { idsDaEquipe } from '@/lib/erp/credenciais';
import { loteParaEtiqueta } from '@/lib/erp/etiquetas';
import { TelaEtiquetaDoLote } from '@/components/erp/telas/etiquetas/lote';
import { acaoEmitirDoLote } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpEtiquetaDoLotePage({ params }: { params: { lojaId: string; ordemId: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'etiquetas.imprimir');
  const d = await loteParaEtiqueta(ctx.cliente, ctx.alcance, params.lojaId, params.ordemId, await idsDaEquipe(ctx.parceiro.id));
  if (!d) notFound();
  const lojaId = d.loja.id;
  return (
    <TelaEtiquetaDoLote
      d={d}
      base="/erp/etiquetas"
      acao={acaoEmitirDoLote.bind(null, lojaId, d.lote.id)}
      envio={`env-${randomUUID()}`}
      hrefLote={pode(ctx.alcance, 'producao.ver', { lojaId }) ? `/erp/producao/${lojaId}/${d.lote.id}` : null}
      bloqueio={ctx.bloqueio}
    />
  );
}
