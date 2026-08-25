/**
 * Regras rígidas do Barney — valores hardcoded.
 *
 * NENHUMA configuração do portal sobe estes números. `/rodolfo/config` só
 * aperta (ver `config.ts`). Quem mexer aqui está mudando a regra do negócio,
 * não um parâmetro.
 *
 * Fonte: Master Prompt Caminho 3 + `ledsflowfoods/SKILL.md` +
 * `evolution-api-sysadmin/references/whatsapp-ban-prevention.md`.
 * Onde as duas fontes divergem, vale a mais restritiva — está anotado no ponto.
 */

/** Teto absoluto de abordagens por dia. A skill fala em "20 a 30"; 30 é o topo. */
export const MAX_POR_DIA = 30;

/** Teto por hora. ban-prevention.md tolera 80/h em Business; 8 é muito mais apertado. */
export const MAX_POR_HORA = 8;

/**
 * Piso rígido entre dois envios, em segundos.
 * ban-prevention.md fala em 2–3 s. 120 s é ~40× mais conservador porque aqui
 * é abordagem fria para quem não tem o número salvo — o caso de maior risco.
 */
export const INTERVALO_MIN_S = 120;

/** Faixa aleatória padrão entre envios (segundos). Nunca sorteia abaixo do piso. */
export const INTERVALO_PADRAO_MIN_S = 300;
export const INTERVALO_PADRAO_MAX_S = 1200;

/**
 * Rampa de número novo, por semana desde o primeiro envio.
 * ban-prevention.md manda < 20/dia na 1ª semana; a rampa começa em 10 — vence
 * a mais restritiva.
 */
export const RAMPA_POR_SEMANA = [10, 20] as const;
export const RAMPA_TETO_FINAL = MAX_POR_DIA;

/** Os N primeiros envios de qualquer número são manuais, um a um. */
export const ENVIOS_MANUAIS_INICIAIS = 10;

/** Janela padrão: seg–sex, 10h–18h. Configurável para DENTRO, nunca para fora. */
export const JANELA_PADRAO = {
  diasSemana: [1, 2, 3, 4, 5], // Luxon: 1=segunda … 7=domingo
  horaInicio: 10,
  horaFim: 18,
} as const;

export const TIMEZONE = 'America/Sao_Paulo';

/** Cadência: 3 toques e para. Offsets em dias a partir do D0. */
export const TOQUES = [
  { toque: 'D0' as const, offsetDias: 0 },
  { toque: 'D4' as const, offsetDias: 4 },
  { toque: 'D10' as const, offsetDias: 10 },
];

export type Toque = (typeof TOQUES)[number]['toque'];

/** Stop-loss — qualquer um dispara pausa geral + notificação. */
export const STOP_LOSS = {
  falhasConsecutivas: 3,
  taxaEntregaMinima: 0.7,
  estadoInstanciaExigido: 'open',
  /**
   * Amostra mínima antes da taxa de entrega poder pausar o dia.
   * Sem isso, a primeira mensagem que demora a confirmar entrega deixa o dia em
   * 0% e pausa tudo às 10h01. Com 10, a taxa só fala quando tem o que dizer.
   */
  amostraMinimaEntrega: 10,
} as const;

/**
 * Conflito de interesse: Rodolfo é gestor de delivery do Grupo Bibi Sucos.
 * Prospectar concorrente direto do empregador cria problema.
 */
export const CONFLITO_TERRITORIOS = [
  'tijuca',
  'norte shopping',
  'norteshopping',
  'botafogo',
  'rio sul',
  'riosul',
] as const;

export const CONFLITO_CATEGORIAS = [
  'suco',
  'sucos',
  'acai',
  'açaí',
  'acaí',
  'açai',
  'salada',
  'saladas',
  'saladaria',
] as const;

/**
 * Palavras de opt-out. Casadas por normalização (sem acento, minúsculas) e
 * checadas ANTES de qualquer IA — nunca dependemos de modelo para honrar saída.
 */
export const OPT_OUT_FRASES = [
  'nao tenho interesse',
  'sem interesse',
  'nao quero',
  'nao me mande',
  'nao me manda',
  'nao envie',
  'nao escreva',
  'me tira da lista',
  'tira da lista',
  'me remove',
  'remover',
  'descadastrar',
  'cancelar inscricao',
  'para de mandar',
  'pare de mandar',
  'nao perturbe',
  'me deixa em paz',
] as const;

/** Palavras isoladas de opt-out — só valem como a mensagem inteira. */
export const OPT_OUT_PALAVRAS_ISOLADAS = [
  'nao',
  'pare',
  'para',
  'sair',
  'remover',
  'stop',
  'chega',
] as const;
