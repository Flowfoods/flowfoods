/**
 * Cadastrar um cliente no Portal pela tela (decisão 477): antes, uma linha no banco por comando (`docs/PORTAL.md`).
 * O questionário continua vindo do código (um JSON por marca em `questionarios/`, com o hash fixado em teste): a tela só
 * escolhe entre os que existem. Como cada questionário é de uma marca e cita a marca nas perguntas, a tela não marca nenhum
 * por padrão e pede a confirmação de que o cliente é daquela marca — senão um cliente novo receberia o formulário de outro.
 * O link é um código aleatório de 32 caracteres, como os de antes.
 */

import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export const NOME_MINIMO = 2;
export const NOME_MAXIMO = 80;
/**
 * Uma palavra sem espaço nem hífen maior que isso fica difícil de ler no título do formulário no celular (o título quebra a
 * palavra para não passar da tela, mas no meio dela).
 */
export const PALAVRA_MAXIMA = 24;

/**
 * O nome reduzido a letras e números separados por hífen, sem acento, caixa nem apóstrofo (o reto, o curvo que o celular
 * digita e o sem apóstrofo dão o mesmo): "Valentin's" = "Valentin’s" = "Valentins" → "valentins". É a base do endereço e a
 * régua do nome repetido.
 */
export const chaveDoNome = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`´]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** "Bar do Zé & Cia." → "bar-do-ze-cia"; "Valentin's" → "valentins". Até 60 caracteres. Vazio quando não sobra letra nem número. */
export function slugDoNome(nome: string): string {
  return chaveDoNome(nome).slice(0, 60).replace(/-+$/g, '');
}

export type NovoCliente = { ok: true; nome: string; questionario: string } | { ok: false; erro: string };

/**
 * Confere o formulário: nome de 2 a 80 caracteres, com letra ou número, sem caractere de controle e sem palavra maior que 24
 * letras; questionário entre os que existem no código; a marca do questionário confirmada; nome que ainda não existe (sem
 * contar acento, caixa, apóstrofo e símbolo).
 */
export function lerNovoCliente(
  entrada: { nome: unknown; questionario: unknown; confirmaMarca: unknown },
  disponiveis: readonly { chave: string; marca: string }[],
  nomesExistentes: readonly string[],
): NovoCliente {
  const bruto = typeof entrada.nome === 'string' ? entrada.nome : '';
  // Caractere de controle (nulo, tabulação, quebra) não entra: o banco recusa o nulo, e os outros quebram o título.
  const nome = bruto.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (nome.length < NOME_MINIMO) return { ok: false, erro: 'Escreva o nome do cliente (pelo menos 2 letras).' };
  if (nome.length > NOME_MAXIMO) return { ok: false, erro: `O nome vai até ${NOME_MAXIMO} caracteres.` };
  if (!slugDoNome(nome)) return { ok: false, erro: 'O nome precisa ter ao menos uma letra ou número.' };
  if (nome.split(/[\s-]+/).some((p) => p.length > PALAVRA_MAXIMA)) return { ok: false, erro: `Separe o nome com espaços: uma palavra vai até ${PALAVRA_MAXIMA} letras.` };
  const q = disponiveis.find((d) => d.chave === entrada.questionario);
  if (!q) return { ok: false, erro: 'Escolha um dos questionários da lista.' };
  if (entrada.confirmaMarca !== 'on') return { ok: false, erro: `O questionário cita o ${q.marca} nas perguntas. Confirme que este cliente é do ${q.marca}.` };
  const chave = chaveDoNome(nome);
  const repetido = nomesExistentes.find((n) => chaveDoNome(n) === chave);
  if (repetido) {
    return { ok: false, erro: `Já existe um cliente com o nome "${repetido}". Para um segundo link, use um nome que diferencie (ex.: "${nome} · sócio 2").` };
  }
  return { ok: true, nome, questionario: q.chave };
}

/**
 * Cria o cliente com endereço próprio (`bar-do-ze`, e `bar-do-ze-2` se já existir) e um link novo, e registra quem cadastrou
 * na mesma transação. Dois cadastros com o mesmo nome ao mesmo tempo não colidem: o banco recusa o endereço repetido e o
 * próximo número é tentado. Confere de novo o essencial (quem chama de outro lugar não passa nome vazio nem questionário
 * que não existe).
 */
export async function cadastrarCliente(
  nome: string,
  questionario: string,
  disponiveis: readonly string[],
  autor: { userId: string | null },
): Promise<{ id: string; slug: string; token: string }> {
  const base = slugDoNome(nome);
  if (!base) throw new Error('Nome sem letra nem número.');
  if (!disponiveis.includes(questionario)) throw new Error('Questionário que não existe no código.');
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (await prisma.portalCliente.findUnique({ where: { slug }, select: { id: true } })) continue;
    const token = randomBytes(16).toString('hex');
    try {
      return await prisma.$transaction(async (tx) => {
        const c = await tx.portalCliente.create({ data: { id: `portal_${slug}`, nome, slug, token, questionario }, select: { id: true, slug: true, token: true } });
        await tx.auditLog.create({ data: { userId: autor.userId, evento: 'portal_cadastrado', dados: { clienteId: c.id, nome, slug: c.slug, questionario } } });
        return c;
      });
    } catch (e) {
      // Outro cadastro pegou o mesmo endereço entre a conferência e a gravação: tenta o próximo número.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  throw new Error('Não deu para criar um endereço único para este nome.');
}
