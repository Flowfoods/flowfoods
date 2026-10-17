/**
 * A leitura ÚNICA que alimenta `montarDre` (2.2b, decisão 153). O DRE ao vivo e a
 * fotografia do fechamento leem por aqui, na MESMA função: é o que faz o fechado bater
 * centavo a centavo com o que a tela mostrava um minuto antes de fechar.
 *
 *  - a RECEITA, só de `faturamentoDosGraos` (a integração vence a digitação), somada por
 *    loja e canal;
 *  - as DESPESAS apropriadas dia a dia ao recorte apurado, somadas por loja e linha;
 *  - o CMV de cada loja (2.3), compra e real, de `cmv.ts` (a data da nota e o fechamento de estoque);
 *  - a taxa do iFood, de `CanalConfig` (a de AGORA: a fotografia a congela);
 *  - o plano, do banco completado pelo padrão (nada é gravado para ler).
 *
 * Recebe o `tx` (uma transação do portão): no fechamento, a trava exclusiva do período
 * já foi pega antes de chamar. O `alcance` filtra as lojas; `lojaId` lê só uma loja.
 */

import type { CmvDoDre } from './cmv-campos';
import { cmvDasLojas } from './cmv';
import { despesasApropriadas, faltaLancar, type RecorrenteEmFalta } from './despesas';
import type { DespesaApropriada, ReceitaLida, TaxaDoIfood } from './dre-campos';
import type { LinhaDoPlano } from './dre-plano';
import { faltasDoIntervalo, faturamentoDosGraos, lojasDoFaturamento, type FaltasDoIntervalo, type LojaDoFaturamento } from './faturamento';
import { PRIMEIRO_DIA_DO_ERP, type Periodo } from './periodo-campos';
import { periodoAnteriorDe } from './periodos';
import { planoDoParceiro } from './plano';
import type { Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';

export interface LeituraDoDre {
  periodo: Periodo;
  /** O último dia que entrou na conta; nulo = nenhum dia apurado. */
  ate: string | null;
  /** As lojas do alcance (qualquer situação). */
  lojas: LojaDoFaturamento[];
  plano: LinhaDoPlano[];
  /** Por loja e canal. */
  receitas: ReceitaLida[];
  /** Por loja (nulo = rede) e linha. */
  despesas: DespesaApropriada[];
  taxaIfood: TaxaDoIfood | null;
  faltas: FaltasDoIntervalo;
  faltaLancar: RecorrenteEmFalta[];
  /** O CMV de cada loja do alcance (2.3). */
  cmv: CmvDoDre;
}

export function somarReceitas(graos: readonly { lojaId: string; canal: ReceitaLida['canal']; valorCentavos: number }[]): ReceitaLida[] {
  const soma = new Map<string, ReceitaLida>();
  for (const g of graos) {
    const k = `${g.lojaId}|${g.canal}`;
    const atual = soma.get(k);
    if (atual) atual.valorCentavos += g.valorCentavos;
    else soma.set(k, { lojaId: g.lojaId, canal: g.canal, valorCentavos: g.valorCentavos });
  }
  return Array.from(soma.values()).sort((a, b) => a.lojaId.localeCompare(b.lojaId) || a.canal.localeCompare(b.canal));
}

export function somarDespesas(itens: readonly DespesaApropriada[]): DespesaApropriada[] {
  const soma = new Map<string, DespesaApropriada>();
  for (const d of itens) {
    const k = `${d.lojaId ?? ''}|${d.linhaId}`;
    const atual = soma.get(k);
    if (atual) atual.centavos += d.centavos;
    else soma.set(k, { linhaId: d.linhaId, lojaId: d.lojaId, centavos: d.centavos });
  }
  return Array.from(soma.values())
    .filter((d) => d.centavos !== 0)
    .sort((a, b) => (a.lojaId ?? '').localeCompare(b.lojaId ?? '') || a.linhaId.localeCompare(b.linhaId));
}

/**
 * Lê tudo o que o DRE do recorte [periodo.inicio, ate] precisa. `hoje` só decide o que é falta
 * (hoje está em aberto). O período em curso passa `ate` = ontem; o encerrado, o último dia.
 */
export async function entradaDoDre(
  tx: ClienteDoParceiro,
  alcance: Alcance,
  periodo: Periodo,
  ate: string | null,
  opcoes: { hoje: string; lojaId?: string },
): Promise<LeituraDoDre> {
  const lojaId = opcoes.lojaId;
  const lojas = await lojasDoFaturamento(tx, alcance);
  const plano = await planoDoParceiro(tx);
  const graos = ate ? await faturamentoDosGraos(tx, alcance, { de: periodo.inicio, ate, lojaId }) : [];
  const taxaLinha = await tx.canalConfig.findFirst({ where: { canal: 'IFOOD' }, select: { taxaBp: true, taxaPagamentoBp: true } });
  const despesas = ate ? await despesasApropriadas(tx, alcance, { de: periodo.inicio, ate }, lojaId) : [];
  const faltas = ate ? await faltasDoIntervalo(tx, alcance, { de: periodo.inicio, ate, lojaId }, opcoes.hoje) : { total: 0, porLoja: [] as { loja: LojaDoFaturamento; faltas: number }[] };
  const aFalta = await faltaLancar(tx, alcance, periodo.inicio, ate ?? periodo.inicio, opcoes.hoje);
  const anterior = periodo.inicio > PRIMEIRO_DIA_DO_ERP ? await periodoAnteriorDe(tx, periodo) : null;
  const cmv = await cmvDasLojas(tx, lojaId ? lojas.filter((l) => l.id === lojaId) : lojas, periodo, ate, opcoes.hoje, anterior);
  return {
    periodo,
    ate,
    lojas,
    plano,
    receitas: somarReceitas(graos),
    despesas: somarDespesas(despesas),
    taxaIfood: taxaLinha ? { comissaoBp: taxaLinha.taxaBp, pagamentoBp: taxaLinha.taxaPagamentoBp } : null,
    faltas,
    faltaLancar: aFalta,
    cmv,
  };
}
