/**
 * O miolo das actions de cadastro do ERP (insumo, embalagem, ficha técnica),
 * comum ao nível 1 e à pessoa do parceiro: quem chama já resolveu o contexto
 * (sessão + parceiro) e conferiu `recusaDaAcao(ctx, '<modulo>.editar')` e o
 * bloqueio. Aqui só se traduz o resultado: erro volta para o formulário;
 * sucesso revalida e leva ao detalhe. As regras moram em `src/lib/erp/*`.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { EstadoCadastro } from './estado';

/** O que toda regra de cadastro devolve (insumo, variante, ficha). */
export type ResultadoDeCadastro =
  | { ok: true; id: string; mudou: string[]; repetido?: boolean }
  | { ok: false; erros: Record<string, string>; conflito?: boolean; desativadoId?: string; existenteId?: string; naoEncontrado?: boolean };

const vezDe = (anterior: EstadoCadastro) => (anterior?.vez ?? 0) + 1;

export function recusado(anterior: EstadoCadastro, motivo: string): EstadoCadastro {
  return { ok: false, erros: { geral: motivo }, vez: vezDe(anterior) };
}

/** FormData → objeto de texto (campo repetido: fica o último; arquivo fica de fora). */
export function entradaDe(form: FormData): Record<string, string> {
  const e: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === 'string') e[k] = v;
  });
  return e;
}

/**
 * Depois de gravar. `base` = lista de quem chama; `feito` = a chave da frase
 * do detalhe. `alvoId` (embalagem): o detalhe é o do insumo.
 */
export function concluir(
  r: ResultadoDeCadastro,
  anterior: EstadoCadastro,
  base: string,
  feito: { mudou: string; igual?: string; repetido?: string },
  alvoId?: string,
): EstadoCadastro {
  if (!r.ok) {
    return {
      ok: false,
      erros: r.erros,
      conflito: r.conflito,
      desativadoId: r.desativadoId,
      existenteId: r.existenteId,
      vez: vezDe(anterior),
    };
  }
  revalidatePath(base, 'layout');
  // I.1a: o envio repetido (mesma chave) volta como o insumo que já existe; a frase diz isso (`feito.repetido`).
  const frase = r.repetido && feito.repetido ? feito.repetido : r.mudou.length === 0 && feito.igual ? feito.igual : feito.mudou;
  redirect(`${base}/${alvoId ?? r.id}?feito=${frase}`);
}

/** "sim" no campo `ativo` = reativar; qualquer outra coisa = desativar. */
export function querAtivo(form: FormData): boolean {
  return form.get('ativo') === 'sim';
}
