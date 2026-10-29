/**
 * Cliente iFood (INT-1.3, decisão 485) — o que cada resposta quer dizer, puro. Regras do iFood que viram código:
 *  - 401: token vencido ou recusado → um token novo e UMA nova tentativa; de novo 401, para (nunca uma tempestade de tokens);
 *  - 403: a loja não autorizou o app ou o módulo não está no app → NÃO repetir (consultar loja não autorizada é infração);
 *    quem chamou pausa o módulo;
 *  - 400/422: pedido inválido (também é infração) → não repetir; o montador da consulta tem de ser corrigido;
 *  - 404: não encontrado → não é zero nem "sem dado oficial";
 *  - 429: limite → esperar o Retry-After (ou o backoff) e repetir;
 *  - 5xx, falha de rede e tempo esgotado: repetir com espera crescente, com limite;
 *  - 2xx com erro no corpo: erro de negócio, não sucesso.
 */

export type Classificacao =
  | { tipo: 'ok' }
  | { tipo: 'nao-autenticado' }
  | { tipo: 'sem-permissao' }
  | { tipo: 'requisicao-invalida' }
  | { tipo: 'nao-encontrado' }
  | { tipo: 'limite'; esperarMs: number | null }
  | { tipo: 'indisponivel' }
  | { tipo: 'erro-no-corpo'; codigo: string | null }
  | { tipo: 'inesperado' };

/** Quantos ms o Retry-After pede (segundos ou data HTTP), ou null se ausente/ilegível. Nunca negativo; teto de 5 minutos. */
export function lerRetryAfter(valor: string | null | undefined, agoraMs: number): number | null {
  if (!valor) return null;
  const s = valor.trim();
  if (/^\d+$/.test(s)) return Math.min(Number(s) * 1000, 300_000);
  const data = Date.parse(s);
  if (Number.isNaN(data)) return null;
  return Math.min(Math.max(data - agoraMs, 0), 300_000);
}

/** O corpo JSON traz um objeto `error` (formato de erro do iFood)? Devolve o código, se houver. */
function erroNoCorpo(corpo: string): { tem: boolean; codigo: string | null } {
  try {
    const j = JSON.parse(corpo) as unknown;
    if (j && typeof j === 'object' && !Array.isArray(j) && 'error' in j) {
      const e = (j as { error: unknown }).error;
      const codigo = e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code.slice(0, 80) : null;
      return { tem: e !== null && e !== undefined && e !== false, codigo };
    }
  } catch {
    /* corpo que não é JSON: o tipo de conteúdo decide quem lê */
  }
  return { tem: false, codigo: null };
}

export function classificar(status: number, cabecalhos: Readonly<Record<string, string>>, corpo: string, agoraMs: number): Classificacao {
  if (status >= 200 && status < 300) {
    const e = erroNoCorpo(corpo);
    return e.tem ? { tipo: 'erro-no-corpo', codigo: e.codigo } : { tipo: 'ok' };
  }
  if (status === 401) return { tipo: 'nao-autenticado' };
  if (status === 403) return { tipo: 'sem-permissao' };
  if (status === 400 || status === 422) return { tipo: 'requisicao-invalida' };
  if (status === 404) return { tipo: 'nao-encontrado' };
  if (status === 429) return { tipo: 'limite', esperarMs: lerRetryAfter(cabecalhos['retry-after'], agoraMs) };
  if (status >= 500 && status < 600) return { tipo: 'indisponivel' };
  return { tipo: 'inesperado' };
}

/** Repetir vale a pena? Só limite e indisponibilidade (o 401 tem regra própria: um token novo, uma vez). */
export function repetivel(c: Classificacao): boolean {
  return c.tipo === 'limite' || c.tipo === 'indisponivel';
}

/** Espera antes da tentativa `n` (2, 3...): 1 s, 2 s, 4 s... até 30 s, com sorteio entre metade e o total (jitter). */
export function esperaDoBackoff(tentativa: number, aleatorio: () => number = Math.random): number {
  const teto = Math.min(1000 * 2 ** Math.max(tentativa - 2, 0), 30_000);
  return Math.round(teto / 2 + (teto / 2) * Math.min(Math.max(aleatorio(), 0), 1));
}

/** A frase para a tela e o registro (sem dado sensível). */
export const FRASE_DA_CLASSIFICACAO: Record<Classificacao['tipo'], string> = {
  ok: 'Leitura feita.',
  'nao-autenticado': 'O iFood recusou a autenticação do app (credencial ou token). Confira o segredo no cofre.',
  'sem-permissao': 'O iFood negou acesso: a loja não autorizou o app ou o módulo não está liberado nele. O módulo foi pausado.',
  'requisicao-invalida': 'O iFood recusou o pedido como inválido. Nada foi repetido; o pedido precisa ser corrigido.',
  'nao-encontrado': 'O iFood não encontrou o que foi pedido. Isso não é zero.',
  limite: 'Limite de chamadas do iFood atingido; a leitura espera e tenta de novo.',
  indisponivel: 'O iFood não respondeu como devia (fora do ar ou lento); a leitura tenta de novo mais tarde.',
  'erro-no-corpo': 'O iFood respondeu com erro no conteúdo. A leitura não foi aceita.',
  inesperado: 'Resposta inesperada do iFood. A leitura não foi aceita.',
};
