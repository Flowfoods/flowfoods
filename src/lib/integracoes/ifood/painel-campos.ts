/** Contrato puro do painel. Strings decimais não passam por Number. */
import type { PagamentosDoPainelAnalytics } from './painel-pagamentos';
export type InteiroDecimalAnalytics = string;
export type MotivoSemDadoAnalytics = 'cobertura-parcial' | 'sem-fontes' | 'valor-nao-informado' | 'sem-pedidos' | 'status-nao-classificado' | 'contrato-indisponivel';
export type MedidaAnalytics<T> = { estado: 'disponivel'; valor: T } | { estado: 'sem-dado'; motivo: MotivoSemDadoAnalytics };
export interface FracaoAnalytics { numerador: InteiroDecimalAnalytics; denominador: InteiroDecimalAnalytics }
export interface IndicadoresAnalytics {
  gmv: MedidaAnalytics<InteiroDecimalAnalytics>;
  gmvSemEntrega: MedidaAnalytics<InteiroDecimalAnalytics>;
  gmvConcluido: MedidaAnalytics<InteiroDecimalAnalytics>;
  gmvCancelado: MedidaAnalytics<InteiroDecimalAnalytics>;
  pedidos: MedidaAnalytics<InteiroDecimalAnalytics>;
  concluidos: MedidaAnalytics<InteiroDecimalAnalytics>;
  cancelados: MedidaAnalytics<InteiroDecimalAnalytics>;
  /** Fração em centavos por pedido CONCLUDED; arredondar apenas a apresentação. */
  ticketConcluidos: MedidaAnalytics<FracaoAnalytics>;
  /** Fração CANCELLED/total observado, sem multiplicar por 100 neste contrato. */
  taxaCancelamento: MedidaAnalytics<FracaoAnalytics>;
}
export interface ParcelaAnalytics { valor: string | null; pedidos: InteiroDecimalAnalytics }
export interface ResumoDoPainelAnalytics {
  indicadores: IndicadoresAnalytics;
  distribuicoes: {
    canal: MedidaAnalytics<ParcelaAnalytics[]>;
    status: MedidaAnalytics<ParcelaAnalytics[]>;
    logistica: MedidaAnalytics<ParcelaAnalytics[]>;
    pagamento: MedidaAnalytics<ParcelaAnalytics[]>;
    horario: MedidaAnalytics<ParcelaAnalytics[]>;
    primeiroPedido: MedidaAnalytics<ParcelaAnalytics[]>;
  };
}
export type EstadoCoberturaAnalytics = 'publicado' | 'vazio-oficial' | 'ausente' | 'vinculo-ambiguo' | 'identidade-incompativel' | 'versao-pendente';
export interface CoberturaDaFonteAnalytics {
  chave: string;
  estado: EstadoCoberturaAnalytics;
  publicadaEm: string | null;
  /** Uma versão pendente não substitui a publicação anterior utilizável. */
  revisaoPendente: boolean;
}
export interface DiaDeCoberturaAnalytics { dia: string; completo: boolean; fontes: CoberturaDaFonteAnalytics[] }
export interface CoberturaDoPainelAnalytics {
  completa: boolean;
  diasEsperados: number;
  diasCompletos: number;
  fontesSelecionadas: number;
  paresEsperados: number;
  paresCobertos: number;
  dias: DiaDeCoberturaAnalytics[];
}
export interface FonteDoPainelAnalytics { chave: string; nome: string; marca: string | null; selecionada: boolean; ambigua: boolean; ativa: boolean }
export interface PainelAnalytics {
  loja: { id: string; nome: string };
  ambiente: 'TEST' | 'PRODUCAO';
  periodo: { inicio: string; fim: string; fuso: 'America/Sao_Paulo'; ateOntem: string };
  fontes: FonteDoPainelAnalytics[];
  cobertura: CoberturaDoPainelAnalytics;
  pagamentos: PagamentosDoPainelAnalytics;
  resumo: ResumoDoPainelAnalytics;
  serie: Array<{ dia: string; completo: boolean; indicadores: IndicadoresAnalytics }>;
}
export interface ContextoServidorDoPainelAnalytics { parceiroId: string; homologacaoDeIntegracao: boolean }
export interface EntradaDoPainelAnalytics { lojaId?: unknown; inicio?: unknown; fim?: unknown; merchants?: unknown }
export interface FiltrosDoPainelAnalytics { lojaId: string; inicio: string; fim: string; merchants: string[] }
export type ResultadoDoPainelAnalytics =
  | { ok: true; lojas: Array<{ id: string; nome: string }>; filtros: FiltrosDoPainelAnalytics; ambiente: 'TEST' | 'PRODUCAO'; painel: PainelAnalytics | null }
  | { ok: false; motivo: 'sem-permissao' | 'nao-liberado' | 'contexto-invalido' | 'filtro-invalido' | 'recorte-grande' | 'leitura-indisponivel'; mensagem: string };

export const FUSO_DO_PAINEL = 'America/Sao_Paulo' as const;
/** Orçamento de DTO/consulta, não limite comercial nem declaração de retenção histórica. */
export const MAX_PARES_DO_PAINEL = 6_000;
export const MAX_PARCELAS_DO_PAINEL = 2_000;
export const UUID_DO_MERCHANT = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

export function diaDoPainelValido(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor < '0001-01-01') return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}
export function deslocarDiaDoPainel(dia: string, deslocamento: number): string {
  const data = new Date(`${dia}T00:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + deslocamento);
  return data.toISOString().slice(0, 10);
}
export function ontemDoPainelAnalytics(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_DO_PAINEL, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(agora);
  const parte = (tipo: string) => partes.find(p => p.type === tipo)!.value;
  return deslocarDiaDoPainel(`${parte('year')}-${parte('month')}-${parte('day')}`, -1);
}
export function lerFiltrosDoPainelAnalytics(entrada: EntradaDoPainelAnalytics, ontem = ontemDoPainelAnalytics()): FiltrosDoPainelAnalytics | null {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) || !diaDoPainelValido(ontem)) return null;
  const loja = entrada.lojaId === undefined || entrada.lojaId === '' ? '' : entrada.lojaId;
  if (typeof loja !== 'string' || loja.length > 128 || (loja !== '' && loja.trim() !== loja)) return null;
  const inicio = entrada.inicio === undefined || entrada.inicio === '' ? deslocarDiaDoPainel(ontem, -29) : entrada.inicio;
  const fim = entrada.fim === undefined || entrada.fim === '' ? ontem : entrada.fim;
  if (!diaDoPainelValido(inicio) || !diaDoPainelValido(fim) || inicio > fim || fim > ontem) return null;
  const valores = entrada.merchants === undefined || entrada.merchants === '' ? [] : typeof entrada.merchants === 'string' ? [entrada.merchants] : entrada.merchants;
  if (!Array.isArray(valores) || valores.length > MAX_PARES_DO_PAINEL || !valores.every(v => typeof v === 'string' && UUID_DO_MERCHANT.test(v))) return null;
  return { lojaId: loja, inicio, fim, merchants: [...new Set<string>(valores)].sort() };
}
export function diasDoPainel(inicio: string, fim: string): string[] | null {
  if (!diaDoPainelValido(inicio) || !diaDoPainelValido(fim) || inicio > fim) return null;
  const tamanho = (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000 + 1;
  if (tamanho > MAX_PARES_DO_PAINEL) return null;
  return Array.from({ length: tamanho }, (_, i) => deslocarDiaDoPainel(inicio, i));
}
