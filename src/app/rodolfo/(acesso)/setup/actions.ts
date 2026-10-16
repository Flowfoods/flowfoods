'use server';

/**
 * Definir (ou redefinir) a senha do Rodolfo.
 *
 * O `ADMIN_SETUP_TOKEN` existe só no env do Dokploy e vale uma vez: o setup
 * grava o hash do token usado e recusa o mesmo token dali em diante. Para
 * redefinir a senha, basta trocar o token no painel e fazer o redeploy — ver
 * `src/lib/rodolfo/setup-token.ts`.
 *
 * A senha não é escrita em lugar nenhum: nem em log, nem em relatório, nem no
 * audit (que registra só o evento e o hash do token).
 */

import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ERRO_TOKEN_USADO, EVENTOS_TOKEN_USADO, hashDoToken, tokenJaUsado } from '@/lib/rodolfo/setup-token';

const MIN_SENHA = 12;

export interface ResultadoSetup {
  ok: boolean;
  erro?: string;
}

function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function definirSenha(_anterior: unknown, form: FormData): Promise<ResultadoSetup> {
  const token = String(form.get('token') ?? '');
  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  const senha = String(form.get('senha') ?? '');
  const confirmacao = String(form.get('confirmacao') ?? '');

  const esperado = process.env.ADMIN_SETUP_TOKEN ?? '';
  if (!esperado) return { ok: false, erro: 'ADMIN_SETUP_TOKEN não configurado no servidor.' };
  if (!token || !tokenConfere(token, esperado)) return { ok: false, erro: 'Token inválido.' };

  if (!email.includes('@')) return { ok: false, erro: 'E-mail inválido.' };
  if (senha.length < MIN_SENHA) {
    return { ok: false, erro: `A senha precisa de pelo menos ${MIN_SENHA} caracteres.` };
  }
  if (senha !== confirmacao) return { ok: false, erro: 'As senhas não conferem.' };

  const tokenHash = hashDoToken(esperado);

  // Token usado uma vez: com admin já configurado, só um token NOVO reabre o setup.
  const admin = await prisma.user.findFirst({
    where: { senhaHash: { not: null } },
    orderBy: { criadoEm: 'asc' },
  });
  if (admin) {
    const ultimo = await prisma.auditLog.findFirst({
      where: { evento: { in: EVENTOS_TOKEN_USADO } },
      orderBy: { criadoEm: 'desc' },
    });
    if (tokenJaUsado(tokenHash, ultimo?.dados)) return { ok: false, erro: ERRO_TOKEN_USADO };
  }

  const senhaHash = await bcrypt.hash(senha, 12);

  try {
    // Redefinição troca a senha (e o e-mail, se ele digitou outro) do admin que
    // já existe. Um usuário só: nunca nasce um segundo admin por aqui.
    const user = admin
      ? await prisma.user.update({ where: { id: admin.id }, data: { email, senhaHash } })
      : await prisma.user.upsert({
          where: { email },
          create: { email, senhaHash, role: 'ADMIN' },
          update: { senhaHash },
        });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        evento: 'admin_senha_definida',
        dados: { email, tokenHash, redefinicao: Boolean(admin) },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, erro: 'Já existe outro usuário com esse e-mail.' };
    }
    throw e;
  }

  return { ok: true };
}
