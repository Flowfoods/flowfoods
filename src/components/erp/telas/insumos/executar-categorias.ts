/**
 * O miolo das actions de categoria e de classificação (I.1a), comum ao nível 1 e à pessoa do parceiro: quem chama já resolveu o
 * contexto e conferiu a permissão (`insumos.categorias` para categoria e classificação assistida, `insumos.editar` para a
 * edição em lote) e o bloqueio. Aqui só se traduz o resultado: erro volta para o formulário; sucesso revalida e volta para a
 * MESMA tela com a frase do que aconteceu (`?feito=`; a URL só escolhe uma chave do mapa, o nome vem do banco).
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { EstadoCadastro } from '../cadastro/estado';
import { fraseDe } from '../cadastro/estado';

const vezDe = (anterior: EstadoCadastro) => (anterior?.vez ?? 0) + 1;

/** O que a regra de categoria devolve. */
export type ResultadoDeCategoria = { ok: true; id: string; mudou: string[] } | { ok: false; erros: Record<string, string>; conflito?: boolean };

/** Depois de gravar: volta para a tela de `rota` com a frase. `cat` leva o id para a tela dizer o NOME (lido do banco). */
export function concluirNaTela(
  r: ResultadoDeCategoria,
  anterior: EstadoCadastro,
  rota: string,
  feito: { mudou: string; igual?: string },
  base: string,
): EstadoCadastro {
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  const frase = r.mudou.length === 0 && feito.igual ? feito.igual : feito.mudou;
  redirect(`${rota}?feito=${frase}&cat=${encodeURIComponent(r.id)}`);
}

/** Sem estado de formulário (botão de subir e descer): se a regra recusou, volta com a frase da recusa. */
export function voltarDoMover(r: ResultadoDeCategoria, rota: string, base: string): never {
  revalidatePath(base, 'layout');
  redirect(r.ok ? `${rota}?feito=${r.mudou.length ? 'moveu' : 'igual'}&cat=${encodeURIComponent(r.id)}` : `${rota}?feito=nao-moveu`);
}

/** As frases do `?feito=` da tela de categorias. O nome da categoria entra pelo banco (`%` é o lugar dele). */
export const FEITO_DA_CATEGORIA: Readonly<Record<string, string>> = {
  criada: 'Categoria criada: %',
  renomeada: 'Categoria renomeada: %',
  igual: 'Nada mudou: o nome já era esse.',
  desativada: 'Categoria desativada: %. Os insumos que estão nela continuam nela; ela só deixa de ser oferecida nos cadastros novos.',
  reativada: 'Categoria reativada: %.',
  excluida: 'Categoria excluída.',
  moveu: 'Ordem da lista mudada: %.',
  'nao-moveu': 'Não deu para mudar a ordem (a categoria do sistema fica sempre por último).',
};

export function fraseDaCategoria(feito: string | undefined, nome: string | null): string | undefined {
  const modelo = fraseDe(FEITO_DA_CATEGORIA, feito);
  if (!modelo) return undefined;
  return modelo.includes('%') ? modelo.replace('%', nome ?? 'a categoria') : modelo;
}

/** Os números do `?feito=` da classificação: só inteiros pequenos (a URL não escolhe mais que isso). */
export function inteiroDaUrl(v: string | undefined): number | null {
  return v && /^\d{1,6}$/.test(v) ? Number(v) : null;
}

/** Volta para a tela de Classificar com a frase (e os números do que aconteceu, que a tela só mostra). */
export function voltarDaClassificacao(rota: string, base: string, feito: string, numeros: Record<string, number | string> = {}): never {
  revalidatePath(base, 'layout');
  const q = new URLSearchParams({ feito, ...Object.fromEntries(Object.entries(numeros).map(([k, v]) => [k, String(v)])) });
  redirect(`${rota}?${q.toString()}`);
}
