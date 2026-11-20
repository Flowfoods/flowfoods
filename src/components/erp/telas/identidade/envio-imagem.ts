import { LIMITE_DA_FOTO } from '@/lib/erp/foto';

/** Conferência de conforto; o servidor valida os bytes, as dimensões e a permissão. */
export function erroDaEscolha(arquivo: Pick<File, 'size' | 'type'>): string | null {
  if (!arquivo.size) return 'O arquivo está vazio. Escolha outra imagem.';
  if (arquivo.size > LIMITE_DA_FOTO) return 'Use uma imagem de até 8 MB.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) return 'Use uma imagem em JPG, PNG ou WebP.';
  return null;
}

export async function gravarImagem(url: string, arquivo: File | null, signal: AbortSignal): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const resposta = await fetch(url, {
      method: arquivo ? 'POST' : 'DELETE',
      ...(arquivo ? { body: arquivo, headers: { 'Content-Type': arquivo.type } } : {}),
      signal,
      credentials: 'same-origin',
    });
    const dados = await resposta.json().catch(() => null) as { ok?: boolean; erro?: string } | null;
    if (resposta.ok && dados?.ok === true) return { ok: true };
    return { ok: false, erro: typeof dados?.erro === 'string' ? dados.erro : 'Não foi possível confirmar a alteração. Tente novamente.' };
  } catch {
    return { ok: false, erro: 'Não foi possível confirmar a alteração. Confira sua conexão e tente novamente.' };
  }
}
