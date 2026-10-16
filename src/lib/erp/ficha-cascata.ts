/**
 * Custo em cascata e grafo de pré-preparos (1.3) — a parte PURA.
 *
 * Pré-preparo é uma ficha que entra em outra (molho no burger, base no molho).
 * O custo dele por unidade (custo da receita ÷ rendimento) é o "preço" do item
 * em quem o usa; mudou o preço da cebola, muda o molho e muda o burger — na
 * hora, porque nada disso é gravado (decisão 53). Cada ficha é calculada UMA
 * vez por leitura (memo) e a conta é fração exata até o fim.
 *
 * O grafo (ficha → pré-preparos que ela usa) nunca tem ciclo e tem no máximo
 * `PROFUNDIDADE_MAXIMA` fichas numa cadeia: quem grava confere com
 * `conferirGrafo` (sob trava, em `fichas.ts`). A conta ainda assim não entra em
 * laço se um ciclo aparecer no banco por fora: o item vira "incompleto".
 */

import { custoDaFicha, custoDoInsumo, type CustoDaFicha, type InsumoDaFicha, type ItemParaCusto } from './ficha-campos';
import { ZERO } from './unidades';

/**
 * Até 5 fichas numa cadeia: prato › molho › base › tempero › (mais uma). É
 * mais que qualquer cozinha usa e mantém a leitura em ≤ 5 idas ao banco.
 */
export const PROFUNDIDADE_MAXIMA = 5;

export interface ItemDaCascata {
  quantidadeMilesimos: number;
  fatorCorrecaoMilesimos: number;
  insumo: Pick<InsumoDaFicha, 'nome' | 'precoEmbalagemCentavos' | 'taxaEntregaCentavos' | 'conteudoMilesimos' | 'ultimaCompra'> | null;
  subfichaId: string | null;
}

export interface FichaDaCascata {
  id: string;
  nome: string;
  rendimentoMilesimos: number;
  itens: ItemDaCascata[];
}

/** Pré-preparo que não dá para custear (ciclo forçado no banco, fora do que foi lido): conta como incompleto. */
function semCusto(motivo: string): CustoDaFicha {
  return { total: ZERO, porRendimento: ZERO, itens: [], semPreco: [], preparosIncompletos: [], faltaPreco: [motivo] };
}

/**
 * Calculadora com memória sobre as fichas lidas: `custo(id)` devolve o custo
 * exato da ficha (com os pré-preparos dela em cascata), ou null se a ficha não
 * foi lida.
 */
export function cascataDeCusto(fichas: ReadonlyMap<string, FichaDaCascata>) {
  const memo = new Map<string, CustoDaFicha>();
  const emCurso = new Set<string>();

  function itens(f: FichaDaCascata): ItemParaCusto[] {
    return f.itens.map((i) => {
      const base = { quantidadeMilesimos: i.quantidadeMilesimos, fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos };
      if (i.subfichaId) {
        const sub = fichas.get(i.subfichaId);
        if (!sub) return { ...base, nome: 'Pré-preparo', custo: null, preparo: semCusto('pré-preparo fora da leitura') };
        if (emCurso.has(sub.id)) return { ...base, nome: sub.nome, custo: null, preparo: semCusto(`ciclo em “${sub.nome}”`) };
        return { ...base, nome: sub.nome, custo: null, preparo: custo(sub.id)! };
      }
      return { ...base, nome: i.insumo?.nome ?? '?', custo: i.insumo ? custoDoInsumo(i.insumo) : null };
    });
  }

  function custo(id: string): CustoDaFicha | null {
    const pronto = memo.get(id);
    if (pronto) return pronto;
    const f = fichas.get(id);
    if (!f) return null;
    emCurso.add(id);
    const c = custoDaFicha(itens(f), f.rendimentoMilesimos);
    emCurso.delete(id);
    memo.set(id, c);
    return c;
  }

  return { custo, calculadas: () => memo.size };
}

// ------------------------------------------------------------------- grafo

/** ficha → pré-preparos que ela usa. */
export type Grafo = ReadonlyMap<string, ReadonlySet<string>>;

export function grafoDasArestas(arestas: readonly { fichaId: string; subfichaId: string | null }[]): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const a of arestas) {
    if (!a.subfichaId) continue;
    if (!g.has(a.fichaId)) g.set(a.fichaId, new Set());
    g.get(a.fichaId)!.add(a.subfichaId);
  }
  return g;
}

export type ConferenciaDoGrafo = { ok: true } | { ok: false; erro: string; subfichaId: string };

/**
 * Se a ficha `fichaId` passar a usar `subfichas`: forma ciclo? passa da
 * profundidade? O grafo de antes não tem ciclo (é conferido em toda
 * gravação), então um ciclo novo passa, por força, pela própria ficha.
 */
export function conferirGrafo(grafo: Grafo, fichaId: string, subfichas: readonly string[], nome: (id: string) => string): ConferenciaDoGrafo {
  const g = new Map<string, ReadonlySet<string>>(grafo);
  g.set(fichaId, new Set(subfichas));

  // Ciclo: um caminho de alguma subficha de volta à ficha.
  const caminho: string[] = [];
  const visto = new Set<string>();
  const volta = (x: string): boolean => {
    if (x === fichaId) return true;
    if (visto.has(x)) return false;
    visto.add(x);
    for (const y of g.get(x) ?? []) {
      caminho.push(y);
      if (volta(y)) return true;
      caminho.pop();
    }
    return false;
  };
  for (const s of subfichas) {
    caminho.length = 0;
    caminho.push(s);
    if (volta(s)) {
      const cadeia = [fichaId, ...caminho].map((id) => `“${nome(id)}”`);
      const frase = cadeia.slice(1).reduce((t, n, i) => `${t}${i === 0 ? ' usa ' : ', que usa '}${n}`, cadeia[0]);
      return {
        ok: false,
        subfichaId: s,
        erro: `Assim fica um círculo: ${frase}. Um pré-preparo não pode entrar, nem por dentro de outro, na receita que ele mesmo usa.`,
      };
    }
  }

  // Profundidade: a maior cadeia que passa pela ficha (quem a usa, acima; o que ela usa, abaixo).
  const pais = new Map<string, Set<string>>();
  for (const [a, filhos] of g) for (const b of filhos) (pais.get(b) ?? pais.set(b, new Set()).get(b)!).add(a);
  const medir = (mapa: ReadonlyMap<string, ReadonlySet<string>>) => {
    const memo = new Map<string, number>();
    const andar = (x: string, pilha: Set<string>): number => {
      if (memo.has(x)) return memo.get(x)!;
      if (pilha.has(x)) return 0; // ciclo antigo forçado no banco: não entra em laço
      pilha.add(x);
      let maior = 0;
      for (const y of mapa.get(x) ?? []) maior = Math.max(maior, andar(y, pilha));
      pilha.delete(x);
      memo.set(x, maior + 1);
      return maior + 1;
    };
    return (x: string) => andar(x, new Set());
  };
  const cadeia = medir(pais)(fichaId) + medir(g)(fichaId) - 1;
  if (cadeia > PROFUNDIDADE_MAXIMA) {
    return {
      ok: false,
      subfichaId: subfichas[0] ?? fichaId,
      erro: `Pré-preparo dentro de pré-preparo vai até ${PROFUNDIDADE_MAXIMA} fichas numa linha (ex.: prato › molho › base). Com esta mudança, a linha teria ${cadeia}.`,
    };
  }
  return { ok: true };
}
