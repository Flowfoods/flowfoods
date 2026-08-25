export { default } from 'next-auth/middleware';

/**
 * Tudo sob /rodolfo exige sessao — menos /rodolfo/login (que seria um laco) e
 * /rodolfo/setup (que se autentica pelo ADMIN_SETUP_TOKEN, e existe justamente
 * porque ainda nao ha senha).
 *
 * O site institucional nao passa por aqui: o matcher e so o /rodolfo.
 */
export const config = {
  matcher: ['/rodolfo/((?!login|setup).*)', '/rodolfo'],
};
