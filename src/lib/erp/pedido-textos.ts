/**
 * Textos e limites do pedido de acesso (0.5) que a landing pública (cliente) e
 * o servidor usam IGUAIS. Sem importar nada: o formulário do site não pode
 * puxar para o navegador o que é do servidor.
 */

/** Texto do consentimento (LGPD) e a versão dele, gravados com o pedido. */
export const CONSENTIMENTO = {
  versao: 'v1',
  texto: 'Autorizo a FlowFoods a usar estes dados só para falar comigo sobre a consultoria e o sistema.',
} as const;

/** Campo escondido: gente não vê nem preenche; robô preenche. */
export const CAMPO_ARMADILHA = 'site_da_empresa';

export const LIMITES_DO_PEDIDO = {
  nome: { min: 2, max: 80 },
  cidade: { min: 2, max: 80 },
  email: { max: 160 },
  lojas: { min: 1, max: 200 },
  marcas: { min: 1, max: 50 },
  motivo: { min: 3, max: 200 },
} as const;

/** A resposta é a MESMA exista ou não o contato, passe ou não pela armadilha. */
export const RESPOSTA_DO_ENVIO = 'Recebemos. O Rodolfo responde pelo WhatsApp em até 2 dias úteis.';
export const RESPOSTA_BLOQUEADO = 'Muitos pedidos deste endereço. Fale pelo WhatsApp.';
export const RESPOSTA_SEM_BANCO = 'O formulário está fora do ar por enquanto. Fale pelo WhatsApp.';
export const RESPOSTA_DE_ERRO = 'Não deu para enviar agora. Fale pelo WhatsApp.';

/** Etapas do quadro (coluna e selo). */
export type EtapaDoPedido = 'NOVO' | 'EM_CONVERSA' | 'ATIVADO' | 'RECUSADO';

export const ROTULO_DA_ETAPA: Record<EtapaDoPedido, string> = {
  NOVO: 'Novo',
  EM_CONVERSA: 'Em conversa',
  ATIVADO: 'Ativado',
  RECUSADO: 'Recusado',
};

export const ORDEM_DAS_ETAPAS: readonly EtapaDoPedido[] = ['NOVO', 'EM_CONVERSA', 'ATIVADO', 'RECUSADO'];

/** Prazos do atraso (decisão 96) e da guarda do recusado (decisão 95). */
export const PRAZO_DO_ATRASO_DIAS = { NOVO: 2, EM_CONVERSA: 7 } as const;
export const RETENCAO_DO_RECUSADO_DIAS = 180;
/** Quanto tempo Ativado e Recusado ficam à vista no quadro. */
export const DIAS_NO_QUADRO = 30;
