/**
 * Central de Integrações (INT-1.1, decisão 483) — o ciclo de um módulo (Analytics, Financial...) numa conexão, puro.
 *
 *   NAO_SOLICITADO → SOLICITADO       pedido de acesso enviado no Developer (a loja ainda precisa aprovar no Portal do Parceiro)
 *   SOLICITADO     → AUTORIZADO       a verificação de acesso confirmou (token novo enxerga a loja)
 *   AUTORIZADO     → ATIVO            o nível 1 ativou (a sincronização pode rodar)
 *   ATIVO          → PAUSADO          pausa manual (ou proteção: limite, erro repetido)
 *   PAUSADO        → ATIVO            retomar
 *   qualquer acesso → ERRO_PERMISSAO  o provedor respondeu 403: para, sem nova tentativa automática (consultar loja não
 *                                     autorizada é infração no iFood)
 *   ERRO_PERMISSAO → SOLICITADO | AUTORIZADO  novo pedido, ou a verificação voltou a confirmar
 *   SOLICITADO     → NAO_SOLICITADO   pedido cancelado
 *
 * No ambiente TEST a loja de teste já vem autorizada para o app de teste: NAO_SOLICITADO → AUTORIZADO direto. Em PRODUCAO, nunca
 * (toda loja passa pelo pedido e pela aprovação do responsável dela).
 */

export const ESTADOS_DO_MODULO = ['NAO_SOLICITADO', 'SOLICITADO', 'AUTORIZADO', 'ATIVO', 'PAUSADO', 'ERRO_PERMISSAO'] as const;
export type EstadoDoModulo = (typeof ESTADOS_DO_MODULO)[number];

export const ACOES_DO_MODULO = ['solicitar', 'cancelar-pedido', 'autorizar', 'ativar', 'pausar', 'retomar', 'erro-permissao'] as const;
export type AcaoDoModulo = (typeof ACOES_DO_MODULO)[number];

export type Ambiente = 'TEST' | 'PRODUCAO';

const DE: Record<AcaoDoModulo, { de: readonly EstadoDoModulo[]; para: EstadoDoModulo }> = {
  solicitar: { de: ['NAO_SOLICITADO', 'ERRO_PERMISSAO'], para: 'SOLICITADO' },
  'cancelar-pedido': { de: ['SOLICITADO'], para: 'NAO_SOLICITADO' },
  autorizar: { de: ['SOLICITADO', 'ERRO_PERMISSAO'], para: 'AUTORIZADO' },
  ativar: { de: ['AUTORIZADO'], para: 'ATIVO' },
  pausar: { de: ['ATIVO'], para: 'PAUSADO' },
  retomar: { de: ['PAUSADO'], para: 'ATIVO' },
  'erro-permissao': { de: ['AUTORIZADO', 'ATIVO', 'PAUSADO'], para: 'ERRO_PERMISSAO' },
};

export function ehAcaoDoModulo(x: unknown): x is AcaoDoModulo {
  return typeof x === 'string' && (ACOES_DO_MODULO as readonly string[]).includes(x);
}

/** O estado depois da ação, ou null quando a ação não vale a partir de `atual` (nada muda). */
export function transicao(atual: EstadoDoModulo, acao: AcaoDoModulo, ambiente: Ambiente): EstadoDoModulo | null {
  if (acao === 'autorizar' && atual === 'NAO_SOLICITADO') return ambiente === 'TEST' ? 'AUTORIZADO' : null;
  const regra = DE[acao];
  return regra.de.includes(atual) ? regra.para : null;
}

/** A frase de por que a ação não vale agora (para a tela do nível 1). */
export function porQueNao(atual: EstadoDoModulo, acao: AcaoDoModulo, ambiente: Ambiente): string {
  if (acao === 'autorizar' && atual === 'NAO_SOLICITADO' && ambiente === 'PRODUCAO') {
    return 'Em produção, a loja precisa receber o pedido de acesso e aprovar no Portal do Parceiro antes.';
  }
  return `Este módulo está ${ROTULO_DO_ESTADO[atual].toLowerCase()}: não dá para ${ROTULO_DA_ACAO[acao]} agora.`;
}

export const ROTULO_DO_ESTADO: Record<EstadoDoModulo, string> = {
  NAO_SOLICITADO: 'Não solicitado',
  SOLICITADO: 'Pedido enviado',
  AUTORIZADO: 'Autorizado',
  ATIVO: 'Ativo',
  PAUSADO: 'Pausado',
  ERRO_PERMISSAO: 'Sem permissão',
};

const ROTULO_DA_ACAO: Record<AcaoDoModulo, string> = {
  solicitar: 'registrar o pedido de acesso',
  'cancelar-pedido': 'cancelar o pedido',
  autorizar: 'marcar como autorizado',
  ativar: 'ativar',
  pausar: 'pausar',
  retomar: 'retomar',
  'erro-permissao': 'registrar erro de permissão',
};

/**
 * A sincronização de um módulo só roda com TUDO junto: o módulo Integração liberado para o parceiro, a conexão ativa, o módulo
 * ativo, a chave geral ligada, o ambiente da conexão combinando com a marca de homologação do parceiro e o app pronto (de TEST,
 * ou de produção HOMOLOGADO). Faltou um, não chama o provedor (e não grava nada). Os dois últimos: decisão 488.
 */
export function podeSincronizar(o: {
  liberado: boolean;
  conexaoAtiva: boolean;
  estado: EstadoDoModulo;
  chaveGeral: boolean;
  ambienteCombina: boolean;
  appPronto: boolean;
}): boolean {
  return o.liberado && o.conexaoAtiva && o.estado === 'ATIVO' && o.chaveGeral && o.ambienteCombina && o.appPronto;
}
