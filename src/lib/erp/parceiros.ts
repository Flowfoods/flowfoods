/**
 * Parceiro Flow no nível 1 (FlowFoods): criar, renomear, ativar e suspender.
 * Regra de negócio sem tela. Toda mudança grava antes/depois no histórico do
 * próprio parceiro, na mesma transação (`gravarParceiroFlow`).
 *
 * Criação pela landing / aprovação de lead é da fase 0.5, não daqui.
 */

import type { ParceiroStatus, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { gerarSlug, SLUG_VALIDO } from './slug';
import { ehErroDeUnicidade, gravarParceiroFlow } from './tenant';

export { gerarSlug } from './slug';

export const STATUS_DO_PARCEIRO: Record<ParceiroStatus, { rotulo: string; tom: 'ativo' | 'rascunho' | 'suspenso' }> = {
  ATIVO: { rotulo: 'Ativo', tom: 'ativo' },
  RASCUNHO: { rotulo: 'Aguardando liberação', tom: 'rascunho' },
  SUSPENSO: { rotulo: 'Suspenso', tom: 'suspenso' },
};

const nome = z
  .string()
  .trim()
  .min(2, 'Dê um nome com pelo menos 2 letras.')
  .max(80, 'Nome longo demais (máx. 80).')
  .transform((s) => s.replace(/\s+/g, ' '));

export const formNovoParceiro = z.object({
  nome,
  slug: z.string().trim().toLowerCase().optional().default(''),
  status: z.enum(['ATIVO', 'RASCUNHO'], { message: 'Escolha como o parceiro nasce.' }),
});

export type ResultadoParceiro =
  | { ok: true; id: string; slug: string; nome: string; mensagem: string }
  | { ok: false; erros: Partial<Record<'nome' | 'slug' | 'status' | 'motivo' | 'geral', string>> };

function errosDoZod(issues: z.core.$ZodIssue[]) {
  const erros: Record<string, string> = {};
  for (const i of issues) erros[String(i.path[0] ?? 'geral')] ??= i.message;
  return { ok: false as const, erros };
}

/** Slug editável na criação; vazio = gerado do nome. Depois disso ele é o endereço e não muda. */
export async function criarParceiro(
  entrada: Record<string, unknown>,
  autorNome: string,
  base?: PrismaClient,
): Promise<ResultadoParceiro> {
  const r = formNovoParceiro.safeParse(entrada);
  if (!r.success) return errosDoZod(r.error.issues);
  const slug = r.data.slug || gerarSlug(r.data.nome);
  if (slug.length < 3 || slug.length > 48 || !SLUG_VALIDO.test(slug)) {
    return { ok: false, erros: { slug: 'Use de 3 a 48 letras minúsculas, números e hífen. Ex.: grupo-valentins.' } };
  }

  try {
    const p = await gravarParceiroFlow(async (pf) => {
      const criado = await pf.create({ data: { nome: r.data.nome, slug, status: r.data.status } });
      return {
        parceiroId: criado.id,
        resultado: criado,
        historico: {
          entidade: 'ParceiroFlow',
          entidadeId: criado.id,
          acao: 'CRIOU',
          depois: { nome: criado.nome, slug: criado.slug, status: criado.status },
          autorNome,
        },
      };
    }, base);
    return { ok: true, id: p.id, slug: p.slug, nome: p.nome, mensagem: `“${p.nome}” criado.` };
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { slug: 'Esse endereço já é de outro parceiro.' } };
    throw e;
  }
}

export async function renomearParceiro(
  parceiroId: string,
  entrada: Record<string, unknown>,
  autorNome: string,
  base?: PrismaClient,
): Promise<ResultadoParceiro> {
  const r = z.object({ nome }).safeParse(entrada);
  if (!r.success) return errosDoZod(r.error.issues);

  return gravarParceiroFlow<ResultadoParceiro>(async (pf) => {
    const antes = await pf.findUniqueOrThrow({ where: { id: parceiroId } });
    const ok = { ok: true as const, id: antes.id, slug: antes.slug, nome: r.data.nome };
    if (antes.nome === r.data.nome) {
      return { parceiroId, resultado: { ...ok, mensagem: 'Nada mudou.' }, historico: null };
    }
    // Condicional no nome lido: duas edições ao mesmo tempo não se atropelam.
    const { count } = await pf.updateMany({ where: { id: parceiroId, nome: antes.nome }, data: { nome: r.data.nome } });
    if (count === 0) {
      return {
        parceiroId,
        resultado: { ok: false as const, erros: { geral: 'O nome mudou enquanto você editava. Recarregue.' } },
        historico: null,
      };
    }
    return {
      parceiroId,
      resultado: { ...ok, mensagem: 'Nome atualizado.' },
      historico: {
        entidade: 'ParceiroFlow',
        entidadeId: parceiroId,
        acao: 'ALTEROU',
        antes: { nome: antes.nome },
        depois: { nome: r.data.nome },
        autorNome,
      },
    };
  }, base);
}

/** Transições permitidas. RASCUNHO só sai para ATIVO (liberação); ninguém volta a RASCUNHO. */
const TRANSICOES: Record<ParceiroStatus, ParceiroStatus[]> = {
  RASCUNHO: ['ATIVO'],
  ATIVO: ['SUSPENSO'],
  SUSPENSO: ['ATIVO'],
};

export function transicoesDe(status: ParceiroStatus): ParceiroStatus[] {
  return TRANSICOES[status];
}

export async function mudarStatusParceiro(
  parceiroId: string,
  novo: ParceiroStatus,
  motivoBruto: unknown,
  autorNome: string,
  base?: PrismaClient,
): Promise<ResultadoParceiro> {
  const motivo = typeof motivoBruto === 'string' ? motivoBruto.trim().replace(/\s+/g, ' ') : '';
  if (motivo.length > 200) return { ok: false, erros: { motivo: 'Motivo longo demais (máx. 200).' } };
  if (novo === 'SUSPENSO' && motivo.length < 3) {
    return { ok: false, erros: { motivo: 'Diga em poucas palavras por que está suspendendo.' } };
  }

  return gravarParceiroFlow<ResultadoParceiro>(async (pf) => {
    const antes = await pf.findUniqueOrThrow({ where: { id: parceiroId } });
    if (!TRANSICOES[antes.status].includes(novo)) {
      return {
        parceiroId,
        resultado: {
          ok: false as const,
          erros: {
            geral: `Não dá para ir de “${STATUS_DO_PARCEIRO[antes.status].rotulo}” para “${STATUS_DO_PARCEIRO[novo].rotulo}”.`,
          },
        },
        historico: null,
      };
    }
    const { count } = await pf.updateMany({ where: { id: parceiroId, status: antes.status }, data: { status: novo } });
    if (count === 0) {
      return {
        parceiroId,
        resultado: { ok: false as const, erros: { geral: 'O status mudou enquanto você decidia. Recarregue.' } },
        historico: null,
      };
    }
    return {
      parceiroId,
      resultado: {
        ok: true as const,
        id: antes.id,
        slug: antes.slug,
        nome: antes.nome,
        mensagem: novo === 'SUSPENSO' ? 'Parceiro suspenso: leitura liberada, cadastros bloqueados.' : 'Parceiro ativo.',
      },
      historico: {
        entidade: 'ParceiroFlow',
        entidadeId: parceiroId,
        acao: novo === 'SUSPENSO' ? 'SUSPENDEU' : 'ATIVOU',
        antes: { status: antes.status },
        depois: { status: novo },
        motivo: motivo || null,
        autorNome,
      },
    };
  }, base);
}
