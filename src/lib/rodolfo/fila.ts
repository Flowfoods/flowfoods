/**
 * A situação de cada lead do lote de hoje (E5.1, decisão 473). Uma regra só para o disparo e para a tela: o
 * `dispararProximo` pula exatamente quem esta régua tira da fila, e a Cadência mostra, item a item, quem ainda vai receber
 * e por que os outros não. Antes, a tela só sabia o tamanho do lote: com todos já atendidos, "Enviar o próximo" continuava
 * habilitado e o servidor respondia "Nada elegível no lote de hoje.".
 */

export type SituacaoNoLote =
  | 'NA_FILA'
  | 'ENVIADO'
  | 'SEM_CONFIRMACAO'
  | 'FALHOU'
  | 'TEXTO_RECUSADO'
  | 'RESPONDEU'
  | 'PEDIU_PARA_SAIR'
  | 'CONFLITO'
  | 'FORA_DO_WHATSAPP'
  | 'SEM_CELULAR';

export interface LeadDaFila {
  telefoneNormalizado: string | null;
  status: string;
  canal: string;
}

/**
 * A parte da reconferência que não precisa do banco, na ordem do disparo: sem celular, pediu para sair, conflito com o Bibi,
 * respondeu (a conversa segue pelo Inbox) e movido para Visita e Instagram depois de montado o lote. `null` = o lead segue;
 * falta conferir a lista de quem pediu para sair (pelo telefone) e se a mensagem de hoje já saiu.
 */
export function foraDaFilaPeloLead(lead: LeadDaFila): SituacaoNoLote | null {
  if (!lead.telefoneNormalizado) return 'SEM_CELULAR';
  if (lead.status === 'OPT_OUT') return 'PEDIU_PARA_SAIR';
  if (lead.status === 'CONFLITO') return 'CONFLITO';
  if (lead.status === 'RESPONDEU') return 'RESPONDEU';
  if (lead.canal !== 'WHATSAPP') return 'FORA_DO_WHATSAPP';
  return null;
}

/**
 * A situação completa, com o que vem do banco: telefone na lista de quem pediu para sair, a mensagem de hoje (se houver) e,
 * para quem ainda iria, se o texto montado para ele passa na conferência (`textoRecusado`).
 */
export function situacaoNoLote(
  lead: LeadDaFila,
  banco: { pediuParaSair: boolean; mensagemDeHoje: { status: string } | null; textoRecusado?: boolean },
): SituacaoNoLote {
  const fora = foraDaFilaPeloLead(lead);
  if (fora) return fora;
  if (banco.pediuParaSair) return 'PEDIU_PARA_SAIR';
  // Com a chave do envio de hoje gravada, o disparo não tenta de novo hoje, qualquer que seja o resultado. Gravada e ainda
  // sem resposta da Evolution (PENDENTE: entrega em tentativa, ou o processo caiu antes da rede) não é "enviada".
  const m = banco.mensagemDeHoje;
  if (m) return m.status === 'FALHA' || m.status === 'RECUSADA' ? 'FALHOU' : m.status === 'PENDENTE' ? 'SEM_CONFIRMACAO' : 'ENVIADO';
  // O texto montado para este lead não passa na conferência (emoji demais no nome, link encurtado...): o serviço recusa sem
  // gravar nada, e o disparo pula para o próximo a cada tentativa. Não está na fila de verdade.
  if (banco.textoRecusado) return 'TEXTO_RECUSADO';
  return 'NA_FILA';
}

export const ROTULO_DA_SITUACAO_NO_LOTE: Record<SituacaoNoLote, string> = {
  NA_FILA: 'Na fila',
  ENVIADO: 'Enviada hoje',
  SEM_CONFIRMACAO: 'Sem confirmação',
  FALHOU: 'Não saiu hoje',
  TEXTO_RECUSADO: 'Texto recusado',
  RESPONDEU: 'Respondeu',
  PEDIU_PARA_SAIR: 'Pediu para sair',
  CONFLITO: 'Conflito (Bibi)',
  FORA_DO_WHATSAPP: 'Visita e Instagram',
  SEM_CELULAR: 'Sem celular',
};

export const TOM_DA_SITUACAO_NO_LOTE: Record<SituacaoNoLote, 'ok' | 'alerta' | 'erro' | 'neutro'> = {
  NA_FILA: 'neutro',
  ENVIADO: 'ok',
  SEM_CONFIRMACAO: 'alerta',
  FALHOU: 'erro',
  TEXTO_RECUSADO: 'erro',
  RESPONDEU: 'ok',
  PEDIU_PARA_SAIR: 'neutro',
  CONFLITO: 'neutro',
  FORA_DO_WHATSAPP: 'neutro',
  SEM_CELULAR: 'neutro',
};
