/**
 * O miolo das actions de insumo, comum ao nível 1 e à pessoa do parceiro: quem
 * chama já resolveu o contexto (sessão + parceiro) e conferiu
 * `recusaDaAcao(ctx, 'insumos.editar')` e o bloqueio. Aqui só se traduz o
 * resultado: erro volta para o formulário; sucesso revalida e leva ao detalhe.
 * As regras estão em `src/lib/erp/{insumos,variantes}.ts`.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ResultadoInsumo } from '@/lib/erp/insumos';
import type { ResultadoVariante } from '@/lib/erp/variantes';
import type { EstadoInsumo } from './estado';

const vezDe = (anterior: EstadoInsumo) => (anterior?.vez ?? 0) + 1;

export function recusado(anterior: EstadoInsumo, motivo: string): EstadoInsumo {
  return { ok: false, erros: { geral: motivo }, vez: vezDe(anterior) };
}

/** FormData → objeto de texto (campos repetidos não existem nestes formulários). */
export function entradaDe(form: FormData): Record<string, string> {
  const e: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === 'string') e[k] = v;
  });
  return e;
}

/**
 * Depois de gravar. `base` = lista de insumos de quem chama; `feito` = a frase
 * do detalhe (ver `FEITO`). `insumoId` (embalagem): o detalhe é o do insumo.
 */
export function concluir(
  r: ResultadoInsumo | ResultadoVariante,
  anterior: EstadoInsumo,
  base: string,
  feito: { mudou: string; igual?: string },
  insumoId?: string,
): EstadoInsumo {
  if (!r.ok) {
    return {
      ok: false,
      erros: r.erros,
      conflito: r.conflito,
      desativadoId: 'desativadoId' in r ? r.desativadoId : undefined,
      vez: vezDe(anterior),
    };
  }
  revalidatePath(base, 'layout');
  const frase = r.mudou.length === 0 && feito.igual ? feito.igual : feito.mudou;
  redirect(`${base}/${insumoId ?? r.id}?feito=${frase}`);
}

/** "sim" no campo `ativo` = reativar; qualquer outra coisa = desativar. */
export function querAtivo(form: FormData): boolean {
  return form.get('ativo') === 'sim';
}
