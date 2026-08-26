/**
 * Normalização de texto para COMPARAÇÃO — nunca para exibição.
 *
 * Mora num arquivo só porque já existiu em três: o dono digita "Tijuca",
 * "tijuca" e "TIJUCA", e cada cópia da regra era uma chance de uma delas
 * esquecer um caso. A faixa dos diacríticos vai em escape de propósito: o
 * caractere combinante literal é invisível no editor e some num "format on
 * save" sem deixar rastro no diff.
 */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/gu, "");
}

/** Minúsculo, sem acento e sem espaço sobrando. */
export function chaveDeComparacao(texto: string): string {
  return semAcento(texto).toLowerCase().replace(/\s+/gu, " ").trim();
}

/**
 * Normaliza um endereço colado à mão. Devolve `null` se nem assim vira URL.
 *
 * Existe porque o dono cola o que o aplicativo deu: `ifood.com.br/delivery/...`,
 * `www.ifood.com.br/...`, com espaço na ponta. Exigir `https://` de quem está
 * respondendo no celular, no intervalo, é reprovar gente por formalidade — e o
 * campo é OPCIONAL, então reprovar aqui custaria o formulário inteiro.
 */
export function normalizarUrl(entrada: string): string | null {
  const limpo = entrada.trim();
  if (limpo === '') return null;
  const comEsquema = /^https?:\/\//iu.test(limpo) ? limpo : `https://${limpo}`;
  try {
    const u = new URL(comEsquema);
    // Sem ponto no host não é endereço público: "https://minha loja" passaria.
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** E-mail plausível. Conferência de forma, não de existência. */
export function emailPlausivel(entrada: string): boolean {
  const v = entrada.trim();
  return v.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(v);
}
