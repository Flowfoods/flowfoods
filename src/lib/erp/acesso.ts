/**
 * Acesso das pessoas dos parceiros (0.3) — regras puras, sem banco: senha,
 * token do link, limite de tentativas, IP e rótulo do aparelho. O banco fica em
 * `credenciais.ts`; a tela, em `src/app/entrar` e `src/app/erp`.
 */

import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

/** Custo do bcrypt (o contrato pede ≥ 10; o /rodolfo usa 12). */
export const CUSTO_BCRYPT = 12;
export const SENHA_MINIMA = 10;
/** bcrypt só olha os primeiros 72 bytes: mais que isso daria falsa sensação de segurança. */
export const SENHA_MAXIMA_BYTES = 72;

export const HORA_MS = 60 * 60 * 1000;
/** Link de primeiro acesso / nova senha. */
export const VALIDADE_DO_LINK_MS = 72 * HORA_MS;
/** Sessão do ERP do parceiro (absoluta; desativar derruba antes). */
export const VALIDADE_DA_SESSAO_MS = 7 * 24 * HORA_MS;
/** Desafio do rosto: o tempo de olhar para o celular. */
export const VALIDADE_DO_DESAFIO_MS = 5 * 60 * 1000;

/** Limite de tentativas que deram errado, na janela. */
export const LIMITE_DE_TENTATIVAS = {
  janelaMs: 15 * 60 * 1000,
  porEmail: 5,
  porIp: 20,
} as const;

/** Uma mensagem só para e-mail inexistente, senha errada e acesso desativado. */
export const ERRO_DE_ENTRADA = 'E-mail ou senha incorretos.';
export const ERRO_DE_ROSTO = 'Não deu para entrar com o rosto. Use e-mail e senha.';
export const ERRO_DE_BLOQUEIO = 'Muitas tentativas seguidas. Espere 15 minutos e tente de novo.';
export const ERRO_DE_LINK = 'Este link não vale mais. Peça um novo à FlowFoods.';

// ------------------------------------------------------------------ e-mail

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minúsculo e sem espaço; null se não parece e-mail. */
export function normalizarEmail(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  const e = bruto.trim().toLowerCase();
  if (e.length > 160 || !EMAIL.test(e)) return null;
  return e;
}

export const formNovoAcesso = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Escreva o nome da pessoa (pelo menos 2 letras).')
    .max(80, 'Nome longo demais (máx. 80).')
    .transform((s) => s.replace(/\s+/g, ' ')),
  email: z
    .string()
    .transform((s, ctx) => {
      const e = normalizarEmail(s);
      if (!e) {
        ctx.addIssue({ code: 'custom', message: 'E-mail inválido. Ex.: maria@restaurante.com.br' });
        return z.NEVER;
      }
      return e;
    }),
});

// ------------------------------------------------------------------- senha

/** null = senha aceita; senão, a frase para a pessoa. */
export function conferirSenhaNova(senha: string, confirmacao: string, email?: string): string | null {
  if (senha.length < SENHA_MINIMA) return `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`;
  if (Buffer.byteLength(senha, 'utf8') > SENHA_MAXIMA_BYTES) return 'Senha longa demais (até 72 letras).';
  if (/^(.)\1+$/.test(senha)) return 'Senha fácil demais: não repita o mesmo caractere.';
  if (email && senha.trim().toLowerCase() === email.toLowerCase()) return 'A senha não pode ser o seu e-mail.';
  if (senha !== confirmacao) return 'As duas senhas não estão iguais.';
  return null;
}

// ------------------------------------------------------------------- token

/** Token do link e do cookie: 32 bytes aleatórios, base64url (43 caracteres). */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 do token. Só o hash vai para o banco: quem lê o banco não consegue
 * abrir o link nem a sessão. (Token aleatório de 256 bits não precisa de hash
 * lento; bcrypt é para senha, que é escolhida por gente.)
 */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Formato do token antes de ir ao banco (link colado pela metade, lixo). */
export function tokenTemFormato(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

// ------------------------------------------------------- limite e requisição

export function excedeuLimite(falhasDoEmail: number, falhasDoIp: number): boolean {
  return falhasDoEmail >= LIMITE_DE_TENTATIVAS.porEmail || falhasDoIp >= LIMITE_DE_TENTATIVAS.porIp;
}

type Cabecalhos = { get(nome: string): string | null };

/**
 * IP de quem pede. Atrás do Traefik, `X-Real-Ip` é o que o PRÓPRIO proxy viu.
 * No `X-Forwarded-For`, vale o ÚLTIMO item (o que o proxy acrescentou): o
 * primeiro vem do cliente e pode ser inventado para fugir do limite por IP.
 */
export function ipDaRequisicao(h: Cabecalhos): string {
  const real = h.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  const fwd = h.get('x-forwarded-for');
  if (fwd) {
    const itens = fwd.split(',').map((s) => s.trim()).filter(Boolean);
    if (itens.length) return itens[itens.length - 1].slice(0, 64);
  }
  return 'desconhecido';
}

/** Nome do aparelho para a pessoa reconhecer na lista ("iPhone", "Android"). */
export function rotuloDoAparelho(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Celular Android' : 'Tablet Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Computador Windows';
  if (/Linux/i.test(ua)) return 'Computador Linux';
  return 'Aparelho';
}
