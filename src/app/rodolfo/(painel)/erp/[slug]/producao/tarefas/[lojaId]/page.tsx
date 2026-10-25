/** ERP, as tarefas de hoje da cozinha de uma loja de um Parceiro Flow, pelo nível 1 (3.3): vê, solta e passa; não pega. */

import { notFound } from 'next/navigation';
import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { pessoasQueProduzem } from '@/lib/erp/credenciais';
import { tarefasDoDia } from '@/lib/erp/producao-equipe';
import { TelaTarefas } from '@/components/erp/telas/producao/tarefas';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoPassarLote, acaoPegarDaLista, acaoPegarLote, acaoSoltarLote } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroTarefasDaLojaPage({ params, searchParams }: { params: { slug: string; lojaId: string }; searchParams: { feito?: string; lote?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'producao.registrar');
  const t = await tarefasDoDia(ctx.cliente, ctx.alcance, params.lojaId, null);
  if (!t) notFound();
  const lojaId = t.loja.id;
  const raiz = `/rodolfo/erp/${ctx.parceiro.slug}`;
  const s = ctx.parceiro.slug;
  // Depois de concluir pelas Tarefas: a etiqueta do lote que acabou de sair (um lote concluído hoje nesta loja).
  const concluido = searchParams.feito === 'concluido' ? t.feitasHoje.find((f) => f.id === searchParams.lote && f.produzidoMilesimos > 0) : undefined;
  const etiquetaHref = concluido ? `${raiz}/etiquetas/${lojaId}/lote/${concluido.id}` : null;
  return (
    <TelaTarefas
      t={t}
      base={`${raiz}/producao`}
      contexto={ctx.parceiro.nome}
      feito={fraseDoEstoque(searchParams.feito)}
      eu={null}
      pessoas={await pessoasQueProduzem(ctx.parceiro.id, lojaId)}
      acoes={{ pegarLote: acaoPegarLote.bind(null, s, lojaId), pegarLinha: acaoPegarDaLista.bind(null, s, lojaId), soltar: acaoSoltarLote.bind(null, s, lojaId), passar: acaoPassarLote.bind(null, s, lojaId), sair: null }}
      bloqueio={ctx.bloqueio}
      etiquetaHref={etiquetaHref}
      periodosHref={`${raiz}/dre/periodos`}
    />
  );
}
