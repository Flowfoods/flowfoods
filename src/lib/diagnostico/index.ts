/**
 * @flowfoods/diagnostico — o motor do Diagnóstico Inteligente (Caminho 2).
 *
 * Pacote sem framework, sem banco e sem rede: tudo aqui é função pura sobre as
 * respostas do formulário. É o que permite levá-lo inteiro para o repositório
 * `portal-flowfoods` sem reescrever nada — veja o README.
 */

export { config, contarPalavras, termosProibidosEm } from "./config";
export type { ConfigDiagnostico } from "./config";

export * from "./tipos";

export { avaliar } from "./motor/avaliar";
export { calcularScores } from "./motor/scores";
export { definirMomento, quantidadeDeLojas } from "./motor/momento";
export { ranquearModulos, ORDEM_CANONICA } from "./motor/modulos";
export { sugerirNivel } from "./motor/nivel";
export { detectarFlags } from "./motor/flags";
export { montarLeitura, selecionarSinais, validarBibliotecas } from "./motor/leitura";
export type { ProblemaDeCopy } from "./motor/leitura";

export {
  celularSchema,
  ETAPAS_SCHEMAS,
  etapa5Aplicavel,
  etapasAplicaveis,
  montarRespostas,
  normalizarCelular,
  rotuloDeProgresso,
} from "./formulario";

export { MODELO_PADRAO, PROMPT_VERSION, SYSTEM_PROMPT, montarEntradaIA } from "./ia/prompt";
export type { RaioXIfood } from "./ia/prompt";
export { preDiagnosticoSchema, lerPreDiagnostico } from "./ia/schema";
export type { PreDiagnostico } from "./ia/schema";
export { custoEmBRL, podeGerar, precoSonnet5 } from "./ia/orcamento";
export type { EstadoDoOrcamento, PrecoPorMTok, UsoDeTokens } from "./ia/orcamento";
export { conferirCoerencia, gerarPreDiagnostico, montarRequisicao } from "./ia/gerar";
export type { RequisicaoIA, ResultadoGeracao, Transporte } from "./ia/gerar";

export { gerarSlots, slotDisponivel, rotularSlot, JANELAS_PADRAO } from "./agenda/slots";
export type { Intervalo, JanelaDisponibilidade, OpcoesSlots } from "./agenda/slots";

export { chaveDeComparacao, semAcento } from "./texto";
