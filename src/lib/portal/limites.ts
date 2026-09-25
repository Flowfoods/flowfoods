/**
 * Limites e formatação que a TELA também usa. Separado de `arquivos.ts` porque
 * aquele importa `node:path` e não pode entrar no bundle do navegador.
 */

/** 50 MB: planilha de 12 meses e material de marca cabem com folga. */
export const LIMITE_BYTES = 50 * 1024 * 1024;

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
