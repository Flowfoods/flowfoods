/**
 * Normalização de telefone brasileiro para E.164.
 *
 * Esta função é a CHAVE de duas coisas que não podem falhar:
 *   1. dedup de lead na reimportação;
 *   2. opt-out permanente — que só sobrevive à reimportação se o mesmo aparelho
 *      produzir sempre a mesma string.
 *
 * Por isso ela é conservadora: o que não der para afirmar, volta inválido em vez
 * de "consertar" no chute. Número errado aqui vira mensagem para desconhecido,
 * que é exatamente o que queima o número.
 *
 * Regra de canal (decisão do Rodolfo, `ledsflowfoods/SKILL.md`): a cadência de
 * WhatsApp usa APENAS celular — DDD + 9 dígitos começando em 9. Fixo não é lead
 * ruim, é canal errado: vai para a lista "Visita / Instagram".
 */

export type TipoTelefone = 'CELULAR' | 'FIXO' | 'INVALIDO';

export interface TelefoneNormalizado {
  /** E.164 sem o "+", pronto para a Evolution: 5521999998888. Vazio se inválido. */
  e164: string;
  /** Só os 10 ou 11 dígitos nacionais (DDD + número). Vazio se inválido. */
  nacional: string;
  ddd: string;
  tipo: TipoTelefone;
  /** Motivo da recusa, para a timeline do lead. */
  motivo?: string;
}

const INVALIDO = (motivo: string): TelefoneNormalizado => ({
  e164: '',
  nacional: '',
  ddd: '',
  tipo: 'INVALIDO',
  motivo,
});

/** DDDs válidos no Brasil. Fora desta lista não existe linha. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function normalizarTelefone(entrada: string | null | undefined): TelefoneNormalizado {
  if (entrada == null) return INVALIDO('vazio');

  const bruto = String(entrada).trim();
  if (!bruto) return INVALIDO('vazio');

  // A skill grava literalmente "SEM TELEFONE" quando o Google não devolveu número.
  if (/^sem\b/i.test(bruto)) return INVALIDO('sem telefone');

  let d = bruto.replace(/\D/g, '');
  if (!d) return INVALIDO('sem digitos');

  // Prefixo internacional: +55 vem como 55 na frente. Só descarta quando o que
  // sobra tem tamanho de número nacional — senão estaríamos comendo um DDD 55
  // (Santa Maria/RS), que é legítimo.
  if (d.length > 11 && d.startsWith('55')) {
    const semDdi = d.slice(2);
    if (semDdi.length === 10 || semDdi.length === 11) d = semDdi;
  }

  // Zero de operadora / trunk: 021 99999-8888.
  if (d.length > 11 && d.startsWith('0')) d = d.replace(/^0+/, '');

  if (d.length < 10) return INVALIDO(`curto demais (${d.length} digitos)`);
  if (d.length > 11) return INVALIDO(`longo demais (${d.length} digitos)`);

  const ddd = d.slice(0, 2);
  if (!DDDS_VALIDOS.has(Number(ddd))) return INVALIDO(`DDD inexistente (${ddd})`);

  const assinante = d.slice(2);

  // Celular: 9 dígitos começando em 9. É o mesmo teste do `eh_celular` da skill
  // (len == 11 && d[2] == "9"), escrito de forma explícita.
  if (assinante.length === 9) {
    if (!assinante.startsWith('9')) {
      return INVALIDO('9 digitos sem o 9 inicial');
    }
    return { e164: `55${d}`, nacional: d, ddd, tipo: 'CELULAR' };
  }

  // Fixo: 8 dígitos. Começa em 2–5 no plano brasileiro.
  if (!/^[2-5]/.test(assinante)) {
    return INVALIDO('fixo com prefixo invalido');
  }
  return { e164: `55${d}`, nacional: d, ddd, tipo: 'FIXO' };
}

/** Espelha `eh_celular` do `montar_pacote.py`. */
export function ehCelular(entrada: string | null | undefined): boolean {
  return normalizarTelefone(entrada).tipo === 'CELULAR';
}

/**
 * Canal de abordagem. Só CELULAR entra na cadência do Barney; o resto sai da
 * fila e vai para a lista de visita presencial / Instagram.
 */
export type Canal = 'WHATSAPP' | 'INSTAGRAM' | 'VISITA';

export function canalDoTelefone(entrada: string | null | undefined): Canal {
  return ehCelular(entrada) ? 'WHATSAPP' : 'VISITA';
}
