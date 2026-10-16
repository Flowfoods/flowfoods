/**
 * O miolo das actions de requisição (1.8), comum ao nível 1 e à pessoa do
 * parceiro: quem chama já resolveu o contexto, conferiu a permissão (com a
 * loja) e o bloqueio. A regra por LOJA mora em `src/lib/erp/requisicao.ts`,
 * que recebe o alcance e confere a loja de novo. Aqui só se lê o formulário
 * e se traduz o resultado.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { ResultadoEstoque } from '@/lib/erp/estoque';
import { atenderRequisicao, cancelarRequisicao, criarRequisicao, devolverItem } from '@/lib/erp/requisicao';
import type { EstadoEstoque } from '../estoque/estado';

const vezDe = (anterior: EstadoEstoque) => (anterior?.vez ?? 0) + 1;
const txt = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

function concluir(r: ResultadoEstoque, anterior: EstadoEstoque, base: string, destino: (id: string) => string, feito: string, jaFeito: string): EstadoEstoque {
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  redirect(`${destino(r.id)}?feito=${r.jaFeito ? jaFeito : feito}`);
}

/** As linhas do pedido: `insumo`, `quantidade` e `escala` repetidos, na ordem da tela. */
export function linhasDoPedido(form: FormData) {
  const insumos = form.getAll('insumo').map(txt);
  const qs = form.getAll('quantidade').map(txt);
  const es = form.getAll('escala').map(txt);
  return insumos.slice(0, 80).map((insumoId, i) => ({ insumoId, quantidade: (qs[i] ?? '').slice(0, 20), escala: es[i] ?? 'base' }));
}

/** As linhas da entrega: `q:<item>` e `e:<item>` de cada item da requisição (`item` repetido). */
export function linhasDaEntrega(form: FormData) {
  return form
    .getAll('item')
    .map(txt)
    .slice(0, 80)
    .map((itemId) => ({ itemId, quantidade: txt(form.get(`q:${itemId}`)).slice(0, 20), escala: txt(form.get(`e:${itemId}`)) || 'base' }));
}

export async function executarPedir(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await criarRequisicao(
    cliente,
    alcance,
    lojaId,
    { setor: form.get('setor'), paraDia: form.get('paraDia'), observacao: form.get('observacao'), linhas: linhasDoPedido(form), fichaId: form.get('fichaId'), fichaQuantidade: form.get('fichaQuantidade') },
    autorNome,
  );
  return concluir(r, anterior, base, (id) => `${base}/${lojaId}/requisicoes/${id}`, 'pedida', 'pedida');
}

export async function executarAtender(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await atenderRequisicao(
    cliente,
    alcance,
    lojaId,
    id,
    { versao: form.get('versao'), linhas: linhasDaEntrega(form), encerrar: form.get('encerrar'), confirmarNegativo: form.get('confirmarNegativo') },
    autorNome,
  );
  return concluir(r, anterior, base, (x) => `${base}/${lojaId}/requisicoes/${x}`, 'entregue', 'ja-atendida');
}

export async function executarDevolver(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await devolverItem(
    cliente,
    alcance,
    lojaId,
    id,
    { versao: form.get('versao'), itemId: form.get('itemId'), quantidade: form.get('quantidade'), escala: form.get('escala'), motivo: form.get('motivo') },
    autorNome,
  );
  return concluir(r, anterior, base, (x) => `${base}/${lojaId}/requisicoes/${x}`, 'devolvida', 'devolvida');
}

export async function executarCancelar(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await cancelarRequisicao(cliente, alcance, lojaId, id, { motivo: form.get('motivo') }, autorNome);
  return concluir(r, anterior, base, () => `${base}/${lojaId}/requisicoes`, 'cancelada', 'ja-cancelada');
}
