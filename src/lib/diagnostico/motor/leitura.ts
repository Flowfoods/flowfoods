import {
  config,
  contarPalavras,
  fraseModulo,
  frasesDoMomento,
  nomeModulo,
  primeiraAcao,
  SINAIS_POR_ID,
  termosProibidosEm,
} from "../config";
import type { ConfigDiagnostico } from "../config";
import type { Dor, Leitura, ModuloId, Momento, Respostas, Scores } from "../tipos";
import { quantidadeDeLojas } from "./momento";

/**
 * Quais sinais a casa acende. Cada entrada é um par (id, condição); a condição
 * é código porque é lógica, e o TEXTO é config porque é copy — o Rodolfo revisa
 * a frase sem nunca precisar mexer na regra que a dispara.
 *
 * A ordem de saída é a `prioridade` do config, não a ordem daqui: só os três
 * primeiros aparecem para o dono, e o que dói mais tem que vir primeiro.
 *
 * Os cinco últimos são o piso. Uma casa saudável pode não acender nenhum sinal
 * de problema, e a leitura ainda precisa dizer alguma coisa de verdade — sem
 * inventar defeito que as respostas não mostraram.
 */
function condicoes(r: Respostas, scores: Scores, momento: Momento): Array<[string, boolean]> {
  const lojas = quantidadeDeLojas(r);
  const d = r.delivery;
  return [
    ["prejuizo_recente", r.resultado3Meses === "prejuizo"],
    ["resultado_no_escuro", r.resultado3Meses === "nao_sei"],
    ["cmv_desconhecido", r.cmv === "nao_sei"],
    ["sem_dre", r.dre === "nao"],
    ["margem_desconhecida", r.margemPrato === "nao"],
    ["pre_abertura", momento === "PRE_ABERTURA"],
    ["dono_na_operacao", r.horasOperacao === "h12_mais"],
    ["sem_gerente", r.gerente === "nao"],
    ["nota_baixa", d?.notaIfood === "n40_44" || d?.notaIfood === "n_abaixo_40"],
    [
      "dependencia_ifood",
      r.percentualDelivery === "d60_80" || r.percentualDelivery === "d80_mais",
    ],
    ["cancelamento_diario", d?.cancelamentos === "dia"],
    ["rotatividade_alta", r.rotatividade === "alta"],
    ["sem_ficha_tecnica", r.fichasTecnicas === "nao"],
    ["sem_treinamento", r.treinamento === "nenhum"],
    ["campanha_sem_retorno", d?.campanhas === "sem_saber"],
    [
      "gestao_no_caderno",
      r.sistema === "caderno_nada" || (r.sistema === "planilhas" && lojas >= 2),
    ],
    ["sem_base_clientes", r.baseClientes === "nao_tenho"],
    ["nota_desconhecida", d?.notaIfood === "nao_sei"],
    ["avaliacoes_sem_resposta", d?.respondeAvaliacoes === "nunca"],
    ["cmv_aproximado", r.cmv === "ideia"],
    ["dre_intermitente", r.dre === "as_vezes"],
    ["sem_fidelidade", r.fidelidade === "nunca"],
    ["sem_fotos", d?.fotos === "sem_fotos"],
    ["rede_em_formacao", r.lojas === "quatro_seis" || r.lojas === "sete_mais"],
    // piso
    ["casa_organizada", scores.financeiro >= 7 && scores.operacao >= 7],
    ["sem_delivery", d === undefined],
    ["foco_no_que_pediu", true],
    ["momento_define", true],
    ["proxima_semana", true],
  ];
}

/**
 * Os sinais que a casa acendeu, do mais grave para o menos, no máximo `quantos`.
 * Três sempre existem: os últimos da lista disparam para qualquer resposta.
 */
export function selecionarSinais(
  r: Respostas,
  scores: Scores,
  momento: Momento,
  quantos = 3,
): string[] {
  return condicoes(r, scores, momento)
    .filter(([, acendeu]) => acendeu)
    .map(([id]) => id)
    .sort((a, b) => {
      const pa = SINAIS_POR_ID.get(a)?.prioridade ?? Number.MAX_SAFE_INTEGER;
      const pb = SINAIS_POR_ID.get(b)?.prioridade ?? Number.MAX_SAFE_INTEGER;
      return pa - pb;
    })
    .slice(0, quantos);
}

function textoDoSinal(id: string): string {
  const sinal = SINAIS_POR_ID.get(id);
  if (!sinal) throw new Error(`[diagnostico] sinal sem texto no config: ${id}`);
  return sinal.texto;
}

/**
 * A Leitura Inicial — a ÚNICA saída do motor que o dono lê.
 *
 * É templatada de ponta a ponta, sem uma palavra de IA: o que chega ao dono
 * tem que ser previsível, revisável e igual para respostas iguais. O texto da
 * IA existe (pré-diagnóstico), mas é só para o Rodolfo, e nunca é enviado sem
 * ele ler antes.
 *
 * Três travas, todas testadas: no máximo 120 palavras, nenhum termo proibido
 * (percentual, preço, "garant...", "gratuito", "sem compromisso") e o texto
 * termina na chamada para ação.
 */
export function montarLeitura(
  r: Respostas,
  scores: Scores,
  momento: Momento,
  moduloTop: ModuloId,
  sinaisIds?: string[],
): Leitura {
  const sinais = sinaisIds ?? selecionarSinais(r, scores, momento);
  const { badge, frase } = frasesDoMomento(momento);
  const dorTop: Dor = r.dores[0] ?? "outra";

  const linhas = [
    `LEITURA INICIAL // ${r.restaurante}`,
    `MOMENTO: ${badge} — ${frase}`,
    "",
    "O que suas respostas mostram:",
    ...sinais.map((id) => `• ${textoDoSinal(id)}`),
    "",
    `Por onde eu começaria: ${nomeModulo(moduloTop)} — ${fraseModulo(moduloTop)}`,
    `Hoje mesmo: ${primeiraAcao(dorTop)}`,
  ];

  const texto = linhas.join("\n");
  const cta = config.cta;
  const textoCompleto = `${texto}\n\n[ ${cta} ]`;

  return {
    texto,
    cta,
    textoCompleto,
    palavras: contarPalavras(textoCompleto),
    sinaisUsados: sinais,
  };
}

export interface ProblemaDeCopy {
  onde: string;
  problema: string;
}

/**
 * Lint das bibliotecas de copy. Roda em teste e pode rodar no boot.
 *
 * Existe por um motivo concreto: os textos são feitos para o Rodolfo reescrever
 * sem abrir o código. Sem esta trava, uma revisão bem-intencionada estoura o
 * limite de 120 palavras ou deixa passar um "%" — e ninguém descobre, porque
 * build e teste de tipo não leem português.
 */
export function validarBibliotecas(cfg: ConfigDiagnostico = config): ProblemaDeCopy[] {
  const problemas: ProblemaDeCopy[] = [];
  const lim = cfg.limitesDeCopy;

  const checar = (onde: string, texto: string, maxPalavras: number): void => {
    const proibidos = termosProibidosEm(texto);
    if (proibidos.length > 0) {
      problemas.push({ onde, problema: `termo proibido: ${proibidos.join(", ")}` });
    }
    const n = contarPalavras(texto);
    if (n > maxPalavras) {
      problemas.push({ onde, problema: `${n} palavras, o teto é ${maxPalavras}` });
    }
  };

  for (const s of cfg.sinais) {
    checar(`sinal ${s.id}`, s.texto, lim.palavrasSinal);
  }
  for (const [momento, f] of Object.entries(cfg.frasesMomento)) {
    checar(`frase de momento ${momento}`, f.frase, lim.palavrasFraseMomento);
  }
  for (const [modulo, m] of Object.entries(cfg.modulos)) {
    checar(`frase de módulo ${modulo}`, m.frase, lim.palavrasFraseModulo);
  }
  for (const [dor, acao] of Object.entries(cfg.primeirasAcoes)) {
    checar(`primeira ação ${dor}`, acao, lim.palavrasPrimeiraAcao);
  }
  checar("cta", cfg.cta, lim.palavrasPrimeiraAcao);

  // Toda dor precisa de uma primeira ação: sem ela o dono sai da leitura sem
  // nada para fazer hoje, que é justamente o que a tela promete.
  const doresComAcao = new Set(Object.keys(cfg.primeirasAcoes));
  for (const dor of Object.keys(cfg.dorParaModulo)) {
    if (!doresComAcao.has(dor)) {
      problemas.push({ onde: `primeira ação ${dor}`, problema: "faltando" });
    }
  }

  // Todo sinal citado pelas condições precisa existir no config. O stub abaixo
  // só serve para ENUMERAR os ids — nenhuma condição é lida, então basta ele
  // ter os campos que `condicoes` toca para não estourar.
  const stub = {
    lojas: "uma",
    sistema: "pdv_erp",
    percentualDelivery: "d0_20",
  } as unknown as Respostas;
  for (const [id] of condicoes(
    stub,
    { financeiro: 0, operacao: 0, digital: null },
    "ESTABILIZACAO",
  )) {
    if (!new Set(cfg.sinais.map((x) => x.id)).has(id)) {
      problemas.push({ onde: `sinal ${id}`, problema: "citado no motor e ausente do config" });
    }
  }

  return problemas;
}

export { condicoes };
