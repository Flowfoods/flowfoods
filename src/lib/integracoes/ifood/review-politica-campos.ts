import { z } from 'zod';

// Tetos de armazenamento/editoriais LOCAIS; não são limites confirmados do canal.
const texto = (max: number) => z.string().max(max).refine((v) => v.trim().length > 0, 'Informe texto não vazio.');
export const conteudoReviewPoliticaSchema = z.object({
  tom: texto(2_000),
  assinatura: z.string().max(2_000), // vazio explícito significa não usar assinatura
  exemplos: z.array(texto(5_000)).max(20),
  restricoes: z.array(texto(5_000)).max(20),
  limiteEditorial: z.number().int().min(1).max(10_000),
}).strict();
export const novaReviewPoliticaSchema = z.object({
  lojaId: texto(200).nullable(), // null = parceiro; loja = exceção completa explícita
  versaoEsperada: z.number().int().min(0).max(2_147_483_646), // 0 = ainda não existe
  conteudo: conteudoReviewPoliticaSchema,
  motivo: texto(2_000),
}).strict();
export type ConteudoReviewPolitica = z.infer<typeof conteudoReviewPoliticaSchema>;
export const alvoReviewPolitica = (lojaId: string | null) => lojaId === null ? 'PARCEIRO' : `LOJA:${lojaId}`;

export interface SnapshotReviewPolitica {
  readonly capacidade: 'INATIVA';
  readonly parceiroId: string;
  readonly lojaConsultadaId: string;
  readonly origem: 'PARCEIRO' | 'LOJA';
  readonly lojaDaPoliticaId: string | null;
  readonly politicaId: string;
  readonly versaoId: string;
  readonly numero: number;
  readonly conteudo: Readonly<Omit<ConteudoReviewPolitica, 'exemplos' | 'restricoes'>> & {
    readonly exemplos: readonly string[];
    readonly restricoes: readonly string[];
  };
}

/** Copia e congela, sem normalizar texto ou manter arrays pertencentes ao chamador. */
export function congelarReviewPolitica(snapshot: SnapshotReviewPolitica): SnapshotReviewPolitica {
  return Object.freeze({ ...snapshot, conteudo: Object.freeze({ ...snapshot.conteudo,
    exemplos: Object.freeze([...snapshot.conteudo.exemplos]), restricoes: Object.freeze([...snapshot.conteudo.restricoes]),
  }) });
}
