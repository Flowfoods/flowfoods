/** Projeção física: não recebe preço, tolerância ou classificações financeiras. */
import { trechosDoInsumo, rotuloDoSetor, type Marco, type Fluxo } from './requisicao-campos';
import type { Unidade } from './unidades';

export function divergenciasOperacionais(
  itens: readonly { insumoId: string; nome: string; unidade: Unidade; marcos: readonly Marco[]; fluxos: readonly Fluxo[] }[],
  janela: { de: Date; ate: Date },
) {
  const linhas = itens.flatMap((i) => {
    const ts = trechosDoInsumo(i.marcos, i.fluxos).filter((t) => t.ate >= janela.de && t.ate < janela.ate);
    if (!ts.length) return [];
    const soma = (campo: 'consumoMilesimos' | 'requisitadoMilesimos' | 'outrasSaidasMilesimos' | 'sumicoMilesimos') => ts.reduce((total, t) => total + t[campo], 0);
    const requisitadoPorSetor = new Map<string, number>();
    for (const t of ts) for (const [setor, q] of Array.from(t.requisitadoPorSetor)) requisitadoPorSetor.set(setor, (requisitadoPorSetor.get(setor) ?? 0) + q);
    return [{
      insumoId: i.insumoId, nome: i.nome, unidade: i.unidade, trechos: ts.length,
      consumoMilesimos: soma('consumoMilesimos'), requisitadoMilesimos: soma('requisitadoMilesimos'),
      outrasSaidasMilesimos: soma('outrasSaidasMilesimos'), sumicoMilesimos: soma('sumicoMilesimos'),
      requisitadoPorSetor, ultimoTrecho: { de: ts[ts.length - 1].de, ate: ts[ts.length - 1].ate },
      sumicoCentavos: null, pequenos: null,
    }];
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.insumoId.localeCompare(b.insumoId));
  const resumo = {
    comSumico: linhas.filter((l) => l.sumicoMilesimos > 0).length,
    comSobra: linhas.filter((l) => l.sumicoMilesimos < 0).length,
    sumicoCentavos: null, sobraCentavos: null, semPreco: null, pequenosRepetidos: null, pequenosCentavos: null,
  };
  const porSetor = new Map<string, { setor: string; quantosInsumos: number; insumosComSumico: number; requisitadoCentavos: null; sumicoNosSeusCentavos: null }>();
  for (const l of linhas) for (const [setor, q] of Array.from(l.requisitadoPorSetor)) {
    if (q <= 0) continue;
    const s = porSetor.get(setor) ?? { setor, quantosInsumos: 0, insumosComSumico: 0, requisitadoCentavos: null, sumicoNosSeusCentavos: null };
    s.quantosInsumos++;
    if (l.sumicoMilesimos > 0) s.insumosComSumico++;
    porSetor.set(setor, s);
  }
  const setores = Array.from(porSetor.values()).sort((a, b) => rotuloDoSetor(a.setor || null).localeCompare(rotuloDoSetor(b.setor || null), 'pt-BR') || a.setor.localeCompare(b.setor));
  return { linhas, resumo, setores };
}
