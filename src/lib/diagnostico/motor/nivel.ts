import { nivelOfertaConfig } from "../config";
import type {
  ModuloId,
  ModuloRanqueado,
  Momento,
  NivelOferta,
  NivelOfertaId,
  Respostas,
} from "../tipos";

/**
 * CRM fraco: não tem base organizada de clientes OU nunca teve fidelidade.
 * É o gatilho que, junto com delivery pesado, transforma CRESCIMENTO em
 * Parceria — porque uma casa que vende quase tudo por app e não sabe quem é o
 * cliente está alugando a própria base, e isso não se resolve em projeto curto.
 */
function crmFraco(r: Respostas): boolean {
  return r.baseClientes !== "organizada" || r.fidelidade === "nunca";
}

function deliveryPesado(r: Respostas): boolean {
  return r.percentualDelivery === "d60_80" || r.percentualDelivery === "d80_mais";
}

/** Junta os módulos fixos do nível com os N primeiros do ranking, sem repetir. */
function comporModulos(
  fixos: string[],
  ranqueados: ModuloRanqueado[],
  quantosDoRanking: number,
): ModuloId[] {
  const saida: ModuloId[] = [];
  const jaTem = new Set<string>();
  for (const f of fixos) {
    if (!jaTem.has(f)) {
      jaTem.add(f);
      saida.push(f as ModuloId);
    }
  }
  for (const m of ranqueados) {
    if (saida.length >= fixos.length + quantosDoRanking) break;
    if (!jaTem.has(m.modulo)) {
      jaTem.add(m.modulo);
      saida.push(m.modulo);
    }
  }
  return saida;
}

function idDoNivel(momento: Momento, r: Respostas): NivelOfertaId {
  switch (momento) {
    case "PRE_ABERTURA":
      return "projeto_estrutura";
    case "SOBREVIVENCIA":
      return "focada_estancar";
    case "ESTABILIZACAO":
      return "focada_organizar";
    case "CRESCIMENTO":
      return deliveryPesado(r) && crmFraco(r) ? "parceria" : "completa";
    case "ESCALA":
      return "parceria";
  }
}

/**
 * O nível de oferta que o Rodolfo leva para a call. É SUGESTÃO: ele edita antes
 * de virar proposta, e o valor nunca sai daqui — preço é decisão dele, não do
 * motor (e nada disso aparece para o dono na Leitura Inicial).
 */
export function sugerirNivel(
  momento: Momento,
  ranqueados: ModuloRanqueado[],
  r: Respostas,
): NivelOferta {
  const id = idDoNivel(momento, r);
  const cfg = nivelOfertaConfig(id);
  return {
    id,
    nome: cfg.nome,
    composicao: cfg.composicao,
    modulos: comporModulos(cfg.modulosFixos, ranqueados, cfg.usaModulosRanqueados),
    duracaoSemanas: cfg.duracaoSemanas,
  };
}
