/** Lê instantes ISO já validados, preservando as casas abaixo do milissegundo. */
export function lerInstante(valor: string) {
  const fracao = valor.match(/\.(\d+)/)?.[1] ?? '';
  return { milissegundos: Date.parse(valor), fracaoDoMilissegundo: fracao.slice(3).replace(/0+$/, '') };
}

type Instante = ReturnType<typeof lerInstante>;

export function compararInstantes(a: Instante, b: Instante) {
  if (a.milissegundos !== b.milissegundos) return a.milissegundos - b.milissegundos;
  const digitos = Math.max(a.fracaoDoMilissegundo.length, b.fracaoDoMilissegundo.length);
  const esquerda = a.fracaoDoMilissegundo.padEnd(digitos, '0');
  const direita = b.fracaoDoMilissegundo.padEnd(digitos, '0');
  if (esquerda === direita) return 0;
  return esquerda < direita ? -1 : 1;
}
