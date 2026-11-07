import { custoDaFicha, lerFormFicha, quantidadeBruta, type InsumoDaFicha, type PreparoDaFicha, type RendeEm, type TipoFicha } from '@/lib/erp/ficha-campos';
import { ZERO, type CustoExato, type Fracao, type Unidade } from '@/lib/erp/unidades';

export interface LinhaDoItem {
  escolha: string;
  quantidade: string;
  unidade: string;
  fator: string;
}
export interface EscolhidoNaReceita {
  nome: string;
  unidade: Unidade;
  ativo: boolean;
  custo: CustoExato | null;
  porUnidade: Fracao | null;
  preparo: boolean;
  incompleto: boolean;
}
type ContaDaLinha = { q: number; fator: number; bruta: number; custo: Fracao | null };

/** Adapta o formulário ao parser e ao motor canônicos, sem somar ou dividir custos na UI. */
export function previaDaReceita(linhas: readonly (LinhaDoItem & { chave: number })[], porEscolha: ReadonlyMap<string, EscolhidoNaReceita>, tipo: TipoFicha, rendimento: string, rendeEm: RendeEm, jaNaFicha: ReadonlySet<string> = new Set()) {
  const insumos = new Map<string, Pick<InsumoDaFicha, 'id' | 'nome' | 'unidade' | 'ativo'>>();
  const preparos = new Map<string, PreparoDaFicha>();
  for (const [id, e] of porEscolha) {
    if (e.preparo) preparos.set(id, { id, nome: e.nome, tipo: 'PRE_PREPARO', ativa: e.ativo, unidadeRendimento: e.unidade });
    else insumos.set(id, { id, nome: e.nome, unidade: e.unidade, ativo: e.ativo });
  }
  const leitura = lerFormFicha({ nome: 'Prévia da receita', tipo, rendimento, rendimentoUnidade: rendeEm, itens: linhas.map(l => ({
    ...(porEscolha.get(l.escolha)?.preparo ? { subfichaId: l.escolha } : { insumoId: l.escolha }), quantidade: l.quantidade, unidade: l.unidade, fator: l.fator,
  })) }, insumos, jaNaFicha, { preparos });
  const porLinha = new Map<number, ContaDaLinha>();
  // O parser legado aceita vazio como uma porção. Durante a edição do campo, a UI informa pendência sem mudar essa regra.
  if (!leitura.ok || !rendimento.trim()) return {
    total: ZERO, semPreco: [] as string[], incompletos: [] as string[], porLinha, porRende: null,
    pendencia: !rendimento.trim() ? 'Informe um rendimento válido para conferir a prévia.' : (!leitura.ok ? Object.values(leitura.erros)[0] : null) ?? 'Complete a receita para conferir a prévia.',
  };
  const dados = leitura.dados;
  const custo = custoDaFicha(dados.itens.map((i, n) => {
    const e = porEscolha.get(linhas[n].escolha)!;
    return { nome: e.nome, quantidadeMilesimos: i.quantidadeMilesimos, fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos, custo: e.custo,
      ...(e.preparo && e.porUnidade ? { preparo: { porRendimento: e.porUnidade, faltaPreco: e.incompleto ? [e.nome] : [] } } : {}),
    };
  }), dados.rendimentoMilesimos);
  dados.itens.forEach((i, n) => porLinha.set(linhas[n].chave, { q: i.quantidadeMilesimos, fator: i.fatorCorrecaoMilesimos, bruta: quantidadeBruta(i.quantidadeMilesimos, i.fatorCorrecaoMilesimos), custo: custo.itens[n] }));
  return { total: custo.total, semPreco: custo.semPreco, incompletos: custo.preparosIncompletos, porLinha, porRende: custo.porRendimento, pendencia: null };
}
