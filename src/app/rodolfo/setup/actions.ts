'use server';

/**
 * Primeiro acesso: o Rodolfo define a própria senha.
 *
 * O `ADMIN_SETUP_TOKEN` existe só no env do Dokploy. Depois que a senha existe,
 * o setup para de funcionar — a checagem é "já existe admin com senha?", que é
 * estado do banco, não uma flag que alguém possa reverter no .env.
 *
 * A senha não é escrita em lugar nenhum: nem em log, nem em relatório, nem no
 * audit (que registra só o evento).
 */

import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

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

  // Token usado uma vez: se já existe admin COM senha, o setup está encerrado.
  const jaConfigurado = await prisma.user.findFirst({ where: { senhaHash: { not: null } } });
  if (jaConfigurado) {
    return { ok: false, erro: 'A senha já foi definida. Use o login.' };
  }

  const senhaHash = await bcrypt.hash(senha, 12);

  await prisma.user.upsert({
    where: { email },
    create: { email, senhaHash, role: 'ADMIN' },
    update: { senhaHash },
  });

  await prisma.auditLog.create({
    data: { evento: 'admin_senha_definida', dados: { email } },
  });

  return { ok: true };
}
