import type { Momento, Respostas, Scores } from "../tipos";

export interface ResultadoMomento {
  momento: Momento;
  /** Regras que bateram, na ordem em que foram avaliadas. Vai para `momentoRazao`. */
  razoes: string[];
}

/** Lojas em número, para as regras que perguntam "tem duas ou mais?". */
function quantidadeDeLojas(r: Respostas): number {
  switch (r.lojas) {
    case "vou_abrir":
      return 0;
    case "uma":
      return 1;
    case "duas_tres":
      return 2;
    case "quatro_seis":
      return 4;
    case "sete_mais":
      return 7;
  }
}

/**
 * O momento do negócio, por PRECEDÊNCIA de cima para baixo: a primeira regra
 * que bate decide, e as de baixo nem são consultadas.
 *
 * A ordem não é estética, é de negócio. Uma casa que fecha no vermelho E tem
 * financeiro alto ainda é SOBREVIVÊNCIA: enquanto sangra, não se fala de
 * crescimento. Por isso SOBREVIVÊNCIA vem antes de ESCALA e de CRESCIMENTO —
 * inverter essa ordem faria a proposta atacar a dor errada.
 *
 * `razoes` guarda o rastro para o Rodolfo conferir (e para a IA não contradizer).
 */
export function definirMomento(r: Respostas, scores: Scores): ResultadoMomento {
  const razoes: string[] = [];
  const lojas = quantidadeDeLojas(r);

  if (r.lojas === "vou_abrir" || r.tempoOperacao === "nao_abri") {
    razoes.push(
      r.lojas === "vou_abrir"
        ? "respondeu que ainda vai abrir"
        : "respondeu que ainda não abriu",
    );
    return { momento: "PRE_ABERTURA", razoes };
  }

  if (r.resultado3Meses === "prejuizo") {
    razoes.push("os últimos três meses fecharam em prejuízo");
    return { momento: "SOBREVIVENCIA", razoes };
  }
  if (scores.financeiro <= 3 && scores.operacao <= 3) {
    razoes.push(
      `financeiro em ${scores.financeiro} e operação em ${scores.operacao} — os dois no piso`,
    );
    return { momento: "SOBREVIVENCIA", razoes };
  }

  if (lojas >= 2 && r.gerente === "sim" && scores.financeiro >= 7) {
    razoes.push(
      `${lojas === 2 ? "duas ou mais" : "várias"} lojas, tem gerente e financeiro em ${scores.financeiro}`,
    );
    return { momento: "ESCALA", razoes };
  }

  const objetivoDeCrescimento =
    r.objetivo6meses === "vender_delivery" ||
    r.objetivo6meses === "crescer_abrir" ||
    r.objetivo6meses === "sair_operacao";

  if (scores.financeiro >= 7 && scores.operacao >= 5 && objetivoDeCrescimento) {
    razoes.push(
      `financeiro em ${scores.financeiro}, operação em ${scores.operacao} e o objetivo é de crescimento`,
    );
    return { momento: "CRESCIMENTO", razoes };
  }

  razoes.push("não bateu nenhuma regra acima — a casa vende, mas ainda não está redonda");
  return { momento: "ESTABILIZACAO", razoes };
}

export { quantidadeDeLojas };
