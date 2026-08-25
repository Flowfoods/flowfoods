import { config, DOR_PARA_MODULO, nomeModulo } from "../config";
import type { ModuloId, ModuloRanqueado, Momento, Respostas, Scores } from "../tipos";
import { quantidadeDeLojas } from "./momento";

/**
 * Ordem canônica dos seis módulos. Serve de critério de desempate: dois módulos
 * com a mesma pontuação sempre saem na mesma ordem, em qualquer máquina. Sem
 * isso o ranking seria estável só por sorte da implementação de `sort`, e o
 * "módulo #1" — que decide a proposta inteira — poderia mudar entre execuções.
 */
const ORDEM_CANONICA: ModuloId[] = [
  "financeiro",
  "estrutura",
  "ifood",
  "equipe",
  "crm",
  "saas",
];

function moduloValido(id: string | null): id is ModuloId {
  return id !== null && (ORDEM_CANONICA as string[]).includes(id);
}

/**
 * Ranqueia os seis módulos somando duas famílias de pontos:
 *
 *  1. O que o dono DISSE que dói (etapa 7): a 1ª dor vale 3, a 2ª vale 2, a 3ª
 *     vale 1, e cada dor ainda dá +1 ao seu módulo secundário.
 *  2. O que as respostas MOSTRAM, mesmo que ele não tenha citado como dor —
 *     financeiro no piso, nota baixa, caderno com duas lojas, e por aí.
 *
 * As duas famílias somam de propósito: dono que não sabe seus números quase
 * nunca marca "não sei meus números" como dor principal. O motor precisa ver o
 * que ele não viu — é para isso que ele existe.
 *
 * Saída ordenada: #1 é o ataque imediato, #2 a segunda onda, #3 a manutenção.
 */
export function ranquearModulos(
  r: Respostas,
  scores: Scores,
  momento: Momento,
): ModuloRanqueado[] {
  const pontos = new Map<ModuloId, number>(ORDEM_CANONICA.map((m) => [m, 0]));
  const razoes = new Map<ModuloId, string[]>(ORDEM_CANONICA.map((m) => [m, []]));

  const somar = (modulo: ModuloId, quanto: number, porque: string): void => {
    pontos.set(modulo, (pontos.get(modulo) ?? 0) + quanto);
    razoes.get(modulo)?.push(`${porque} (+${quanto})`);
  };

  // ── 1. o que ele disse que dói ──
  r.dores.slice(0, 3).forEach((dor, i) => {
    const destino = DOR_PARA_MODULO.get(dor);
    if (!destino) return;
    const pesoDaPosicao = config.pesoDor.at(i) ?? 1;
    const ordinal = `${i + 1}ª dor`;
    if (moduloValido(destino.principal)) {
      somar(destino.principal, pesoDaPosicao, `${ordinal}: ${dor}`);
    }
    if (moduloValido(destino.secundario)) {
      somar(destino.secundario, config.pesoDorSecundaria, `${ordinal} (secundário): ${dor}`);
    }
  });

  // ── 2. o que as respostas mostram ──
  if (scores.financeiro <= 3) {
    somar("financeiro", 2, `financeiro em ${scores.financeiro}`);
  }

  // "Não sei" não conta como nota baixa: não saber já é penalizado no score
  // digital, e afirmar "sua nota está abaixo de 4,5" sem dado seria inventar.
  if (r.delivery && (r.delivery.notaIfood === "n40_44" || r.delivery.notaIfood === "n_abaixo_40")) {
    somar("ifood", 2, "nota no app abaixo de 4,5");
  }

  if (momento === "PRE_ABERTURA") {
    somar("estrutura", 5, "ainda vai abrir");
  }

  if (r.rotatividade === "alta") somar("equipe", 2, "rotatividade alta");
  if (r.fichasTecnicas === "nao") somar("estrutura", 1, "sem ficha técnica");
  if (r.horasOperacao === "h12_mais") {
    somar("estrutura", 1, "mais de 12 horas por dia na operação");
    somar("equipe", 1, "mais de 12 horas por dia na operação");
  }
  if (r.delivery?.campanhas === "sem_saber") {
    somar("ifood", 1, "faz campanha sem medir o retorno");
    somar("financeiro", 1, "faz campanha sem medir o retorno");
  }
  if (r.delivery?.cancelamentos === "dia") {
    somar("equipe", 1, "erro ou cancelamento todo dia");
    somar("ifood", 1, "erro ou cancelamento todo dia");
  }
  if (r.baseClientes === "nao_tenho") somar("crm", 1, "não tem base de clientes");
  if (
    (r.sistema === "caderno_nada" || r.sistema === "planilhas") &&
    quantidadeDeLojas(r) >= 2
  ) {
    somar("saas", 2, "duas ou mais lojas rodando em caderno ou planilha");
  }

  return ORDEM_CANONICA.map((modulo) => ({
    modulo,
    nome: nomeModulo(modulo),
    pontos: pontos.get(modulo) ?? 0,
    razoes: razoes.get(modulo) ?? [],
  })).sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    return ORDEM_CANONICA.indexOf(a.modulo) - ORDEM_CANONICA.indexOf(b.modulo);
  });
}

export { ORDEM_CANONICA };
