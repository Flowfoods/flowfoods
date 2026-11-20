import { z } from 'zod';
import { conteudoReviewPoliticaSchema } from './review-politica-campos';

// Tetos de armazenamento locais, sem afirmar elegibilidade/limite do canal.
const texto = (max: number) => z.string().max(max).refine(v => v.trim().length > 0, 'Informe texto não vazio.');
export const identidadeReviewFilaSchema = z.object({ lojaId: texto(200), avaliacaoLocalId: texto(200) }).strict();
const revisao = z.number().int().min(0).max(2_147_483_646);
export const gravarReviewFilaSchema = identidadeReviewFilaSchema.extend({
  revisaoEsperada: revisao, // zero cria; demais editam a revisão exata
  fatos: z.object({ versao: texto(200), comentario: z.string().max(10_000) }).strict(),
  texto: texto(10_000),
  visibilidade: z.enum(['PUBLICA', 'PRIVADA']), // intenção local, não confirmação do canal
  motivo: texto(2_000),
}).strict();
export const aprovarReviewFilaSchema = identidadeReviewFilaSchema.extend({
  revisaoEsperada: revisao.min(1), motivo: texto(2_000),
}).strict();
export const listarReviewFilaSchema = z.object({
  lojaId: texto(200), estado: z.enum(['RASCUNHO', 'APROVADA']).optional(),
  limite: z.number().int().min(1).max(100), depoisId: texto(200).optional(),
}).strict();

/** Teto editorial escolhido na política desta revisão; não é limite do iFood. */
export function conferirLimiteEditorialReview(texto: string, snapshot: unknown): void {
  const { conteudo } = z.object({ conteudo: conteudoReviewPoliticaSchema }).parse(snapshot);
  if (Array.from(texto).length > conteudo.limiteEditorial) {
    throw new Error('Texto excede o limite editorial da política desta revisão. Edite o rascunho antes de aprovar.');
  }
}

/** DTO sem Date mutável, nem referências ao resultado original do Prisma. */
export type ReviewFilaDto<T> = T extends Date ? string : T extends readonly (infer U)[] ? readonly ReviewFilaDto<U>[] : T extends object ? { readonly [K in keyof T]: ReviewFilaDto<T[K]> } : T;
export function congelarReviewFila<T>(valor: T): ReviewFilaDto<T> {
  if (valor instanceof Date) return valor.toISOString() as ReviewFilaDto<T>;
  if (Array.isArray(valor)) return Object.freeze(valor.map(congelarReviewFila)) as ReviewFilaDto<T>;
  if (valor !== null && typeof valor === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, congelarReviewFila(v)]))) as ReviewFilaDto<T>;
  }
  return valor as ReviewFilaDto<T>;
}
