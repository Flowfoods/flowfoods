/**
 * Autenticação do `/rodolfo`.
 *
 * Um usuário, role ADMIN, credenciais. A senha nunca é escrita em lugar nenhum:
 * o Rodolfo define em `/rodolfo/setup?token=...`, e o token só existe no env do
 * Dokploy e é invalidado no uso.
 */

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

/** Janela e teto de tentativas de login por e-mail. */
const LOGIN_JANELA_MS = 15 * 60 * 1000;
const LOGIN_MAX_TENTATIVAS = 5;

/**
 * Rate limit em memória.
 *
 * Suficiente para um portal de um usuário só: com uma instância, o mapa É o
 * estado. Se um dia o `web` rodar com réplicas, isto precisa ir para o Redis —
 * senão cada réplica conta separado e o teto efetivo multiplica.
 */
const tentativas = new Map<string, { n: number; desde: number }>();

function excedeuTentativas(email: string): boolean {
  const agora = Date.now();
  const atual = tentativas.get(email);

  if (!atual || agora - atual.desde > LOGIN_JANELA_MS) {
    tentativas.set(email, { n: 1, desde: agora });
    return false;
  }

  atual.n += 1;
  return atual.n > LOGIN_MAX_TENTATIVAS;
}

function limparTentativas(email: string): void {
  tentativas.delete(email);
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: '/rodolfo/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        senha: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const senha = credentials?.senha;
        if (!email || !senha) return null;

        if (excedeuTentativas(email)) {
          await prisma.auditLog.create({
            data: { evento: 'login_bloqueado_rate_limit', dados: { email } },
          });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // Compara sempre, mesmo sem usuário: sem isso o tempo de resposta
        // denuncia quais e-mails existem.
        const hash = user?.senhaHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
        const ok = await bcrypt.compare(senha, hash);

        if (!user || !user.senhaHash || !ok) {
          await prisma.auditLog.create({
            data: { evento: 'login_falhou', dados: { email } },
          });
          return null;
        }

        limparTentativas(email);
        await prisma.$transaction([
          prisma.user.update({ where: { id: user.id }, data: { ultimoLogin: new Date() } }),
          prisma.auditLog.create({
            data: { userId: user.id, evento: 'login_ok', dados: { email } },
          }),
        ]);

        return { id: user.id, email: user.email, name: 'Rodolfo' };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
};
