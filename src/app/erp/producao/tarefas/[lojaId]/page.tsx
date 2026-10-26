/**
 * ERP do parceiro — as tarefas de hoje da cozinha de uma loja (3.3): "registrar produção" NA loja (fora do acesso ou de outro
 * parceiro, 404). Quem está usando é a pessoa do login (no tablet compartilhado, "Trocar de pessoa" sai e outra entra). A
 * gerência ("definir a lista do dia") solta e passa: quem pode receber vem das credenciais.
 */

import { notFound } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { pessoasQueProduzem } from '@/lib/erp/credenciais';
import { tarefasDoDia } from '@/lib/erp/producao-equipe';
import { TelaTarefas } from '@/components/erp/telas/producao/tarefas';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoSair } from '@/app/entrar/actions';
import { acaoPassarLote, acaoPegarDaLista, acaoPegarLote, acaoSoltarLote } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpTarefasDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { feito?: string; lote?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'producao.registrar');
  const t = await tarefasDoDia(ctx.cliente, ctx.alcance, params.lojaId, ctx.sessao.userId);
  if (!t) notFound();
  const lojaId = t.loja.id;
  // Depois de concluir pelas Tarefas: a etiqueta do lote que acabou de sair (um lote concluído hoje nesta loja).
  const concluido = searchParams.feito === 'concluido' ? t.feitasHoje.find((f) => f.id === searchParams.lote && f.produzidoMilesimos > 0) : undefined;
  const imprime = pode(ctx.alcance, 'etiquetas.imprimir', { lojaId });
  const etiquetaHref = concluido && imprime ? `/erp/etiquetas/${lojaId}/lote/${concluido.id}` : null;
  return (
    <TelaTarefas
      t={t}
      base="/erp/producao"
      feito={fraseDoEstoque(searchParams.feito)}
      eu={{ nome: ctx.sessao.autorNome }}
      pessoas={t.pode.gerenciar ? await pessoasQueProduzem(ctx.parceiro.id, lojaId) : []}
      acoes={{ pegarLote: acaoPegarLote.bind(null, lojaId), pegarLinha: acaoPegarDaLista.bind(null, lojaId), soltar: acaoSoltarLote.bind(null, lojaId), passar: acaoPassarLote.bind(null, lojaId), sair: acaoSair }}
      bloqueio={ctx.bloqueio}
      etiquetaHref={etiquetaHref}
      veEtiquetas={imprime}
      periodosHref={pode(ctx.alcance, 'dre.ver') ? '/erp/dre/periodos' : null}
    />
  );
}
