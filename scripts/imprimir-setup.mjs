/**
 * Roda no start do `web`, depois da migration e antes do Next.
 *
 * Imprime o link de setup — com o token — no log do container quando ele
 * serve para alguma coisa:
 *
 *   - ainda não existe admin com senha (primeiro acesso), ou
 *   - existe, mas o ADMIN_SETUP_TOKEN atual nunca foi usado (o Rodolfo trocou
 *     o token no painel para redefinir a senha).
 *
 * É assim que o Rodolfo pega o link sem precisar de terminal: o log do Dokploy
 * é visível no navegador, que é o único acesso que ele declarou ter.
 *
 * Por que isso não é vazar segredo: o token vale uma vez — o setup grava o
 * hash do token usado e recusa o mesmo token dali em diante (a regra está em
 * `src/lib/rodolfo/setup-token.ts`; a cópia aqui é porque este script é JS
 * puro e roda antes do Next). Depois do setup este script imprime só "admin
 * configurado", nunca o token. E o log do Dokploy só é visível para quem já
 * está autenticado no painel — quem lê o log já administra a VPS inteira.
 *
 * Nunca derruba o start: qualquer erro aqui vira aviso, porque um portal no ar
 * sem esta mensagem é melhor que um portal que não sobe por causa dela.
 */

import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const linha = '─'.repeat(68);

function tokenJaUsado(hashAtual, ultimoSetup) {
  if (!ultimoSetup || typeof ultimoSetup !== 'object') return true;
  const gravado = ultimoSetup.tokenHash;
  return typeof gravado === 'string' ? gravado === hashAtual : true;
}

function imprimirLink(titulo, base, token) {
  console.log('');
  console.log(linha);
  console.log(`  ${titulo}`);
  console.log('');
  console.log(`  ${base}/rodolfo/setup?token=${token}`);
  console.log('');
  console.log('  O link vale até a senha ser definida; depois disso o token morre');
  console.log('  e esta mensagem não aparece mais.');
  console.log(linha);
  console.log('');
}

try {
  const token = process.env.ADMIN_SETUP_TOKEN ?? '';
  const base = (process.env.NEXTAUTH_URL ?? 'https://consultoriaflowfoods.com.br').replace(/\/+$/, '');
  const admins = await prisma.user.count({ where: { senhaHash: { not: null } } });

  if (!token) {
    console.log(
      admins > 0
        ? `[setup] Admin já configurado. Login em ${base}/rodolfo/login`
        : '[setup] ADMIN_SETUP_TOKEN ausente — defina no Dokploy para criar sua senha.',
    );
  } else if (admins === 0) {
    imprimirLink('PRIMEIRO ACESSO — abra este endereço para definir sua senha:', base, token);
  } else {
    const hashAtual = createHash('sha256').update(token).digest('hex');
    let ultimo = await prisma.auditLog.findFirst({
      where: { evento: { in: ['admin_senha_definida', 'admin_setup_token_registrado'] } },
      orderBy: { criadoEm: 'desc' },
    });

    // Admin criado antes de o setup gravar o hash: o token em vigor agora é o
    // que criou a senha. Registra uma vez, para que trocar o token no painel
    // passe a reabrir o setup.
    if (typeof ultimo?.dados?.tokenHash !== 'string') {
      ultimo = await prisma.auditLog.create({
        data: { evento: 'admin_setup_token_registrado', dados: { tokenHash: hashAtual, origem: 'boot' } },
      });
      console.log('[setup] Token de setup em vigor registrado como usado.');
    }

    if (tokenJaUsado(hashAtual, ultimo.dados)) {
      console.log(`[setup] Admin já configurado. Login em ${base}/rodolfo/login`);
      console.log('[setup] Esqueceu a senha? Troque o ADMIN_SETUP_TOKEN no painel e faça o redeploy: o link volta a aparecer aqui.');
    } else {
      imprimirLink('TOKEN NOVO — abra este endereço para redefinir sua senha:', base, token);
    }
  }
} catch (e) {
  console.log(`[setup] aviso: não consegui checar o admin (${e?.message ?? e}). Seguindo o start.`);
} finally {
  await prisma.$disconnect().catch(() => {});
}
