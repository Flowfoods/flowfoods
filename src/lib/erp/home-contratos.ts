/**
 * Contrato de leitura da Home (H1). Puro: não consulta, autoriza ou calcula.
 * Cada adaptador define o recorte efetivo e omite o widget sem permissão.
 * As famílias são as aprovadas; declarar o tipo não implementa a família.
 */
export type FamiliaDaHome = 'faturamento' | 'cmv' | 'compras' | 'despesas' | 'estoque' | 'producao';
export type EstadoDoWidgetHome = 'ok' | 'parcial' | 'sem_dados' | 'sem_base' | 'indisponivel' | 'erro';

export interface MedidaDoWidgetHome {
  /** Inteiros na unidade canônica; formatação e arredondamento não cabem no DTO. */
  unidade: 'centavos' | 'milesimos' | 'contagem' | 'pontos_base';
  valor: number | null;
}

export interface ReferenciaDoWidgetHome {
  base: 'mes_civil' | 'periodo_apuracao' | 'dia_operacional' | 'posicao_atual';
  rotulo: string;
  /** Datas civis inclusivas; null quando não há intervalo aplicável. */
  inicio: string | null;
  fim: string | null;
  /** Corte efetivo, que pode ser anterior ao fim. Null não significa zero apurado. */
  apuradoAte: string | null;
}

export interface AvisoDoWidgetHome {
  codigo: string;
  /** Texto de produto ou nota da conta canônica, nunca um erro de infraestrutura. */
  texto: string;
}

export interface WidgetHome<Familia extends FamiliaDaHome = FamiliaDaHome> {
  familia: Familia;
  titulo: string;
  estado: EstadoDoWidgetHome;
  /** Esta primeira fatia admite somente uma loja; não simula rede/subconjunto. */
  escopo: { tipo: 'loja'; lojaId: string; nome: string };
  valor: MedidaDoWidgetHome;
  percentual: {
    pontosBase: number | null;
    denominador: (MedidaDoWidgetHome & { rotulo: string }) | null;
  } | null;
  referencia: ReferenciaDoWidgetHome | null;
  origem: {
    fonte: 'faturamento' | 'dre' | 'compras' | 'estoque' | 'producao';
    modo: 'vivo' | 'fotografia';
    fotografia: { id: string; versao: number; versaoDaConta: number; fechadaEm: string } | null;
  } | null;
  cobertura: {
    lojasIncluidas: readonly string[];
    lojasElegiveis: number;
    diasApurados: number | null;
    diasDoPeriodo: number | null;
    faltasDeFaturamento: number | null;
    /** null externo: não se aplica; null interno: a fonte antiga não registrou a cobertura. */
    custosDoEstoque: { semPrecoInicial: number | null; semPrecoFinal: number | null } | null;
  } | null;
  /** Hora fornecida pelo chamador que leu a fonte, nunca data de mudança do cadastro. */
  consultadoEm: string | null;
  avisos: readonly AvisoDoWidgetHome[];
  detalhe: { href: string; rotulo: string };
}
