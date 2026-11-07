/** Identidades reservadas para 3B; 3A não configura, classifica nem filtra faixas. */
import type { CanalVenda } from './canal-campos';

export const FAIXAS_DO_CMV = ['muitoFavoravel', 'favoravel', 'confortavel', 'atencao', 'critico'] as const;
export type FaixaDoCmv = (typeof FAIXAS_DO_CMV)[number];
export const ESTADOS_DAS_FAIXAS_DO_CMV = ['semDados', 'naoOfertado', 'faixasNaoConfiguradas'] as const;
export type EstadoDaFaixaDoCmv = (typeof ESTADOS_DAS_FAIXAS_DO_CMV)[number];
export type FiltroDaFaixaDoCmv = { canal: CanalVenda; faixa: FaixaDoCmv | EstadoDaFaixaDoCmv };
