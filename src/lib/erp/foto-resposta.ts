/**
 * Resposta HTTP da foto de uma ficha técnica, comum à rota do nível 1 e à da
 * pessoa do parceiro. Quem chama já resolveu o contexto (sessão + parceiro);
 * aqui a ficha é lida PELO PORTÃO do parceiro da sessão: id de ficha de outro
 * parceiro não é achado (404), e o arquivo sai da pasta DESTE parceiro.
 *
 * Só imagem conferida na entrada (JPEG/PNG/WebP), com o tipo gravado,
 * `nosniff` e CSP fechada: nem um arquivo forjado no disco vira página.
 */

import type { ClienteDoParceiro } from './tenant';
import { fotoDaFicha } from './fichas';
import { abrirFoto } from './arquivos';

export async function responderFoto(cliente: ClienteDoParceiro, fichaId: string, podeVer: boolean): Promise<Response> {
  if (!podeVer) return new Response('Sem acesso.', { status: 403 });
  const foto = await fotoDaFicha(cliente, String(fichaId));
  if (!foto) return new Response('Foto não encontrada.', { status: 404 });
  const aberta = await abrirFoto(cliente.parceiroId, foto.arquivo);
  if (!aberta) return new Response('Foto não encontrada.', { status: 404 });
  return new Response(aberta.corpo, {
    headers: {
      'Content-Type': foto.mime,
      'Content-Length': String(aberta.tamanho),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      // Privada (nunca em cache compartilhado). A URL leva a versão da foto (?v=), então trocar a foto troca a URL.
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
