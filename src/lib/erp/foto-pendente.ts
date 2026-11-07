/** Prévia privada da foto já enviada, enquanto o rascunho ainda não foi salvo. */
import { open } from 'node:fs/promises';
import type { ContextoDoParceiro } from './contexto-base';
import { caminhoDaFoto } from './arquivos';
import { LIMITE_DA_FOTO, NOME_DA_FOTO, TIPOS_DE_FOTO, tipoPelosBytes, type ExtensaoDaFoto } from './foto';
import { pode } from './permissoes';

type ContextoDaPrevia = Pick<ContextoDoParceiro, 'alcance' | 'bloqueio'> & {
  parceiro: Pick<ContextoDoParceiro['parceiro'], 'id'>;
};
const CABECALHOS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const UM_DIA = 24 * 60 * 60 * 1000;
const erro = (status: number, mensagem: string) => new Response(JSON.stringify({ erro: mensagem }), {
  status,
  headers: { ...CABECALHOS, 'Content-Type': 'application/json; charset=utf-8' },
});
const indisponivel = () => erro(404, 'A foto enviada não está mais disponível. Escolha a foto de novo; os demais campos continuam preenchidos.');

/**
 * O contexto é resolvido a cada GET, antes de olhar o token ou o disco. Só lê
 * pendentes do parceiro autorizado, nunca busca um arquivo definitivo como
 * fallback. A leitura não assume, renova, move nem apaga o arquivo.
 */
export async function responderFotoPendente(req: Request, ctx: ContextoDaPrevia | null): Promise<Response> {
  if (!ctx) return erro(401, 'Sua sessão terminou. Entre de novo para conferir a foto.');
  if (!pode(ctx.alcance, 'fichas.editar')) return erro(403, 'Seu acesso não inclui criar e editar fichas técnicas.');
  if (ctx.bloqueio) return erro(403, ctx.bloqueio);

  const nomes = new URL(req.url).searchParams.getAll('arquivo');
  if (nomes.length !== 1 || !NOME_DA_FOTO.test(nomes[0])) return indisponivel();
  const arquivo = nomes[0];
  let aberta: Awaited<ReturnType<typeof open>> | undefined;
  try {
    aberta = await open(caminhoDaFoto(ctx.parceiro.id, arquivo, undefined, true), 'r');
    const dados = await aberta.stat();
    if (!dados.isFile() || dados.size < 1 || dados.size > LIMITE_DA_FOTO || Date.now() - dados.mtimeMs > UM_DIA) return indisponivel();
    // O descritor fixa o arquivo da leitura mesmo se a gravação o mover depois.
    // O teto já foi conferido antes de alocar; os uploads são arquivos imutáveis.
    const bytes = await aberta.readFile();
    const extensao = arquivo.slice(arquivo.lastIndexOf('.') + 1) as ExtensaoDaFoto;
    if (bytes.length !== dados.size || tipoPelosBytes(bytes) !== extensao) return indisponivel();
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { ...CABECALHOS, 'Content-Type': TIPOS_DE_FOTO[extensao], 'Content-Length': String(bytes.length) },
    });
  } catch {
    // Ausência, expiração, token alheio e falha de leitura não revelam caminhos.
    return indisponivel();
  } finally {
    await aberta?.close();
  }
}
