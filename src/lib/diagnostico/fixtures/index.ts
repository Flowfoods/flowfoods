import type { Respostas } from "../tipos";

/**
 * Os oito cenários que o motor precisa acertar sempre: um por momento, mais um
 * por flag que muda a conduta do Rodolfo.
 *
 * São restaurantes inventados de propósito. Nenhum dado de cliente real entra
 * em fixture — e nenhum número de telefone real, tampouco: os daqui usam a
 * faixa 2199999xxxx, que não é de ninguém.
 */

export const BASE: Respostas = {
  restaurante: "Cantina do Zé",
  categoria: "hamburgueria",
  lojas: "uma",
  tempoOperacao: "tres_dez",
  bairroCidade: "Vila Isabel, Rio de Janeiro",

  canais: ["salao", "ifood"],
  percentualDelivery: "d40_60",

  faturamento: "f60_120k",
  cmv: "ideia",
  dre: "as_vezes",
  margemPrato: "parcial",
  resultado3Meses: "empate",

  equipePorLoja: "e6_12",
  gerente: "nao",
  rotatividade: "media",
  treinamento: "dia_a_dia",
  fichasTecnicas: "parcial",
  horasOperacao: "h8_12",

  delivery: {
    notaIfood: "n45_47",
    respondeAvaliacoes: "as_vezes",
    campanhas: "nao_faco",
    cancelamentos: "semana",
    fotos: "celular",
  },

  baseClientes: "whatsapp",
  fidelidade: "ja_tentei",
  mensagens: "as_vezes",
  sistema: "planilhas",

  dores: ["margem_apertada", "equipe", "poucos_voltam"],
  tiraSono: "O dinheiro entra e não sobra. No fim do mês eu não sei pra onde foi.",
  objetivo6meses: "organizar",
  urgencia: "este_mes",
  quemDecide: "so_eu",
  jaContratouConsultoria: "nunca",

  nome: "José da Silva",
  whatsapp: "5521999990001",
  melhorHorario: "tarde",
  consentimento: true,
};

/** Variante do BASE. `delivery` é substituído inteiro, nunca mesclado pela metade. */
export function comBase(mudancas: Partial<Respostas>): Respostas {
  return { ...BASE, ...mudancas };
}

/** Financeiro no teto (10): sabe CMV, fecha DRE, sabe margem e deu lucro. */
const FINANCEIRO_FORTE = {
  cmv: "sei",
  dre: "sim",
  margemPrato: "sim",
  resultado3Meses: "lucro",
} as const;

export const PRE_ABERTURA = comBase({
  restaurante: "Projeto Maré Alta",
  lojas: "vou_abrir",
  tempoOperacao: "nao_abri",
  canais: ["salao", "delivery_proprio"],
  delivery: undefined,
  percentualDelivery: "nao_sei",
  cmv: "nao_sei",
  dre: "nao",
  margemPrato: "nao",
  resultado3Meses: "nao_sei",
  dores: ["abrir_primeira_loja", "nao_sei_numeros"],
  objetivo6meses: "crescer_abrir",
});

export const SOBREVIVENCIA = comBase({
  restaurante: "Pizzaria da Esquina",
  categoria: "pizzaria",
  resultado3Meses: "prejuizo",
  cmv: "nao_sei",
  dre: "nao",
  margemPrato: "nao",
  rotatividade: "alta",
  treinamento: "nenhum",
  fichasTecnicas: "nao",
  horasOperacao: "h12_mais",
  dores: ["margem_apertada", "nao_sei_numeros", "custos_altos"],
  objetivo6meses: "parar_perder",
});

export const ESTABILIZACAO = BASE;

export const CRESCIMENTO = comBase({
  restaurante: "Sushi Nakamura",
  categoria: "japones",
  ...FINANCEIRO_FORTE,
  gerente: "sim",
  rotatividade: "media",
  treinamento: "dia_a_dia",
  fichasTecnicas: "nao",
  horasOperacao: "h8_12",
  objetivo6meses: "vender_delivery",
  dores: ["vendas_caindo", "ifood_nao_performa", "poucos_voltam"],
});

export const ESCALA = comBase({
  restaurante: "Grupo Sabor Carioca",
  lojas: "duas_tres",
  ...FINANCEIRO_FORTE,
  gerente: "sim",
  rotatividade: "baixa",
  treinamento: "processo",
  fichasTecnicas: "sim",
  horasOperacao: "menos_4",
  sistema: "pdv_erp",
  objetivo6meses: "crescer_abrir",
  dores: ["abrir_nova_loja", "poucos_voltam", "equipe"],
});

export const REDE = comBase({
  restaurante: "Rede Bom Prato",
  lojas: "sete_mais",
  ...FINANCEIRO_FORTE,
  gerente: "sim",
  rotatividade: "media",
  treinamento: "processo",
  fichasTecnicas: "sim",
  horasOperacao: "h4_8",
  sistema: "planilhas",
  objetivo6meses: "crescer_abrir",
  dores: ["equipe", "operacao_baguncada", "abrir_nova_loja"],
});

/**
 * Casa de suco/açaí no território do Grupo Bibi Sucos. Não impede a consultoria
 * — só não dá para o Rodolfo entrar na call sem ter visto isso antes.
 */
export const CONFLITO = comBase({
  restaurante: "Sucos da Praça",
  categoria: "acai_sucos",
  bairroCidade: "Tijuca, Rio de Janeiro",
  dores: ["vendas_caindo", "poucos_voltam", "marketing"],
});

/** Dói agora e sangra agora: é a ligação de hoje, não a da semana que vem. */
export const PRIORIDADE = comBase({
  restaurante: "Boteco do Meio-Fio",
  categoria: "bar",
  resultado3Meses: "prejuizo",
  urgencia: "pra_ontem",
  cmv: "nao_sei",
  dre: "nao",
  dores: ["margem_apertada", "vendas_caindo", "custos_altos"],
  objetivo6meses: "parar_perder",
});

/** Não disse faturamento, está só planejando e já se queimou com consultoria. */
export const OBJECAO_ALTA = comBase({
  restaurante: "Padaria Nova Aurora",
  categoria: "cafeteria_padaria",
  faturamento: "nao_dizer",
  urgencia: "planejando",
  jaContratouConsultoria: "nao_deu_certo",
  quemDecide: "familia",
});

/** Casa saudável que não vende por app: o score digital tem que ser N/A, não 0. */
export const SEM_DELIVERY = comBase({
  restaurante: "Restaurante Dona Cida",
  categoria: "caseira",
  canais: ["salao", "balcao"],
  delivery: undefined,
  percentualDelivery: "d0_20",
  ...FINANCEIRO_FORTE,
  gerente: "sim",
  rotatividade: "baixa",
  treinamento: "processo",
  fichasTecnicas: "sim",
  horasOperacao: "h4_8",
  sistema: "pdv_erp",
  baseClientes: "organizada",
  fidelidade: "tenho",
  dores: ["poucos_voltam"],
  objetivo6meses: "organizar",
});

export const FIXTURES = {
  PRE_ABERTURA,
  SOBREVIVENCIA,
  ESTABILIZACAO,
  CRESCIMENTO,
  ESCALA,
  REDE,
  CONFLITO,
  PRIORIDADE,
  OBJECAO_ALTA,
  SEM_DELIVERY,
} as const;
