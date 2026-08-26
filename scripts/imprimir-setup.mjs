/**
 * Roda no start do `web`, depois da migration e antes do Next.
 *
 * Se ainda não existe admin com senha, imprime o link de setup — com o token —
 * no log do container. É assim que o Rodolfo pega o token sem precisar de
 * terminal: o log do Dokploy é visível no navegador, que é o único acesso que
 * ele declarou ter.
 *
 * Por que isso não é vazar segredo: o ADMIN_SETUP_TOKEN é de uso único — a
 * primeira senha definida o invalida (a checagem em `setup/actions.ts` é
 * "existe admin com senha?", estado do banco). Depois do setup este script
 * imprime só "portal pronto", nunca mais o token. E o log do Dokploy só é
 * visível para quem já está autenticado no painel — quem lê o log já
 * administra a VPS inteira.
 *
 * Nunca derruba o start: qualquer erro aqui vira aviso, porque um portal no ar
 * sem esta mensagem é melhor que um portal que não sobe por causa dela.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const linha = '─'.repeat(68);

try {
  const admins = await prisma.user.count({ where: { senhaHash: { not: null } } });

  if (admins > 0) {
    console.log(`[setup] Admin já configurado. Login em ${process.env.NEXTAUTH_URL ?? ''}/rodolfo/login`);
  } else {
    const token = process.env.ADMIN_SETUP_TOKEN ?? '';
    const base = (process.env.NEXTAUTH_URL ?? 'https://consultoriaflowfoods.com.br').replace(/\/+$/, '');

    if (!token) {
      console.log('[setup] ADMIN_SETUP_TOKEN ausente — defina no Dokploy para criar sua senha.');
    } else {
      console.log('');
      console.log(linha);
      console.log('  PRIMEIRO ACESSO — abra este endereço para definir sua senha:');
      console.log('');
      console.log(`  ${base}/rodolfo/setup?token=${token}`);
      console.log('');
      console.log('  O link vale até a senha ser definida; depois disso o token morre');
      console.log('  e esta mensagem não aparece mais.');
      console.log(linha);
      console.log('');
    }
  }
} catch (e) {
  console.log(`[setup] aviso: não consegui checar o admin (${e?.message ?? e}). Seguindo o start.`);
} finally {
  await prisma.$disconnect().catch(() => {});
}
