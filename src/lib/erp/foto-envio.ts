/**
 * Envio da foto da ficha técnica (herança da 1.2): rota própria, fora das
 * server actions. Antes, a foto ia junto do formulário e o Next lia o corpo
 * inteiro (até 9 MB, limite GLOBAL) antes de qualquer conferência de sessão.
 * Agora as server actions voltam ao padrão (1 MB) e só esta rota aceita
 * arquivo grande, e na ordem certa:
 *
 *   1. sessão (sem ela: 401), "criar e editar fichas" (403), parceiro ativo
 *      (403) e origem do pedido (403) — SEM ler o corpo;
 *   2. tamanho declarado (Content-Length obrigatório, até 8 MB) — ainda sem ler;
 *   3. leitura com teto (corta no byte 8 MB + 1, mesmo se o tamanho mentir);
 *   4. tipo pelos bytes e regravação sem metadados (`prepararFoto`);
 *   5. disco, em `pendentes/` do parceiro DA SESSÃO, com nome sorteado.
 *
 * Devolve só o nome sorteado; o formulário manda o nome e a action leva a
 * foto para o lugar (`fichas.ts`). Quem chama resolve o contexto sem
 * redirecionar (null = sem sessão).
 */

import type { ContextoDoParceiro } from './contexto-base';
import { pode } from './permissoes';
import { LIMITE_DA_FOTO, prepararFoto } from './foto';
import { faxinarPendentes, salvarFoto } from './arquivos';

const resposta = (status: number, corpo: Record<string, string>) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

/** O pedido veio desta mesma origem? Sem Origin (cliente que não é navegador) passa: ele não carrega o cookie de ninguém. */
function mesmaOrigem(req: Request): boolean {
  const origem = req.headers.get('origin');
  if (!origem) return true;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return !!host && new URL(origem).host === host;
  } catch {
    return false;
  }
}

/** Lê o corpo até `teto` bytes; passou disso, corta e devolve null. */
async function lerComTeto(req: Request, teto: number): Promise<Uint8Array | null> {
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

export const MENSAGEM_SEM_SESSAO_NO_ENVIO = 'Sua sessão terminou. Entre de novo para enviar a foto.';

export async function receberFotoDaFicha(req: Request, ctx: Pick<ContextoDoParceiro, 'alcance' | 'bloqueio' | 'parceiro'> | null): Promise<Response> {
  if (!ctx) return resposta(401, { erro: MENSAGEM_SEM_SESSAO_NO_ENVIO });
  if (!pode(ctx.alcance, 'fichas.editar')) return resposta(403, { erro: 'Seu acesso não inclui criar e editar fichas técnicas.' });
  if (ctx.bloqueio) return resposta(403, { erro: ctx.bloqueio });
  if (!mesmaOrigem(req)) return resposta(403, { erro: 'Envio recusado: pedido de fora do sistema.' });

  const declarado = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declarado) || declarado <= 0) return resposta(411, { erro: 'A foto chegou sem tamanho. Escolha de novo.' });
  if (declarado > LIMITE_DA_FOTO) return resposta(413, { erro: 'Foto acima de 8 MB. Tire outra ou reduza antes de enviar.' });

  const bytes = await lerComTeto(req, LIMITE_DA_FOTO);
  if (!bytes) return resposta(413, { erro: 'Foto acima de 8 MB. Tire outra ou reduza antes de enviar.' });
  const pronta = prepararFoto(bytes);
  if (!pronta.ok) return resposta(422, { erro: pronta.erro });

  void faxinarPendentes(ctx.parceiro.id);
  const arquivo = await salvarFoto(ctx.parceiro.id, pronta.bytes, pronta.extensao, true);
  return resposta(201, { arquivo });
}
