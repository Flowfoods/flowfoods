/** Replay financeiro local e limitado. Não importa transporte, OAuth ou repositório da fila HTTP. */
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { aplicarFaturamentoAnalytics } from '@/lib/erp/faturamento-integracao';
import type { PosseAnalytics } from '../core/posse-analytics';
import { ErroAplicacaoAnalytics, type ResultadoAplicacaoAnalytics } from './faturamento-tipos';

/** Usada dentro da TX de publicação, inclusive quando o hash não mudou. TEST não cria recibo. */
export async function sinalizarFaturamentoAnalytics(tx: ClienteDoParceiro, snapshotId: string, dono: string): Promise<void> {
  if (tx.somenteLeitura || !snapshotId || !dono) throw new ErroAplicacaoAnalytics('ACESSO');
  await tx.sql<{ recibo: string | null }>`SELECT erp_integracao_faturamento_sinalizar(${tx.parceiroId},${snapshotId},${dono}) AS recibo`;
}

/** No máximo uma recuperação pré-ponte e um grão por rodada. Pendências não impedem o rodízio. */
export async function processarUmFaturamentoPendente(
  cliente: ClienteDoParceiro, posse: PosseAnalytics, chaveGeral: () => boolean,
): Promise<ResultadoAplicacaoAnalytics | null> {
  if (cliente.somenteLeitura || !chaveGeral() || !await posse.confirmar()) return null;
  // Consulta só o catálogo persistido: nenhum segredo, app global ou campo de resposta HTTP.
  const [antigo] = await cliente.sql<{ id: string }>`SELECT s."id" FROM "IntegracaoSnapshot" s
    JOIN "IntegracaoExecucao" e ON e."parceiroId"=s."parceiroId" AND e."id"=s."execucaoId"
    JOIN "IntegracaoConexaoModulo" m ON m."parceiroId"=e."parceiroId" AND m."id"=e."moduloId"
    JOIN "IntegracaoConexao" c ON c."parceiroId"=m."parceiroId" AND c."id"=m."conexaoId"
    WHERE s."parceiroId"=${cliente.parceiroId} AND s."situacao"='PUBLICADO' AND e."perfil"='diario'
      AND m."modulo"='ANALYTICS' AND c."provedor"='IFOOD' AND c."ambiente"='PRODUCAO'
      AND NOT EXISTS(SELECT 1 FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=s."parceiroId" AND h."lojaId"=c."lojaId" AND h."dia"=e."dia" AND h."canal"='IFOOD' AND h."fonte"='ifood-analytics')
    ORDER BY s."criadoEm",s."id" LIMIT 1`;
  if (antigo) {
    if (!chaveGeral() || !await posse.confirmar()) return null;
    await cliente.transacao(tx => sinalizarFaturamentoAnalytics(tx, antigo.id, posse.id));
  }
  if (!chaveGeral() || !await posse.confirmar()) return null;
  // Os estados pendentes são reavaliados mesmo sem nova publicação: reabertura e reautorização
  // não precisam de outra chamada iFood. conferidaEm crescente evita starvation de outro dia.
  const [r] = await cliente.sql<{ lojaId: string; dia: string }>`SELECT h."lojaId",to_char(h."dia",'YYYY-MM-DD') AS dia
    FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=${cliente.parceiroId}
      AND (h."estado"<>'APLICADO' OR h."revisaoSolicitada">h."revisaoConferida")
    ORDER BY h."conferidaEm" ASC NULLS FIRST,h."id" LIMIT 1`;
  return r ? aplicarFaturamentoAnalytics(cliente, posse, r, chaveGeral) : null;
}
