import { createHash } from 'node:crypto';

/**
 * O token de setup vale uma vez. Para redefinir a senha, o Rodolfo troca o
 * `ADMIN_SETUP_TOKEN` no painel do Dokploy e faz o redeploy: um token que
 * nunca foi usado abre o setup de novo, mesmo já existindo admin com senha.
 *
 * O que fica no banco é só o hash do token usado (no audit do setup), nunca o
 * token. A mesma regra vive em `scripts/imprimir-setup.mjs`, que é JS puro e
 * roda antes do Next: se mudar aqui, mude lá.
 */

/**
 * Eventos do audit que carregam o hash do token usado. O segundo é o registro
 * que `scripts/imprimir-setup.mjs` grava no boot quando o admin foi criado
 * antes desta regra: o token em vigor naquele boot é o que criou a senha.
 */
export const EVENTOS_TOKEN_USADO = ['admin_senha_definida', 'admin_setup_token_registrado'];

export const ERRO_TOKEN_USADO =
  'Este token já foi usado. Para redefinir a senha, troque o ADMIN_SETUP_TOKEN no Dokploy (serviço web → Environment), faça o redeploy e abra este endereço com o token novo.';

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Já existe admin com senha: o token atual pode abrir o setup de novo?
 *
 * Só se o último setup registrou um hash e ele é diferente do atual. Registro
 * antigo sem hash, ou nenhum registro, conta como "usado": o token que criou a
 * primeira senha, antes desta regra existir, não volta a valer.
 */
export function tokenJaUsado(hashAtual: string, ultimoSetup: unknown): boolean {
  if (!ultimoSetup || typeof ultimoSetup !== 'object') return true;
  const gravado = (ultimoSetup as { tokenHash?: unknown }).tokenHash;
  return typeof gravado === 'string' ? gravado === hashAtual : true;
}
