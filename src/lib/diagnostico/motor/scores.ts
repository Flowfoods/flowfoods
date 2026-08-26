import { peso } from "../config";
import type { Respostas, Scores } from "../tipos";

/**
 * Três notas de 0 a 10, cada uma somando as respostas que a compõem. Os pesos
 * moram em `config/diagnostico.json` porque quem afina esses números é o
 * Rodolfo, não o programador.
 *
 * Financeiro = CMV + DRE + margem + resultado        (3+3+2+2 = 10)
 * Operação   = gerente + rotatividade + treinamento
 *              + fichas + horas                      (3+2+2+2+1 = 10)
 * Digital    = nota + avaliações + campanhas
 *              + fotos + base de clientes            (3+2+2+1+2 = 10)
 *
 * Puro: mesma entrada, mesma saída, sempre.
 */
export function calcularScores(r: Respostas): Scores {
  const financeiro =
    peso("financeiro.cmv", r.cmv) +
    peso("financeiro.dre", r.dre) +
    peso("financeiro.margemPrato", r.margemPrato) +
    peso("financeiro.resultado3Meses", r.resultado3Meses);

  const operacao =
    peso("operacao.gerente", r.gerente) +
    peso("operacao.rotatividade", r.rotatividade) +
    peso("operacao.treinamento", r.treinamento) +
    peso("operacao.fichasTecnicas", r.fichasTecnicas) +
    peso("operacao.horasOperacao", r.horasOperacao);

  // Casa que não vende por app não tem score digital — tem N/A. Zero seria
  // mentira: diria "vai muito mal no digital" de quem simplesmente não joga
  // esse jogo, e isso empurraria o momento para SOBREVIVÊNCIA sem motivo.
  const digital = r.delivery
    ? peso("digital.notaIfood", r.delivery.notaIfood) +
      peso("digital.respondeAvaliacoes", r.delivery.respondeAvaliacoes) +
      peso("digital.campanhas", r.delivery.campanhas) +
      peso("digital.fotos", r.delivery.fotos) +
      peso("digital.baseClientes", r.baseClientes)
    : null;

  return { financeiro, operacao, digital };
}
