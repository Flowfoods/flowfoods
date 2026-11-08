/** JSON marginal estrito: contagens/metadata inteiras, não usar no contrato monetário diário. */
import { ErroContratoAnalytics } from './analytics';
function exigir(ok: unknown, mensagem: string): asserts ok {
  if (!ok) throw new ErroContratoAnalytics('CONSULTA_INCOMPATIVEL', mensagem);
}
const unicodeValido = (s: string) => !/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s);

/** JSON.parse não detecta chaves repetidas. Após validar a sintaxe, este percurso conserva cada chave textual. */
function conferirChavesDoJson(raw: string): void {
  let p = 0, nos = 0;
  const espacos = () => { while (/\s/.test(raw[p] ?? '') && p < raw.length) p++; };
  const texto = () => {
    const inicio = p++;
    while (p < raw.length) { if (raw[p] === '\\') p += 2; else if (raw[p++] === '"') break; }
    return JSON.parse(raw.slice(inicio, p)) as string;
  };
  const numeroExato = (literal: string) => {
    // Todos os números do contrato v1 são inteiros. Provar isso ANTES de aceitar o arredondamento de JSON.parse.
    exigir(literal.length <= 128, 'Representação numérica fora do limite local.');
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(literal);
    exigir(m, 'Número marginal inválido.');
    const expoente = Number(m[4] ?? 0), escala = (m[3]?.length ?? 0) - expoente;
    exigir(Number.isSafeInteger(expoente) && Math.abs(escala) <= 256, 'Representação numérica fora do limite local.');
    let n = BigInt(m[2] + (m[3] ?? ''));
    if (escala > 0) { const divisor = 10n ** BigInt(escala); exigir(n % divisor === 0n, 'Contagem fracionária no corpo original.'); n /= divisor; }
    else n *= 10n ** BigInt(-escala);
    if (m[1]) n = -n;
    exigir(n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER)
      && BigInt(Number(literal)) === n, 'Contagem sem representação inteira exata.');
  };
  const valor = (nivel: number): void => {
    exigir(nivel <= 32 && ++nos <= 250_000, 'Resposta marginal excede os limites estruturais.'); espacos();
    if (raw[p] === '{') {
      p++; espacos(); const chaves = new Set<string>();
      if (raw[p] === '}') { p++; return; }
      while (p < raw.length) {
        espacos(); const chave = texto();
        exigir(!chaves.has(chave) && unicodeValido(chave), 'Chave JSON repetida ou inválida.'); chaves.add(chave);
        espacos(); p++; valor(nivel + 1); espacos(); if (raw[p++] === '}') return;
      }
    } else if (raw[p] === '[') {
      p++; espacos(); if (raw[p] === ']') { p++; return; }
      while (p < raw.length) { valor(nivel + 1); espacos(); if (raw[p++] === ']') return; }
    } else if (raw[p] === '"') exigir(unicodeValido(texto()), 'Texto JSON inválido.');
    else {
      const inicio = p; while (p < raw.length && !/[\s,\]}]/.test(raw[p])) p++;
      const literal = raw.slice(inicio, p); if (/^-?\d/.test(literal)) numeroExato(literal);
    }
  };
  valor(0);
}

export function lerJsonMarginalExato(raw: string): unknown {
  exigir(typeof raw === 'string' && new TextEncoder().encode(raw).length <= 2 * 1024 * 1024, 'Corpo marginal fora dos limites.');
  let corpo: unknown;
  try { corpo = JSON.parse(raw); } catch { throw new ErroContratoAnalytics('ESQUEMA', 'Corpo marginal não é JSON válido.'); }
  conferirChavesDoJson(raw);
  return corpo;
}
