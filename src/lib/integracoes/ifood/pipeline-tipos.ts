import type { IdentidadeAnalytics, UnidadeMonetariaAnalytics } from './analytics';
import type { IdentidadePagamentos } from './analytics-pagamentos';
import type { IdentidadeComplementares } from './analytics-complementares';
import type { Classificacao } from './respostas';
import type { DiagnosticoDoColetor } from '../core/diagnostico-coletor';

export type TipoJanela = 'D1' | 'REVISAO' | 'HISTORICO' | 'ACESSO';
export interface JanelaAnalytics {
  moduloId: string;
  dia: string;
  tipo: TipoJanela;
  /** Data civil do planejamento: repetir o mesmo ciclo não reagenda uma janela terminal. */
  ciclo: string;
  fuso: string;
  unidade: UnidadeMonetariaAnalytics['unidade'];
  /** Omissão conserva o planejamento diário legado. ACESSO não aceita outro perfil. */
  perfil?: 'diario' | 'pagamentos' | 'complementares';
}
interface TarefaBase {
  id: string;
  parceiroId: string;
  moduloId: string;
  appId: string;
  lojaId: string;
  geracao: number;
  dono: string;
  tipo: TipoJanela;
  fuso: string;
  unidade: UnidadeMonetariaAnalytics;
}
export type TarefaAnalytics = TarefaBase & (
  | { perfil: 'diario' | 'acesso'; identidade: IdentidadeAnalytics }
  | { perfil: 'pagamentos'; identidade: IdentidadePagamentos }
  | { perfil: 'complementares'; identidade: IdentidadeComplementares }
);
export interface PaginaDoTransporte {
  pagina: number;
  /** Corpo original do HTTP; o repositório faz JSON.parse e calcula o hash destes mesmos bytes. */
  corpoOriginal: string;
  http: number;
  requestId: string | null;
  /** Somente o contrato marginal possui versão explícita; recibos antigos ficam NULL. */
  versaoContrato?: 1;
}
export interface FalhaAnalytics {
  codigo: Classificacao['tipo'] | 'contrato' | 'limite-local' | 'posse-perdida' | 'configuracao' | DiagnosticoDoColetor;
  http?: number | null;
  requestId?: string | null;
  naoAntesDe?: string;
}
export class ErroPipelineAnalytics extends Error {
  constructor(public readonly codigo: 'ACESSO' | 'POSSE' | 'ENTRADA' | 'LIMITE' | 'CORPO', mensagem: string) {
    super(mensagem);
    this.name = 'ErroPipelineAnalytics';
  }
}
export const LIMITE_BYTES_JANELA = 32 * 1024 * 1024;
export const LIMITE_GRUPOS_JANELA = 50_000;
export const LEASE_SEGUNDOS = 120;
export const PRIORIDADE: Record<TipoJanela, number> = { ACESSO: 0, D1: 1, REVISAO: 2, HISTORICO: 3 };
/** A ordenação por perfil precede este valor. Só vale até a aquisição da releitura diária pedida. */
export const PRIORIDADE_RELEITURA_DIARIA = 0;
