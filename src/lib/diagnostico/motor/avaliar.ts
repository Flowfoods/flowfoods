import { config } from "../config";
import type { Avaliacao, Respostas } from "../tipos";
import { detectarFlags } from "./flags";
import { montarLeitura } from "./leitura";
import { ranquearModulos } from "./modulos";
import { definirMomento } from "./momento";
import { sugerirNivel } from "./nivel";
import { calcularScores } from "./scores";

/**
 * O motor inteiro, numa função. Respostas entram, avaliação sai — sem relógio,
 * sem banco, sem rede.
 *
 * A ordem importa: momento depende de scores, ranking depende de momento, nível
 * depende de ranking, e a leitura depende de todos. Rodar fora dessa ordem
 * produz um resultado plausível e errado, que é o pior tipo de erro aqui.
 */
export function avaliar(r: Respostas): Avaliacao {
  const scores = calcularScores(r);
  const { momento, razoes } = definirMomento(r, scores);
  const modulosRanqueados = ranquearModulos(r, scores, momento);
  const nivelOferta = sugerirNivel(momento, modulosRanqueados, r);
  const flags = detectarFlags(r);

  const top = modulosRanqueados[0];
  if (!top) throw new Error("[diagnostico] ranking vazio — config sem módulos");

  const leitura = montarLeitura(r, scores, momento, top.modulo);

  return {
    scores,
    momento,
    momentoRazao: razoes,
    modulosRanqueados,
    nivelOferta,
    flags,
    leitura,
    versaoFormulario: config.versaoFormulario,
    versaoConfig: config.versao,
  };
}
