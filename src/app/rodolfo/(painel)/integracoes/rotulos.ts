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

/** As ações de módulo que a tela oferece (a sétima, `erro-permissao`, é só do serviço). */
export const ACOES_DA_TELA = ['solicitar', 'cancelar-pedido', 'autorizar', 'ativar', 'pausar', 'retomar'] as const satisfies readonly AcaoDoModulo[];
export type AcaoDaTela = (typeof ACOES_DA_TELA)[number];

/** O que a página diz no topo depois de uma ação cujo botão some (`?feito=`). */
export const FEITO = {
  solicitar: 'Pedido de acesso registrado. Falta a loja aprovar o app no Portal do Parceiro.',
  'cancelar-pedido': 'Pedido de acesso cancelado.',
  autorizar: 'Módulo marcado como autorizado.',
  ativar: 'Módulo ativo. A busca dos números começa quando a sincronização diária existir.',
  pausar: 'Módulo pausado. Nada é buscado nesta loja até retomar.',
  retomar: 'Módulo ativo de novo.',
  preparou: 'Módulo preparado. Ele começa como não solicitado.',
  'ja-preparado': 'Este módulo já estava preparado nesta loja.',
  desligou: 'Loja desligada. Os módulos ativos dela foram pausados; a ligação fica no histórico.',
  'ja-desligada': 'Esta loja já estava desligada.',
  ligou: 'Loja do iFood ligada. Agora prepare, nela, o módulo que vai usar.',
  liberou: 'Módulo Integração liberado para este parceiro.',
  bloqueou: 'Módulo Integração bloqueado. Nada foi apagado.',
  marcou: 'Marcado como parceiro de testes: aqui só entra loja do ambiente de teste.',
  desmarcou: 'Marca de testes retirada: aqui só entra loja de produção.',
  'sem-mudanca': 'Já estava assim; nada mudou.',
} as const satisfies Record<string, string>;
export type CodigoFeito = keyof typeof FEITO;
export const ehCodigoFeito = (x: unknown): x is CodigoFeito => typeof x === 'string' && Object.prototype.hasOwnProperty.call(FEITO, x);

/** "2026-10-28" vira "28/10/2026". */
export const diaBr = (dia: string) => (/^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia.split('-').reverse().join('/') : dia);

/** As ações que a tela oferece, na ordem em que aparecem (a de erro de permissão é só do serviço). */
export const ACOES_NA_TELA: readonly { acao: AcaoDaTela; rotulo: string }[] = [
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
