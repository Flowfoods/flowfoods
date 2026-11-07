/**
 * Cliente iFood (INT-1.3, decisão 485) — o que cada resposta quer dizer, puro. Regras do iFood que viram código:
 *  - 401: token vencido ou recusado → um token novo e UMA nova tentativa; de novo 401, para (nunca uma tempestade de tokens);
 *  - 403: a loja não autorizou o app ou o módulo não está no app → NÃO repetir (consultar loja não autorizada é infração);
 *    esta classificação não altera o estado persistido do módulo;
 *  - 400/422: pedido inválido (também é infração) → não repetir; o montador da consulta tem de ser corrigido;
 *  - 404: não encontrado → não é zero nem "sem dado oficial";
 *  - 429: limite → preservar o Retry-After; só repetir se couber na espera local e no limite de tentativas;
 *  - 5xx, falha de rede e tempo esgotado: repetir com espera crescente, com limite;
 *  - 2xx com erro no corpo: erro de negócio, não sucesso.
 */

/** Prazo mínimo informado pelo provedor, não um agendamento. Só valores representáveis em JSON e Date. */
export type PrazoDeRetomada = { esperarMs: number; naoAntesDe: string };
export type LeituraDeRetryAfter =
  | { tipo: 'sem-prazo' }
  | { tipo: 'prazo'; prazo: PrazoDeRetomada }
  | { tipo: 'fora-da-faixa' };

export type Classificacao =
  | { tipo: 'ok' }
  | { tipo: 'nao-autenticado' }
  | { tipo: 'sem-permissao' }
  | { tipo: 'requisicao-invalida' }
  | { tipo: 'nao-encontrado' }
  | { tipo: 'limite'; prazo: PrazoDeRetomada | null }
  | { tipo: 'prazo-invalido' }
  | { tipo: 'indisponivel' }
  | { tipo: 'erro-no-corpo'; codigo: string | null }
  | { tipo: 'inesperado' }
  /** Recusada aqui, antes de sair: integração desligada ou app de produção sem homologação (decisão 487). */
  | { tipo: 'bloqueada' };

/**
 * Distingue ausência/sintaxe inválida de um prazo reconhecido que não cabe na representação. Só segundos inteiros ou data
 * HTTP (GMT); "1.5" e texto solto não viram data. Nunca encurta o prazo para caber no timer ou na espera local do cliente.
 */
export function lerRetryAfter(valor: string | null | undefined, agoraMs: number): LeituraDeRetryAfter {
  if (!valor) return { tipo: 'sem-prazo' };
  const s = valor.trim();
  let esperarMs: number;
  if (/^\d+$/.test(s)) {
    const segundos = Number(s);
    if (!Number.isSafeInteger(segundos)) return { tipo: 'fora-da-faixa' };
    esperarMs = segundos * 1000;
  } else {
    if (!/^[A-Za-z]{3,9},? .* GMT$|^[A-Za-z]{3} [A-Za-z]{3} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4,}$/.test(s)) return { tipo: 'sem-prazo' };
    // Date.parse devolve NaN tanto para texto inválido quanto para ano além do domínio de Date. O segundo não pode cair
    // no backoff curto de um header ausente. Preserva os formatos HTTP antigos já aceitos (incluindo ano de dois dígitos).
    const anoTexto = /[- ](\d+) \d{2}:\d{2}:\d{2} GMT$/.exec(s)?.[1] ?? / \d{2}:\d{2}:\d{2} (\d+)$/.exec(s)?.[1];
    const ano = anoTexto === undefined ? null : Number(anoTexto);
    if (ano !== null && (!Number.isSafeInteger(ano) || ano > 275_760)) return { tipo: 'fora-da-faixa' };
    const data = Date.parse(s);
    if (Number.isNaN(data)) return { tipo: ano === 275_760 ? 'fora-da-faixa' : 'sem-prazo' };
    esperarMs = Math.max(data - agoraMs, 0);
  }
  const retomarEm = agoraMs + esperarMs;
  if (!Number.isSafeInteger(agoraMs) || !Number.isSafeInteger(esperarMs) || !Number.isSafeInteger(retomarEm)
    || Math.abs(agoraMs) > 8_640_000_000_000_000 || Math.abs(retomarEm) > 8_640_000_000_000_000) return { tipo: 'fora-da-faixa' };
  return { tipo: 'prazo', prazo: { esperarMs, naoAntesDe: new Date(retomarEm).toISOString() } };
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
  if (status === 429) {
    const lido = lerRetryAfter(cabecalhos['retry-after'], agoraMs);
    return lido.tipo === 'fora-da-faixa' ? { tipo: 'prazo-invalido' } : { tipo: 'limite', prazo: lido.tipo === 'prazo' ? lido.prazo : null };
  }
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
  'sem-permissao': 'O iFood negou acesso. Confira a autorização da loja e os módulos liberados para o app. Não houve nova tentativa após a recusa.',
  'requisicao-invalida': 'O iFood recusou o pedido como inválido. Nada foi repetido; o pedido precisa ser corrigido.',
  'nao-encontrado': 'O iFood não encontrou o que foi pedido. Isso não é zero.',
  limite: 'Limite de chamadas do iFood atingido. Esta leitura terminou; nenhuma nova tentativa foi agendada.',
  'prazo-invalido': 'O iFood informou um prazo de retomada fora da faixa representável. Esta chamada terminou sem nova tentativa; confira a resposta antes de tentar novamente.',
  indisponivel: 'O iFood não respondeu como devia (fora do ar ou lento). Esta leitura terminou; nenhuma nova tentativa foi agendada.',
  'erro-no-corpo': 'O iFood respondeu com erro no conteúdo. A leitura não foi aceita.',
  inesperado: 'Resposta inesperada do iFood. A leitura não foi aceita.',
  bloqueada: 'Chamada não enviada: a integração está desligada ou o app de produção ainda não foi homologado.',
};
