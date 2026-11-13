import type { ContextoDoParceiro } from '@/lib/erp/contexto-base';
import { pode } from '@/lib/erp/permissoes';
import { ErroDeTenant } from '@/lib/erp/tenant';
import { PRIORIDADE_RELEITURA_DIARIA } from '../ifood/pipeline-tipos';
import { diaValidoDaSituacao, estadoParaReleitura, ontemDaSituacaoAnalytics, type PedidoReleituraAnalytics } from './situacao-analytics-campos';

const recusar = (mensagem: string) => ({ ok: false as const, mensagem });
const indisponivel = () => recusar('A releitura está indisponível. Confira o vínculo da loja, o acesso de produção e a pausa ou espera da coleta.');
const idValido = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128 && id.trim() === id;

/** A Central só devolve uma janela diária existente à fila. Aquisição, HTTP e publicação pertencem ao worker. */
export async function solicitarReleituraAnalytics(ctx: ContextoDoParceiro, pedido: PedidoReleituraAnalytics) {
  if (ctx.alcance.nivel !== 'FLOWFOODS' || !ctx.podeEscrever || ctx.bloqueio !== null || ctx.cliente.somenteLeitura
    || ctx.parceiro.id !== ctx.cliente.parceiroId || ctx.parceiro.status !== 'ATIVO' || ctx.parceiro.homologacaoDeIntegracao !== false
    || !idValido(ctx.sessao.userId) || !ctx.sessao.autorNome.trim()) {
    return recusar('A releitura exige acesso de escrita de nível 1 a um parceiro de produção ativo.');
  }
  if (!pedido || !idValido(pedido.lojaId) || !idValido(pedido.conexaoId) || !diaValidoDaSituacao(pedido.dia)
    || pedido.dia > ontemDaSituacaoAnalytics() || !Number.isSafeInteger(pedido.geracao) || pedido.geracao < 1
    || pedido.geracao > 2_147_483_647 || !estadoParaReleitura(pedido.estado)) {
    return recusar('Consulte a loja e um dia já encerrado em São Paulo e confira a tentativa disponível para releitura.');
  }
  const { lojaId, conexaoId, dia, estado, geracao } = pedido;
  if (!pode(ctx.alcance, 'integracao.ver', { lojaId })) return indisponivel();
  try {
    return await ctx.cliente.transacao(async tx => {
      // Igual ao cadastro de conexão e à ponte de faturamento. Este SELECT precede qualquer trava de linha.
      await tx.sql`SELECT erp_integracao_travar_cobertura(${tx.parceiroId}, ${lojaId})::text AS trava`;
      const modulo = await tx.integracaoConexaoModulo.findFirst({
        where: { conexaoId, modulo: 'ANALYTICS', estado: 'ATIVO', conexao: { lojaId, ambiente: 'PRODUCAO', provedor: 'IFOOD', estado: 'ATIVA' } },
        select: { id: true, conexao: { select: { nomeExterno: true } } },
      });
      if (!modulo) return indisponivel();
      // Mesmo portão e ordem das travas do planejador: inclui controle global, parceiro, conexão, módulo, liberação e app.
      const [acesso] = await tx.sql<{ ok: boolean }>`SELECT erp_integracao_exigir_acesso(${tx.parceiroId}, ${modulo.id}, NULL, false) AS ok`;
      if (acesso?.ok !== true) return indisponivel();
      const [loja] = await tx.sql<{ nome: string }>`SELECT nome FROM "Loja"
        WHERE "parceiroId" = ${tx.parceiroId} AND id = ${lojaId} AND ativa FOR SHARE`;
      if (!loja) return indisponivel();
      // Sob as travas, repete a elegibilidade da tela. Uma renovação ou nova geração invalida o clique anterior.
      const [janela] = await tx.sql<{ id: string }>`UPDATE "IntegracaoExecucao" e
        SET estado = 'PLANEJADA', prioridade = ${PRIORIDADE_RELEITURA_DIARIA}::int, dono = NULL, "leaseAte" = NULL, "concluidaEm" = NULL, "atualizadoEm" = clock_timestamp(),
          ciclo = to_char(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
        WHERE e."parceiroId" = ${tx.parceiroId} AND e."moduloId" = ${modulo.id} AND e.dia = ${dia}::date
          AND e.perfil = 'diario' AND e.fuso = 'America/Sao_Paulo' AND e.geracao = ${geracao}::int AND e.estado = ${estado}
          AND erp_integracao_pode_reler_dia(${tx.parceiroId}, ${lojaId}, e.id, ${geracao}::int)
        RETURNING e.id`;
      if (!janela) return recusar('A janela mudou, continua em execução ou aguarda liberação. Consulte a situação atual antes de solicitar outra releitura.');
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'IntegracaoConexaoModulo', entidadeId: modulo.id, acao: 'PEDIU_RELEITURA',
          autorNome: ctx.sessao.autorNome.trim().slice(0, 120), antes: { situacao: estado },
          depois: { situacao: 'Releitura na fila', loja: loja.nome, nomeNoIfood: modulo.conexao.nomeExterno, data: dia,
            execucaoId: janela.id, geracao, usuarioId: ctx.sessao.userId } },
      });
      return { ok: true as const };
    });
  } catch (erro) {
    if (erro instanceof ErroDeTenant && erro.message.includes('parceiro não está ATIVO')) return indisponivel();
    throw erro;
  }
}
