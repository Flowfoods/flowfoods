/** Um número JSON do Financial conserva o literal recebido, inclusive além da precisão de Number. */
export class NumeroJsonFinancial {
  constructor(readonly literal: string) {}
}

const maxBytes = 2 * 1024 * 1024;
const invalido = () => new Error('Resposta JSON Financial incompatível ou acima do limite local.');

/** Valida chaves antes de JSON.parse sobrescrever duplicatas. Só a API nativa interpreta os valores. */
export function lerJsonFinancialV3(texto: string): unknown {
  if (typeof texto !== 'string' || texto.length > maxBytes || Buffer.byteLength(texto, 'utf8') > maxBytes) throw invalido();
  try {
    const niveis: (Set<string> | null)[] = [];
    for (let pos = 0; pos < texto.length; pos++) {
      const token = texto[pos];
      if (token === '{' || token === '[') {
        if (niveis.length >= 32) throw invalido();
        niveis.push(token === '{' ? new Set() : null);
      } else if (token === '}' || token === ']') {
        niveis.pop();
      } else if (token === '"') {
        const inicio = pos++;
        while (pos < texto.length && texto[pos] !== '"') {
          if (texto[pos] === '\\') pos++;
          pos++;
        }
        if (pos >= texto.length) throw invalido();
        let seguinte = pos + 1;
        while (seguinte < texto.length && /\s/.test(texto[seguinte])) seguinte++;
        if (texto[seguinte] === ':') {
          const chaves = niveis.at(-1);
          if (!chaves) throw invalido();
          const chave: string = JSON.parse(texto.slice(inicio, pos + 1));
          if (chaves.has(chave)) throw invalido();
          chaves.add(chave);
        }
      }
    }
    return JSON.parse(texto, (_chave: string, valor: unknown, contexto?: { source?: string }) => {
      if (typeof valor !== 'number') return valor;
      if (typeof contexto?.source !== 'string') throw invalido();
      return new NumeroJsonFinancial(contexto.source);
    });
  } catch {
    // Erros nativos podem incluir parte do corpo. O consumidor só recebe a mensagem fixa.
    throw invalido();
  }
}
