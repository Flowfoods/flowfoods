import type { Metadata } from 'next';

/**
 * Espaço do Rodolfo (nível 1). Este layout só põe o que vale para tudo sob
 * /rodolfo. A casca fica nos grupos de rota:
 *
 * - `(painel)`: o shell do ERP (menu lateral, barra superior), exige sessão;
 * - `(acesso)`: login e definição de senha, FORA do shell — o shell exige
 *   sessão, e envolver o login nele seria um laço.
 */
export const metadata: Metadata = {
  title: 'Espaço do Rodolfo — FlowFoods',
  // Área privada não entra em buscador, nem por acidente.
  robots: 'noindex, nofollow, noarchive',
};

export default function RodolfoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
