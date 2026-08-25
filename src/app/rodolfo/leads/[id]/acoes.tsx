'use client';

import { acaoExcluirLead, acaoMarcarOptOut, acaoMarcarVisita, acaoEnviarAgora } from '../../actions';
import { BotaoAcao } from '../../botoes';
import { Cartao } from '../../ui';

/**
 * Ações do Lead 360.
 *
 * "Abrir no WhatsApp" é um link para o app, não um envio pelo Barney: serve
 * para o Rodolfo ver a conversa no aparelho. Só o "Enviar agora" passa pelos
 * tetos — porque só ele é o Barney falando.
 */
export function AcoesLead({
  leadId,
  telefone,
  bloqueado,
}: {
  leadId: string;
  telefone: string | null;
  bloqueado: boolean;
}) {
  return (
    <Cartao titulo="Ações">
      <div className="grid gap-2 sm:grid-cols-2">
        {telefone && (
          <a
            href={`https://wa.me/${telefone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/15 px-4 py-2.5 text-center text-sm font-semibold text-surface/80 transition hover:border-white/30 hover:text-surface"
          >
            Abrir no WhatsApp
          </a>
        )}

        {!bloqueado && (
          <BotaoAcao acao={() => acaoEnviarAgora(leadId)} variante="primario">
            Enviar agora (pelo Barney)
          </BotaoAcao>
        )}

        <BotaoAcao acao={() => acaoMarcarVisita(leadId)}>Mover para Visita / Instagram</BotaoAcao>

        {!bloqueado && (
          <BotaoAcao
            acao={() => acaoMarcarOptOut(leadId)}
            variante="perigo"
            confirmar="Registrar opt-out? O bloqueio é por telefone e sobrevive a reimportar a planilha."
          >
            Registrar opt-out
          </BotaoAcao>
        )}

        <BotaoAcao
          acao={() => acaoExcluirLead(leadId)}
          variante="perigo"
          confirmar="Excluir este lead e todo o histórico dele? Não dá para desfazer. Um opt-out do número continua valendo."
        >
          Excluir (LGPD)
        </BotaoAcao>
      </div>

      <p className="mt-3 text-xs text-surface/40">
        Excluir apaga o cadastro e a timeline. O opt-out, se existir, permanece — ele é
        chaveado pelo telefone justamente para o pedido de saída sobreviver à exclusão.
      </p>
    </Cartao>
  );
}
