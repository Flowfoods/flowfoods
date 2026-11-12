/** Interrompe a leitura no teto mesmo quando o tamanho declarado não corresponde ao corpo. */
export async function lerComTeto(req: Request, teto: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const leitor = req.body?.getReader();
  if (!leitor) return new Uint8Array();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > teto) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    tudo.set(p, i);
    i += p.length;
  }
  return tudo;
}
