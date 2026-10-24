/**
 * Gráficos do ERP (24/10/2026, referência: módulos da Nina) — a parte pura:
 * escala, marcas do eixo, formato curto de dinheiro e a série diária do
 * faturamento por canal. Sem React, testável.
 *
 * Regra que não muda: dia sem lançamento NÃO é zero. Ele entra na série com
 * valor `null` e um estado ("falta", "em aberto", "antes de começar",
 * "futuro"); a tela desenha o espaço vazio e diz por quê.
 */

import type { LojaNoMes, MesDoFaturamento } from './faturamento';
import { CANAIS_EM_ORDEM, type CanalVenda } from './faturamento-campos';

/** Até 5 marcas "redondas" de 0 até cobrir o máximo (0, 500, 1.000...). */
export function marcasDoEixo(maximo: number, quantas = 4): number[] {
  if (!(maximo > 0) || !Number.isFinite(maximo)) return [0];
  const bruto = maximo / quantas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => p >= bruto) ?? 10 * potencia;
  const marcas: number[] = [];
  for (let v = 0; v < maximo + passo * 0.999; v += passo) marcas.push(Math.round(v * 100) / 100);
  return marcas;
}

/** Dinheiro curto para eixo e rótulo: R$ 850, R$ 1,2 mil, R$ 3,4 mi. Centavos na entrada. */
export function dinheiroCurto(centavos: number): string {
  const reais = centavos / 100;
  const abs = Math.abs(reais);
  const fmt = (n: number, casas: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
  if (abs >= 1_000_000) return `R$ ${fmt(reais / 1_000_000, 1)} mi`;
  if (abs >= 1_000) return `R$ ${fmt(reais / 1_000, abs >= 10_000 ? 0 : 1)} mil`;
  return `R$ ${fmt(reais, 0)}`;
}

export type EstadoDoDia = 'lancado' | 'falta' | 'em-aberto' | 'antes' | 'futuro' | 'sem-lancamento';

export interface DiaDaSerie {
  data: string;
  /** Centavos por canal; null = nada lançado naquele canal (não é zero). */
  valores: Record<CanalVenda, number | null>;
  /** Soma dos canais lançados; null = nenhum canal lançado no dia. */
  total: number | null;
  estado: EstadoDoDia;
  /** Canais que a loja vende e ninguém lançou (só os já vencidos). */
  faltam: CanalVenda[];
}

export interface SerieDoMes {
  dias: DiaDaSerie[];
  /** Canais que aparecem em pelo menos um dia (a legenda só mostra o que existe). */
  canais: CanalVenda[];
  maximo: number;
  diasLancados: number;
  diasComFalta: number;
}

/**
 * A série do mês, somando as lojas do recorte (uma loja ou a rede do alcance).
 * Um dia da rede conta como "falta" se ALGUMA loja deixou de lançar canal
 * vencido; parcial (uma loja lançou, outra não) aparece com valor e com a falta.
 */
export function serieDoMes(m: Pick<MesDoFaturamento, 'dias' | 'lojas' | 'hoje'>, loja?: LojaNoMes): SerieDoMes {
  const lojas = loja ? [loja] : m.lojas;
  const usados = new Set<CanalVenda>();
  const dias: DiaDaSerie[] = m.dias.map((data, i) => {
    const valores: Record<CanalVenda, number | null> = { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null };
    const faltam = new Set<CanalVenda>();
    let algumAntes = false;
    for (const l of lojas) {
      const d = l.dias[i];
      if (!d) continue;
      for (const c of CANAIS_EM_ORDEM) {
        const g = d.canais[c];
        if (g) {
          valores[c] = (valores[c] ?? 0) + g.valorCentavos;
          usados.add(c);
        }
      }
      for (const c of d.faltam) faltam.add(c);
      if (!l.primeiraData || data < l.primeiraData) algumAntes = true;
    }
    const lancados = CANAIS_EM_ORDEM.filter((c) => valores[c] !== null);
    const total = lancados.length ? lancados.reduce((s, c) => s + (valores[c] as number), 0) : null;
    const estado: EstadoDoDia =
      data > m.hoje
        ? 'futuro'
        : faltam.size > 0
          ? 'falta'
          : total !== null
            ? 'lancado'
            : data === m.hoje
              ? 'em-aberto'
              : algumAntes
                ? 'antes'
                : 'sem-lancamento';
    return { data, valores, total, estado, faltam: CANAIS_EM_ORDEM.filter((c) => faltam.has(c)) };
  });
  return {
    dias,
    canais: CANAIS_EM_ORDEM.filter((c) => usados.has(c)),
    maximo: dias.reduce((mx, d) => Math.max(mx, d.total ?? 0), 0),
    diasLancados: dias.filter((d) => d.total !== null).length,
    diasComFalta: dias.filter((d) => d.estado === 'falta').length,
  };
}

/** Frase do estado de um dia sem número (tooltip e tabela). */
export const FRASE_DO_ESTADO: Record<EstadoDoDia, string> = {
  lancado: 'lançado',
  falta: 'falta lançar',
  'em-aberto': 'hoje, ainda em aberto',
  antes: 'antes do primeiro lançamento',
  futuro: 'ainda não chegou',
  'sem-lancamento': 'sem lançamento',
};
