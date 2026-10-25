'use client';

import { acaoDesligarDisparo, acaoLigarDisparo } from '../actions';
import { BotaoAcao } from '@/components/erp/ui/botoes';

/**
 * A chave geral do disparo (decisão 469): um botão que liga ou desliga na hora. Ligar é a decisão de começar a prospectar e
 * pede confirmação; desligar para tudo, inclusive o envio à mão, num toque só.
 */
export function ChaveDoDisparo({ ligado }: { ligado: boolean }) {
  return ligado ? (
    // Desligar é a ação de segurança: um toque, sem confirmação (na emergência, dois toques atrasam).
    <BotaoAcao acao={acaoDesligarDisparo} variante="perigo" className="sm:max-w-xs">
      Desligar o disparo
    </BotaoAcao>
  ) : (
    <BotaoAcao
      acao={acaoLigarDisparo}
      // Secundário: o principal da tela é "Salvar ajustes"; ligar já pede confirmação.
      variante="secundario"
      confirmar="Ligar o disparo? As mensagens passam a sair do lote aprovado, dentro dos limites e da janela de envio."
      className="sm:max-w-xs"
    >
      Ligar o disparo
    </BotaoAcao>
  );
}
