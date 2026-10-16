/**
 * O miolo das actions de estoque (1.6), comum ao nível 1 e à pessoa do
 * parceiro: quem chama já resolveu o contexto, conferiu a permissão do módulo
 * e o bloqueio. A regra por LOJA mora em `src/lib/erp/estoque.ts`, que recebe
 * o alcance e confere a loja de novo. Aqui só se lê o formulário e se traduz
 * o resultado.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { concluirAbertura, contarItem, descartarAbertura, iniciarAbertura, type ResultadoDoItem, type ResultadoEstoque } from '@/lib/erp/estoque';
import { concluirContagem, contarNaContagem, descartarContagem, iniciarCiclo, iniciarFechamento, salvarRegras, type ConfigDoPeriodo } from '@/lib/erp/contagem';
import type { RegrasDaContagem } from '@/lib/erp/contagem-campos';
import type { EstadoEstoque, ItemParaSalvar } from './estado';

const vezDe = (anterior: EstadoEstoque) => (anterior?.vez ?? 0) + 1;

export function recusadoNoEstoque(anterior: EstadoEstoque, motivo: string): EstadoEstoque {
  return { ok: false, erros: { geral: motivo }, vez: vezDe(anterior) };
}

function concluir(r: ResultadoEstoque, anterior: EstadoEstoque, base: string, destino: string, feito: string): EstadoEstoque {
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  redirect(`${destino}?feito=${r.jaFeito && feito === 'aberto' ? 'ja-aberto' : feito}`);
}

export async function executarIniciar(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, anterior: EstadoEstoque, base: string) {
  const r = await iniciarAbertura(cliente, alcance, lojaId, autorNome);
  return concluir(r, anterior, base, `${base}/${lojaId}/abertura`, 'iniciada');
}

export async function executarConcluir(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await concluirAbertura(cliente, alcance, lojaId, { versao: form.get('versao'), confirmarNaoContados: form.get('confirmarNaoContados') }, autorNome);
  return concluir(r, anterior, base, `${base}/${lojaId}`, 'aberto');
}

export async function executarDescartar(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await descartarAbertura(cliente, alcance, lojaId, form.get('motivo'), autorNome);
  return concluir(r, anterior, base, `${base}/${lojaId}`, 'descartada');
}

/** Salvar um item: resposta em dados (a tela mostra Salvo/Falha/conflito no próprio item). */
export async function executarContar(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, item: ItemParaSalvar): Promise<ResultadoDoItem> {
  const entrada = item && typeof item === 'object' ? item : ({} as ItemParaSalvar);
  return contarItem(cliente, alcance, lojaId, entrada, autorNome);
}

// ================================================================ 1.7: contagem do dia a dia

export async function executarIniciarCiclo(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await iniciarCiclo(cliente, alcance, lojaId, { insumoIds: form.getAll('insumo'), titulo: form.get('titulo') }, autorNome);
  if (!r.ok) return { ok: false as const, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  redirect(`${base}/${lojaId}/contagens/${r.id}?feito=ciclo`);
}

export async function executarContarNaContagem(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, contagemId: string, item: ItemParaSalvar): Promise<ResultadoDoItem> {
  const entrada = item && typeof item === 'object' ? item : ({} as ItemParaSalvar);
  return contarNaContagem(cliente, alcance, lojaId, contagemId, entrada, autorNome);
}

export async function executarConcluirContagem(cliente: ClienteDoParceiro, alcance: Alcance, cfg: ConfigDoPeriodo, autorNome: string, lojaId: string, contagemId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await concluirContagem(cliente, alcance, lojaId, contagemId, { versao: form.get('versao'), confirmarNaoContados: form.get('confirmarNaoContados') }, cfg, autorNome);
  if (!r.ok) return { ok: false as const, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  const fechamento = form.get('tipo') === 'FECHAMENTO';
  redirect(`${base}/${lojaId}/${fechamento ? 'periodo' : `contagens/${contagemId}/conferir`}?feito=${r.jaFeito ? 'ja-aplicada' : fechamento ? 'periodo-fechado' : 'aplicada'}`);
}

export async function executarDescartarContagem(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, contagemId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await descartarContagem(cliente, alcance, lojaId, contagemId, form.get('motivo'), autorNome);
  return concluir(r, anterior, base, `${base}/${lojaId}`, 'ciclo-descartado');
}

export async function executarIniciarFechamento(cliente: ClienteDoParceiro, alcance: Alcance, cfg: ConfigDoPeriodo, autorNome: string, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await iniciarFechamento(cliente, alcance, lojaId, { inicio: form.get('inicio') }, cfg, autorNome);
  if (!r.ok) return { ok: false as const, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  redirect(`${base}/${lojaId}/contagens/${r.id}?feito=${r.jaFeito ? 'fechamento-ja' : 'fechamento'}`);
}

export async function executarSalvarRegras(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const campos = Object.fromEntries(['pisoValor', 'pisoItens', 'freqA', 'freqB', 'freqC', 'tolerancia'].map((k) => [k, form.get(k)]));
  let lidas: RegrasDaContagem | null = null;
  try {
    const l = JSON.parse(String(form.get('lidas') ?? 'null')) as RegrasDaContagem | null;
    if (l && typeof l === 'object' && Object.values(l).every((v) => Number.isSafeInteger(v))) lidas = l;
  } catch {
    lidas = null;
  }
  const r = await salvarRegras(cliente, alcance, lojaId, campos, lidas, autorNome);
  return concluir(r, anterior, base, `${base}/${lojaId}/periodo`, 'regras');
}
