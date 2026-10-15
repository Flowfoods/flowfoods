/**
 * Nome do cookie da sessão do ERP do parceiro. Sem import de banco nem de Node:
 * o middleware (edge) também lê daqui.
 *
 * É OUTRO cookie, não o do next-auth do /rodolfo: a sessão de uma pessoa do
 * parceiro não abre o /rodolfo (o middleware de lá só aceita o JWT do
 * next-auth) e a do Rodolfo não abre o /erp (que só aceita este cookie,
 * validado no banco a cada requisição).
 *
 * Em https o nome leva o prefixo `__Host-`: o navegador só aceita o cookie se
 * vier com Secure, Path=/ e sem Domain (nenhum subdomínio planta sessão).
 */

export const COOKIE_DO_ERP = 'ff_erp';
export const COOKIE_DO_ERP_SEGURO = '__Host-ff_erp';

/** O site roda em https? (mesma regra do next-auth: olha o endereço configurado.) */
export function sessaoSegura(env: Record<string, string | undefined> = process.env): boolean {
  return (env.ERP_WEBAUTHN_ORIGIN || env.NEXTAUTH_URL || '').startsWith('https://');
}

export function nomeDoCookie(env?: Record<string, string | undefined>): string {
  return sessaoSegura(env) ? COOKIE_DO_ERP_SEGURO : COOKIE_DO_ERP;
}
