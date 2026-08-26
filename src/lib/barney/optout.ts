/**
 * Detecção de opt-out.
 *
 * Roda ANTES de qualquer chamada de IA, sempre. Honrar a saída é obrigação de
 * LGPD (legítimo interesse, Art. 7º, IX) e é também o que evita denúncia no
 * WhatsApp — que é o que queima número de verdade.
 *
 * Viés deliberado para o falso positivo: marcar opt-out sem necessidade custa
 * UM lead; deixar passar um pedido de saída custa denúncia, número queimado e
 * exposição jurídica. Quando estiver em dúvida, a função sai por opt-out.
 *
 * Nenhum modelo decide isso. Se a Anthropic estiver fora do ar, o opt-out
 * continua funcionando — por isso ele é palavra-chave e não classificação.
 */

import { OPT_OUT_FRASES, OPT_OUT_PALAVRAS_ISOLADAS } from './regras';
import { normalizarFrase } from './texto';

export interface ResultadoOptOut {
  optOut: boolean;
  /** O termo que casou — vai para o audit log, para a decisão ser auditável. */
  termo?: string;
  regra?: 'FRASE' | 'PALAVRA_ISOLADA';
}

export function detectarOptOut(texto: string | null | undefined): ResultadoOptOut {
  const t = normalizarFrase(texto);
  if (!t) return { optOut: false };

  // 1. Frases: casam em qualquer posição. "me tira da lista por favor" conta.
  const frase = OPT_OUT_FRASES.find((f) => t.includes(normalizarFrase(f)));
  if (frase) return { optOut: true, termo: frase, regra: 'FRASE' };

  // 2. Palavras isoladas: só valem quando são a mensagem INTEIRA.
  //    Sem isso, "nao sei, me manda mais informacao" viraria opt-out — que é o
  //    oposto do que a pessoa disse.
  const palavras = t.split(' ').filter(Boolean);
  if (palavras.length <= 2) {
    const isolada = OPT_OUT_PALAVRAS_ISOLADAS.find((p) => palavras.includes(normalizarFrase(p)));
    if (isolada) return { optOut: true, termo: isolada, regra: 'PALAVRA_ISOLADA' };
  }

  return { optOut: false };
}
