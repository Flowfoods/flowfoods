/** Central de Integrações (INT-1.8) — rótulos e tons da tela do nível 1. Puro. */

import type { AppDeIntegracao } from '@/lib/integracoes/core/apps';
import type { CategoriaDeApp } from '@/lib/integracoes/core/campos';
import type { AcaoDoModulo, EstadoDoModulo } from '@/lib/integracoes/core/estados';

type Tom = 'ok' | 'alerta' | 'erro' | 'neutro';
type Homologacao = AppDeIntegracao['estadoHomologacao'];

export const QUANDO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export const ROTULO_DA_CATEGORIA: Record<CategoriaDeApp, string> = { TEST: 'Teste', BI: 'BI', FINANCAS: 'Finanças', AVALIACOES: 'Avaliações' };

export const ROTULO_DA_HOMOLOGACAO: Record<Homologacao, string> = {
  NAO_SE_APLICA: 'Teste: sem homologação',
  PENDENTE: 'Homologação pendente',
  EM_ANDAMENTO: 'Homologação em andamento',
  HOMOLOGADO: 'Homologado',
  RECUSADO: 'Homologação recusada',
};

export const TOM_DA_HOMOLOGACAO: Record<Homologacao, Tom> = { NAO_SE_APLICA: 'neutro', PENDENTE: 'alerta', EM_ANDAMENTO: 'alerta', HOMOLOGADO: 'ok', RECUSADO: 'erro' };

export const TOM_DO_ESTADO: Record<EstadoDoModulo, Tom> = { NAO_SOLICITADO: 'neutro', SOLICITADO: 'alerta', AUTORIZADO: 'neutro', ATIVO: 'ok', PAUSADO: 'alerta', ERRO_PERMISSAO: 'erro' };

/** As ações que a tela oferece, na ordem em que aparecem (a de erro de permissão é só do serviço). */
export const ACOES_NA_TELA: readonly { acao: Exclude<AcaoDoModulo, 'erro-permissao'>; rotulo: string }[] = [
  { acao: 'autorizar', rotulo: 'Marcar como autorizado' },
  { acao: 'solicitar', rotulo: 'Registrar pedido de acesso' },
  { acao: 'cancelar-pedido', rotulo: 'Cancelar pedido' },
  { acao: 'ativar', rotulo: 'Ativar' },
  { acao: 'pausar', rotulo: 'Pausar' },
  { acao: 'retomar', rotulo: 'Retomar' },
];

/** Os passos do comando da leitura de teste, com nome de gente. */
export const ROTULO_DO_PASSO: Record<string, string> = {
  lojas: 'Lista de lojas',
  'analytics-minimo': 'Analytics, consulta mínima',
  'analytics-do-dia': 'Analytics do dia',
};
