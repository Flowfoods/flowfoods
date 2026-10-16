/**
 * O miolo das actions de compras (1.5), comum ao nível 1 e à pessoa do
 * parceiro: quem chama já resolveu o contexto e conferiu a permissão do
 * módulo (`compras.lancar` / `fornecedores.editar`) e o bloqueio. A regra por
 * LOJA (a nota é de uma loja) mora em `src/lib/erp/compras.ts`, que recebe o
 * alcance. Aqui só se lê o formulário e se traduz o resultado.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { cancelarNota, editarNota, lancarNota, previaDaNota, type ResultadoCompras } from '@/lib/erp/compras';
import type { EntradaDaNota } from '@/lib/erp/compra-campos';
import type { EstadoNota } from './estado';

const textoDe = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
const vezDe = (anterior: EstadoNota) => (anterior?.vez ?? 0) + 1;

export function recusadoNaNota(anterior: EstadoNota, motivo: string): EstadoNota {
  return { ok: false, erros: { geral: motivo }, vez: vezDe(anterior) };
}

/** FormData → entrada da nota (itens na ordem da tela; linha em branco não é item). */
export function lerEntradaDaNota(form: FormData): EntradaDaNota & { versao: string } {
  const insumos = form.getAll('item_insumo').map(textoDe);
  const embalagens = form.getAll('item_embalagem').map(textoDe);
  const quantidades = form.getAll('item_quantidade').map(textoDe);
  const valores = form.getAll('item_valor').map(textoDe);
  const itens = insumos
    .map((insumoId, i) => ({ insumoId, embalagem: embalagens[i] ?? '', quantidade: quantidades[i] ?? '', valor: valores[i] ?? '' }))
    .filter((i) => i.insumoId || i.quantidade.trim() || i.valor.trim());
  return {
    lojaId: textoDe(form.get('lojaId')),
    fornecedorId: textoDe(form.get('fornecedorId')),
    numero: textoDe(form.get('numero')),
    serie: textoDe(form.get('serie')),
    data: textoDe(form.get('data')),
    frete: textoDe(form.get('frete')),
    total: textoDe(form.get('total')),
    versao: textoDe(form.get('versao')),
    itens,
  };
}

/** Depois de gravar: erro volta ao formulário; sucesso revalida e leva ao detalhe com a frase. */
export function concluirCompra(r: ResultadoCompras, anterior: EstadoNota, base: string, feito: { mudou: string; igual?: string }): EstadoNota {
  if (!r.ok) {
    return { ok: false, erros: r.erros, conflito: r.conflito, desativadoId: r.desativadoId, duplicadaId: r.duplicadaId, vez: vezDe(anterior) };
  }
  revalidatePath(base, 'layout');
  const frase = r.mudou.length === 0 && feito.igual ? feito.igual : feito.mudou;
  redirect(`${base}/${r.id}?feito=${frase}`);
}

/**
 * Lançar ou salvar a nota. `intencao=conferir` só calcula a prévia (nada é
 * gravado); qualquer outra coisa grava. `notaId` vazio = nota nova.
 */
export async function executarNota(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  autorNome: string,
  notaId: string,
  anterior: EstadoNota,
  form: FormData,
  base: string,
): Promise<EstadoNota> {
  const entrada = lerEntradaDaNota(form);
  if (form.get('intencao') === 'conferir') {
    const p = await previaDaNota(cliente, alcance, entrada, notaId || undefined);
    if (!p.ok) return { ok: false, erros: p.erros, vez: vezDe(anterior) };
    return { ok: false, erros: {}, previa: p.previa, vez: vezDe(anterior) };
  }
  const r = notaId ? await editarNota(cliente, alcance, notaId, entrada, autorNome) : await lancarNota(cliente, alcance, entrada, autorNome);
  return concluirCompra(r, anterior, base, notaId ? { mudou: 'editada', igual: 'igual' } : { mudou: 'lancada' });
}

export async function executarCancelamento(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  autorNome: string,
  notaId: string,
  anterior: EstadoNota,
  form: FormData,
  base: string,
): Promise<EstadoNota> {
  const r = await cancelarNota(cliente, alcance, notaId, form.get('motivo'), autorNome);
  return concluirCompra(r, anterior, base, { mudou: 'cancelada' });
}
