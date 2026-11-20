/** Rotas privadas: autenticam e autorizam antes de ler o corpo; apenas bytes locais, nunca URLs. */
import type { ContextoDoParceiro, SessaoErp } from './contexto-base';
import type { SessaoValida } from './credenciais';
import { lerComTeto } from './corpo-limitado';
import { LIMITE_DA_FOTO, TIPOS_DE_FOTO } from './foto';
import { apagarImagemIdentidade, lerImagemIdentidade, salvarImagemIdentidade } from './identidade-arquivos';
import { prepararImagemIdentidade } from './identidade-imagem';
import { recursoDaFotoNivel1, recursoDaFotoPessoal, recursoDaLogo, type RecursoDeIdentidade } from './identidade';
import { pode } from './permissoes';
import { ErroDeTenant } from './tenant';

export const CABECALHOS_IDENTIDADE = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; sandbox",
} as const;

const erro = (status: number, mensagem: string) => Response.json({ ok: false, erro: mensagem }, { status, headers: CABECALHOS_IDENTIDADE });
const escrita = (req: Request) => req.method === 'POST' || req.method === 'DELETE';

/** Comparação exata de protocolo, host e porta; sem confiar em host encaminhado pelo cliente. */
export function origemDaIdentidadeValida(req: Request): boolean {
  const origem = req.headers.get('origin');
  if (!origem || (req.headers.has('sec-fetch-site') && req.headers.get('sec-fetch-site') !== 'same-origin')) return false;
  try {
    const recebida = new URL(origem);
    const esperada = new URL(process.env.NEXTAUTH_URL || req.url);
    return recebida.origin !== 'null' && origem === recebida.origin && recebida.origin === esperada.origin;
  } catch { return false; }
}

function conferirEscrita(req: Request): Response | null {
  if (!escrita(req)) return null;
  return origemDaIdentidadeValida(req) ? null : erro(403, 'Pedido recusado: use o perfil neste mesmo sistema.');
}

async function operarImagem(req: Request, recurso: RecursoDeIdentidade | null): Promise<Response> {
  if (!recurso) return erro(404, 'Imagem não encontrada.');
  if (req.method === 'GET') {
    if (!recurso.arquivo) return erro(404, 'Imagem não encontrada.');
    const bytes = await lerImagemIdentidade(recurso.dono, recurso.arquivo);
    const foto = bytes ? prepararImagemIdentidade(bytes) : null;
    if (!foto?.ok || !recurso.arquivo.endsWith(`.${foto.extensao}`)) return erro(404, 'Imagem não encontrada.');
    return new Response(new Uint8Array(foto.bytes), { headers: { ...CABECALHOS_IDENTIDADE, 'Content-Type': foto.mime, 'Content-Length': String(foto.bytes.length), 'Content-Disposition': 'inline' } });
  }
  if (!escrita(req)) return erro(405, 'Método não permitido.');
  let novo: string | null = null;
  try {
    if (req.method === 'POST') {
      const tipo = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!Object.values(TIPOS_DE_FOTO).some((t) => t === tipo)) return erro(415, 'Envie diretamente uma imagem JPG, PNG ou WebP.');
      const tamanho = req.headers.get('content-length');
      if (!tamanho || !/^[0-9]+$/.test(tamanho) || Number(tamanho) <= 0) return erro(411, 'A imagem chegou sem tamanho. Escolha de novo.');
      const declarado = Number(tamanho);
      if (!Number.isSafeInteger(declarado) || declarado > LIMITE_DA_FOTO) return erro(413, 'A imagem deve ter até 8 MB.');
      const bytes = await lerComTeto(req, LIMITE_DA_FOTO);
      if (!bytes) return erro(413, 'A imagem deve ter até 8 MB.');
      if (bytes.length !== declarado) return erro(400, 'O tamanho da imagem não corresponde ao envio. Escolha de novo.');
      const foto = prepararImagemIdentidade(bytes);
      if (!foto.ok) return erro(422, foto.erro);
      if (foto.mime !== tipo) return erro(422, 'O formato da imagem não corresponde ao arquivo enviado.');
      novo = await salvarImagemIdentidade(recurso.dono, foto.bytes, foto.extensao);
    }
    const gravacao = await recurso.trocar(novo);
    if (gravacao !== 'ok') {
      await apagarImagemIdentidade(recurso.dono, novo);
      return gravacao === 'sessao' ? erro(401, 'Sua sessão terminou. Entre novamente.') : erro(409, 'A imagem mudou em outra aba. Atualize a página antes de tentar novamente.');
    }
    await apagarImagemIdentidade(recurso.dono, recurso.arquivo);
    return Response.json({ ok: true }, { headers: CABECALHOS_IDENTIDADE });
  } catch (e) {
    await apagarImagemIdentidade(recurso.dono, novo);
    if (e instanceof ErroDeTenant) return erro(403, 'Não foi possível alterar a imagem neste contexto.');
    return erro(500, 'Não foi possível salvar a imagem. A imagem anterior foi preservada; tente novamente.');
  }
}

export async function responderLogoDaMarca(req: Request, ctx: ContextoDoParceiro | null, marcaId: string): Promise<Response> {
  if (!ctx) return erro(401, 'Sua sessão terminou. Entre novamente.');
  if (escrita(req) && (!pode(ctx.alcance, 'lojas.gerir') || ctx.bloqueio)) return erro(403, ctx.bloqueio || 'Seu acesso não permite alterar a identidade da marca.');
  const recusa = conferirEscrita(req);
  if (recusa) return recusa;
  return operarImagem(req, await recursoDaLogo(ctx, marcaId));
}

export async function responderFotoDaPessoa(req: Request, sessao: SessaoValida | null): Promise<Response> {
  if (!sessao) return erro(401, 'Sua sessão terminou. Entre novamente.');
  const recusa = conferirEscrita(req);
  if (recusa) return recusa;
  return operarImagem(req, recursoDaFotoPessoal(sessao));
}

export async function responderFotoNivel1(req: Request, sessao: SessaoErp | null): Promise<Response> {
  if (!sessao) return erro(401, 'Sua sessão terminou. Entre novamente.');
  const recusa = conferirEscrita(req);
  if (recusa) return recusa;
  return operarImagem(req, await recursoDaFotoNivel1(sessao));
}
