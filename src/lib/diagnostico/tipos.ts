/**
 * Tipos do Diagnóstico Inteligente da FlowFoods (Caminho 2).
 *
 * Regra de ouro deste pacote: TUDO aqui é puro. Nenhuma função lê relógio,
 * banco, rede ou `process.env`. O motor recebe respostas e devolve avaliação —
 * é isso que permite fixar oito cenários em teste e confiar no resultado.
 */

// ─────────────────────────── Respostas do formulário ───────────────────────────

export type Categoria =
  | "hamburgueria"
  | "pizzaria"
  | "japones"
  | "caseira"
  | "bar"
  | "acai_sucos"
  | "cafeteria_padaria"
  | "churrascaria"
  | "frutos_do_mar"
  | "arabe"
  | "doceria"
  | "outro";

export type Lojas = "vou_abrir" | "uma" | "duas_tres" | "quatro_seis" | "sete_mais";

export type TempoOperacao = "nao_abri" | "menos_1_ano" | "um_tres" | "tres_dez" | "dez_mais";

export type Canal = "salao" | "delivery_proprio" | "ifood" | "outros_apps" | "balcao";

export type PercentualDelivery = "d0_20" | "d20_40" | "d40_60" | "d60_80" | "d80_mais" | "nao_sei";

export type Faturamento =
  | "ate_30k"
  | "f30_60k"
  | "f60_120k"
  | "f120_250k"
  | "f250k_mais"
  | "nao_dizer";

export type Cmv = "sei" | "ideia" | "nao_sei";
export type Dre = "sim" | "as_vezes" | "nao";
export type MargemPrato = "sim" | "parcial" | "nao";
export type Resultado3Meses = "lucro" | "empate" | "prejuizo" | "nao_sei";

export type EquipePorLoja = "e1_5" | "e6_12" | "e13_25" | "e25_mais";
export type SimNao = "sim" | "nao";
export type Rotatividade = "baixa" | "media" | "alta";
export type Treinamento = "processo" | "dia_a_dia" | "nenhum";
export type FichasTecnicas = "sim" | "parcial" | "nao";
export type HorasOperacao = "menos_4" | "h4_8" | "h8_12" | "h12_mais";

export type NotaIfood = "n48_mais" | "n45_47" | "n40_44" | "n_abaixo_40" | "nao_sei";
export type RespondeAvaliacoes = "sempre" | "as_vezes" | "nunca";
export type Campanhas = "com_controle" | "sem_saber" | "nao_faco";
export type Cancelamentos = "raro" | "semana" | "dia";
export type Fotos = "profissionais" | "celular" | "sem_fotos";

export type BaseClientes = "organizada" | "whatsapp" | "nao_tenho";
export type Fidelidade = "tenho" | "ja_tentei" | "nunca";
export type Mensagens = "regularmente" | "as_vezes" | "nunca";
export type Sistema = "pdv_erp" | "planilhas" | "caderno_nada";

export type Dor =
  | "vendas_caindo"
  | "margem_apertada"
  | "nao_sei_numeros"
  | "equipe"
  | "ifood_nao_performa"
  | "operacao_baguncada"
  | "custos_altos"
  | "cardapio_grande"
  | "poucos_voltam"
  | "abrir_nova_loja"
  | "abrir_primeira_loja"
  | "marketing"
  | "outra";

export type Objetivo6Meses =
  | "parar_perder"
  | "organizar"
  | "vender_delivery"
  | "crescer_abrir"
  | "sair_operacao";

export type Urgencia = "pra_ontem" | "este_mes" | "planejando";
export type QuemDecide = "so_eu" | "socios" | "familia";
export type JaContratouConsultoria = "deu_certo" | "nao_deu_certo" | "nunca";
export type MelhorHorario = "manha" | "tarde" | "noite";

/**
 * As respostas da etapa 5 só existem quando o dono marcou iFood ou outros apps
 * na etapa 2. Modeladas como bloco opcional inteiro — e não como cinco campos
 * opcionais soltos — porque a ausência tem significado: "esta casa não vende
 * por app", e não "esta casa não respondeu". O score digital vira N/A, não zero.
 */
export interface RespostasDelivery {
  notaIfood: NotaIfood;
  respondeAvaliacoes: RespondeAvaliacoes;
  campanhas: Campanhas;
  cancelamentos: Cancelamentos;
  fotos: Fotos;
}

export interface Respostas {
  // etapa 1
  restaurante: string;
  categoria: Categoria;
  lojas: Lojas;
  tempoOperacao: TempoOperacao;
  bairroCidade: string;
  // etapa 2
  canais: Canal[];
  percentualDelivery: PercentualDelivery;
  ifoodUrl?: string;
  instagram?: string;
  // etapa 3
  faturamento: Faturamento;
  cmv: Cmv;
  dre: Dre;
  margemPrato: MargemPrato;
  resultado3Meses: Resultado3Meses;
  // etapa 4
  equipePorLoja: EquipePorLoja;
  gerente: SimNao;
  rotatividade: Rotatividade;
  treinamento: Treinamento;
  fichasTecnicas: FichasTecnicas;
  horasOperacao: HorasOperacao;
  // etapa 5 (condicional)
  delivery?: RespostasDelivery;
  // etapa 6
  baseClientes: BaseClientes;
  fidelidade: Fidelidade;
  mensagens: Mensagens;
  sistema: Sistema;
  // etapa 7
  dores: Dor[];
  tiraSono?: string;
  objetivo6meses: Objetivo6Meses;
  urgencia: Urgencia;
  quemDecide: QuemDecide;
  jaContratouConsultoria: JaContratouConsultoria;
  // etapa 8
  nome: string;
  whatsapp: string;
  email?: string;
  melhorHorario: MelhorHorario;
  consentimento: true;
}

// ────────────────────────────── Saída do motor ──────────────────────────────

export type ModuloId = "estrutura" | "ifood" | "equipe" | "financeiro" | "crm" | "saas";

export type Momento =
  | "PRE_ABERTURA"
  | "SOBREVIVENCIA"
  | "ESTABILIZACAO"
  | "CRESCIMENTO"
  | "ESCALA";

export type Flag =
  | "REDE"
  | "CONFLITO"
  | "PRIORIDADE"
  | "OBJECAO_ALTA"
  | "DECISAO_COMPARTILHADA";

export type NivelOfertaId =
  | "projeto_estrutura"
  | "focada_estancar"
  | "focada_organizar"
  | "completa"
  | "parceria";

export interface Scores {
  financeiro: number;
  operacao: number;
  /** `null` quando a casa não vende por app: N/A não é zero, e não penaliza. */
  digital: number | null;
}

export interface ModuloRanqueado {
  modulo: ModuloId;
  nome: string;
  pontos: number;
  /** De onde vieram os pontos — é o que o Rodolfo lê para conferir o ranking. */
  razoes: string[];
}

export interface NivelOferta {
  id: NivelOfertaId;
  nome: string;
  composicao: string;
  modulos: ModuloId[];
  duracaoSemanas: number;
}

export interface Leitura {
  /** O corpo da leitura, sem a chamada para ação. */
  texto: string;
  /** A chamada para ação — vira botão na tela e link no WhatsApp. */
  cta: string;
  /** `texto` + `cta`: é ESTE que a regra de 120 palavras mede. */
  textoCompleto: string;
  palavras: number;
  sinaisUsados: string[];
}

export interface Avaliacao {
  scores: Scores;
  momento: Momento;
  /** As regras que bateram, na ordem de precedência. Vai para `momentoRazao`. */
  momentoRazao: string[];
  modulosRanqueados: ModuloRanqueado[];
  nivelOferta: NivelOferta;
  flags: Flag[];
  leitura: Leitura;
  versaoFormulario: string;
  versaoConfig: string;
}
