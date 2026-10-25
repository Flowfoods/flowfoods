'use client';

import { acaoDesligarDisparo, acaoLigarDisparo } from '../actions';
import { BotaoAcao } from '@/components/erp/ui/botoes';

/**
 * A chave geral do disparo (decisão 469): um botão que liga ou desliga na hora, com confirmação. Ligar é a decisão de
 * começar a prospectar; desligar para tudo, inclusive o envio à mão.
 */
export function ChaveDoDisparo({ ligado }: { ligado: boolean }) {
  return ligado ? (
    <BotaoAcao acao={acaoDesligarDisparo} variante="perigo" confirmar="Desligar o disparo? Nada sai, nem à mão, até você ligar de novo." className="sm:max-w-xs">
      Desligar o disparo
    </BotaoAcao>
  ) : (
    <BotaoAcao
      acao={acaoLigarDisparo}
      variante="primario"
      confirmar="Ligar o disparo? As mensagens passam a sair do lote aprovado, dentro dos limites e da janela de envio."
      className="sm:max-w-xs"
    >
      Ligar o disparo
    </BotaoAcao>
  );
}
