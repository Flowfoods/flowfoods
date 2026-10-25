'use client';

import { acaoExcluirLead, acaoMarcarOptOut, acaoMarcarVisita, acaoEnviarAgora } from '../../actions';
import { BotaoAcao } from '@/components/erp/ui/botoes';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Painel } from '@/components/erp/ui/superficies';

/**
 * O envio do Lead 360, no cabeçalho (E5.1, revisão de UX): "Enviar agora" é a ação principal da tela; "Abrir no WhatsApp"
 * é um link para o app, não um envio pelo Barney — serve para ver a conversa no aparelho. Só o "Enviar agora" passa pelos
 * tetos, porque só ele é o Barney falando.
 */
export function EnvioDoLead({ leadId, whatsapp, podeEnviar }: { leadId: string; whatsapp: string | null; podeEnviar: boolean }) {
  if (!whatsapp) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className={classeDeBotao('secundario')}>
        Abrir no WhatsApp
      </a>
      {podeEnviar && (
        <BotaoAcao acao={() => acaoEnviarAgora(leadId)} variante="primario" className="max-w-xs">
          Enviar agora
        </BotaoAcao>
      )}
    </div>
  );
}

/** O que muda o lead: mover para visita, registrar que pediu para sair e excluir. Fica no fim, longe do envio. */
export function AcoesLead({ leadId, bloqueado, jaEmVisita }: { leadId: string; bloqueado: boolean; jaEmVisita: boolean }) {
  return (
    <Painel titulo="Outras ações">
      <div className="grid gap-2 sm:grid-cols-3">
        {!jaEmVisita && <BotaoAcao acao={() => acaoMarcarVisita(leadId)}>Mover para Visita e Instagram</BotaoAcao>}

        {!bloqueado && (
          <BotaoAcao
            acao={() => acaoMarcarOptOut(leadId)}
            variante="perigo"
            confirmar="Registrar que pediu para sair? O bloqueio é pelo telefone e continua valendo se a planilha for importada de novo."
          >
            Registrar que pediu para sair
          </BotaoAcao>
        )}

        <BotaoAcao
          acao={() => acaoExcluirLead(leadId)}
          variante="perigo"
          confirmar="Excluir este lead e todo o histórico dele? Não dá para desfazer. Se ele pediu para sair, o bloqueio do número continua valendo."
        >
          Excluir (LGPD)
        </BotaoAcao>
      </div>

      <p className="mt-4 text-[13px] text-suave">
        Excluir apaga o cadastro e o histórico. Se a pessoa pediu para sair, o bloqueio fica: ele é guardado pelo telefone
        justamente para o pedido de saída valer mesmo depois da exclusão.
      </p>
    </Painel>
  );
}
