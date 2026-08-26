import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../fixtures";
import { avaliar } from "../motor/avaliar";
import { conferirCoerencia, gerarPreDiagnostico, montarRequisicao } from "./gerar";
import type { RespostaDoModelo, Transporte } from "./gerar";
import {
  custoEmBRL,
  podeGerar,
  precoSonnet5,
  PRECO_SONNET_5_CHEIO,
  PRECO_SONNET_5_INTRO,
} from "./orcamento";
import { MODELO_PADRAO, montarEntradaIA, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import { lerPreDiagnostico } from "./schema";
import type { PreDiagnostico } from "./schema";

const AVALIACAO = avaliar(FIXTURES.SOBREVIVENCIA);

const VALIDO: PreDiagnostico = {
  resumo: "Pizzaria de bairro fechando no vermelho, sem CMV e sem DRE.",
  momento: { valor: "SOBREVIVENCIA", porque: "declarou prejuízo nos últimos três meses" },
  dores: [
    {
      dor: "Margem apertada",
      evidencia: "disse que não sabe o CMV e não fecha DRE",
      modulo: "Gestão Financeira",
    },
    {
      dor: "Operação sem padrão",
      evidencia: "sem ficha técnica e mais de 12 horas por dia na operação",
      modulo: "Estrutura de Restaurante",
    },
    {
      dor: "Equipe girando",
      evidencia: "rotatividade alta e nenhum treinamento",
      modulo: "Treinamento de Equipe",
    },
  ],
  plano30dias: ["Levantar o CMV", "Fechar o primeiro DRE", "Escrever três fichas técnicas"],
  propostaSugerida: {
    nivel: "Consultoria Focada — Estancar",
    modulos: ["Gestão Financeira", "Estrutura de Restaurante"],
    sequencia: ["Gestão Financeira", "Estrutura de Restaurante"],
    duracaoSemanas: 12,
    justificativa: "Estancar a perda antes de mexer em venda.",
  },
  perguntasParaCall: [
    "Quanto você comprou no último mês?",
    "Quem fecha o caixa?",
    "Qual prato mais sai?",
    "Quantas horas você fica na loja?",
    "Você já demitiu por erro de processo?",
  ],
  riscos: ["Decisão compartilhada com sócio"],
  aberturaDaCall: "Você me disse que o dinheiro entra e não sobra. Vamos achar onde ele vaza.",
  observacoes: "",
};

function transporteQueDevolve(...respostas: string[]): Transporte {
  let i = 0;
  return vi.fn(async (): Promise<RespostaDoModelo> => {
    const texto = respostas[Math.min(i, respostas.length - 1)] ?? "";
    i++;
    return { texto, uso: { inputTokens: 3000, outputTokens: 1200 } };
  });
}

const ORCAMENTO_LIVRE = { tetoBRL: 50, gastoHojeBRL: 0 };
const HOJE = "2026-08-24";
const CAMBIO = 5.4;

describe("requisição para a API", () => {
  it("usa o modelo confirmado na doc, sem sufixo de data", () => {
    expect(montarRequisicao(FIXTURES.SOBREVIVENCIA, AVALIACAO).model).toBe("claude-sonnet-5");
    expect(MODELO_PADRAO).toBe("claude-sonnet-5");
  });

  it("NÃO manda temperature — o campo foi removido no Sonnet 5 e devolve 400", () => {
    const req = montarRequisicao(FIXTURES.SOBREVIVENCIA, AVALIACAO);
    expect(req).not.toHaveProperty("temperature");
    expect(JSON.stringify(req)).not.toContain("temperature");
  });

  it("controla o gasto por effort, que é o substituto da temperatura", () => {
    expect(montarRequisicao(FIXTURES.SOBREVIVENCIA, AVALIACAO).output_config.effort).toBe("low");
  });

  it("leva as regras que impedem a IA de inventar", () => {
    expect(SYSTEM_PROMPT).toContain("SOMENTE o Rodolfo");
    expect(SYSTEM_PROMPT).toContain("Nunca invente números");
    expect(SYSTEM_PROMPT).toContain("Não contradiga o momento calculado");
  });

  it("a entrada carrega o que o motor calculou, para a IA não recomeçar do zero", () => {
    const entrada = montarEntradaIA(FIXTURES.SOBREVIVENCIA, AVALIACAO);
    expect(entrada).toContain("momentoCalculado");
    expect(entrada).toContain("SOBREVIVENCIA");
    expect(entrada).toContain("modulosRanqueados");
    expect(entrada).toContain("textoLivreDoDono");
  });

  it("quem não respondeu o texto livre não vira string vazia silenciosa", () => {
    const semTexto = { ...FIXTURES.SOBREVIVENCIA, tiraSono: undefined };
    expect(montarEntradaIA(semTexto, AVALIACAO)).toContain("(não respondeu)");
  });
});

describe("leitura da resposta do modelo", () => {
  it("aceita JSON limpo", () => {
    expect(lerPreDiagnostico(JSON.stringify(VALIDO)).ok).toBe(true);
  });

  it("aceita JSON embrulhado em cerca de markdown", () => {
    const r = lerPreDiagnostico("```json\n" + JSON.stringify(VALIDO) + "\n```");
    expect(r.ok).toBe(true);
  });

  it("recusa o que não é JSON", () => {
    const r = lerPreDiagnostico("Claro! Aqui vai o seu pré-diagnóstico:");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("não é JSON");
  });

  it("recusa quando perguntasParaCall não são exatamente cinco", () => {
    const quatro = { ...VALIDO, perguntasParaCall: VALIDO.perguntasParaCall.slice(0, 4) };
    const r = lerPreDiagnostico(JSON.stringify(quatro));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("perguntasParaCall");
  });

  it("recusa quando falta campo do schema", () => {
    const semDores = { ...VALIDO, dores: undefined };
    expect(lerPreDiagnostico(JSON.stringify(semDores)).ok).toBe(false);
  });

  it("recusa lista de dores com menos de três itens", () => {
    const uma = { ...VALIDO, dores: VALIDO.dores.slice(0, 1) };
    expect(lerPreDiagnostico(JSON.stringify(uma)).ok).toBe(false);
  });
});

describe("orçamento", () => {
  it("preço promocional até 31/08/2026, cheio a partir de 01/09", () => {
    expect(precoSonnet5("2026-08-24")).toEqual(PRECO_SONNET_5_INTRO);
    expect(precoSonnet5("2026-08-31")).toEqual(PRECO_SONNET_5_INTRO);
    expect(precoSonnet5("2026-09-01")).toEqual(PRECO_SONNET_5_CHEIO);
  });

  it("converte tokens em reais", () => {
    // 1M de entrada a US$2 + 1M de saída a US$10 = US$12; a US$1 = R$5 → R$60.
    const custo = custoEmBRL(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      PRECO_SONNET_5_INTRO,
      5,
    );
    expect(custo).toBeCloseTo(60, 6);
  });

  it("token lido de cache custa um décimo da entrada", () => {
    const semCache = custoEmBRL(
      { inputTokens: 1_000_000, outputTokens: 0 },
      PRECO_SONNET_5_INTRO,
      5,
    );
    const soCache = custoEmBRL(
      { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 1_000_000 },
      PRECO_SONNET_5_INTRO,
      5,
    );
    expect(soCache).toBeCloseTo(semCache * 0.1, 6);
  });

  it("sem teto configurado, sempre pode gerar", () => {
    expect(podeGerar({ tetoBRL: null, gastoHojeBRL: 999 }).pode).toBe(true);
  });

  it("estourou o teto: desabilita com aviso, e o aviso não fala em erro", () => {
    const d = podeGerar({ tetoBRL: 10, gastoHojeBRL: 10 });
    expect(d.pode).toBe(false);
    expect(d.aviso).toContain("orçamento");
    expect(d.aviso.toLowerCase()).not.toContain("erro");
    // O motor e a leitura continuam de pé — só a IA para.
    expect(d.aviso).toContain("leitura");
  });
});

describe("geração do pré-diagnóstico", () => {
  it("no caminho feliz devolve os dados, o custo e a versão do prompt", async () => {
    const transporte = transporteQueDevolve(JSON.stringify(VALIDO));
    const r = await gerarPreDiagnostico({
      respostas: FIXTURES.SOBREVIVENCIA,
      avaliacao: AVALIACAO,
      transporte,
      orcamento: ORCAMENTO_LIVRE,
      hojeISO: HOJE,
      cambioUsdBrl: CAMBIO,
    });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.tentativas).toBe(1);
      expect(r.promptVersion).toBe(PROMPT_VERSION);
      expect(r.custoBRL).toBeGreaterThan(0);
      expect(r.divergencias).toEqual([]);
    }
    expect(transporte).toHaveBeenCalledTimes(1);
  });

  it("JSON inválido: tenta mais uma vez e aceita a segunda", async () => {
    const transporte = transporteQueDevolve("desculpa, aqui vai:", JSON.stringify(VALIDO));
    const r = await gerarPreDiagnostico({
      respostas: FIXTURES.SOBREVIVENCIA,
      avaliacao: AVALIACAO,
      transporte,
      orcamento: ORCAMENTO_LIVRE,
      hojeISO: HOJE,
      cambioUsdBrl: CAMBIO,
    });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.tentativas).toBe(2);
    expect(transporte).toHaveBeenCalledTimes(2);
  });

  it("duas falhas: devolve falha para a tela oferecer o modo manual", async () => {
    const transporte = transporteQueDevolve("não é json");
    const r = await gerarPreDiagnostico({
      respostas: FIXTURES.SOBREVIVENCIA,
      avaliacao: AVALIACAO,
      transporte,
      orcamento: ORCAMENTO_LIVRE,
      hojeISO: HOJE,
      cambioUsdBrl: CAMBIO,
    });
    expect(r.status).toBe("falha");
    expect(transporte).toHaveBeenCalledTimes(2);
  });

  it("nunca tenta uma terceira vez", async () => {
    const transporte = transporteQueDevolve("{}");
    await gerarPreDiagnostico({
      respostas: FIXTURES.SOBREVIVENCIA,
      avaliacao: AVALIACAO,
      transporte,
      orcamento: ORCAMENTO_LIVRE,
      hojeISO: HOJE,
      cambioUsdBrl: CAMBIO,
    });
    expect(transporte).toHaveBeenCalledTimes(2);
  });

  it("a tentativa perdida também custa — o teto conta o que a Anthropic cobra", async () => {
    const r = await gerarPreDiagnostico({
      respostas: FIXTURES.SOBREVIVENCIA,
      avaliacao: AVALIACAO,
      transporte: transporteQueDevolve("não é json"),
      orcamento: ORCAMENTO_LIVRE,
      hojeISO: HOJE,
      cambioUsdBrl: CAMBIO,
    });
    if (r.status === "falha") expect(r.custoBRL).toBeGreaterThan(0);
    else throw new Error("esperava falha");
  });

  it("orçamento estourado nem chama a API", async () => {
    const transporte = transporteQueDevolve(JSON.stringify(VALIDO));
    const r = await gerarPreDiagnostico({
      respostas: FIXTURES.SOBREVIVENCIA,
      avaliacao: AVALIACAO,
      transporte,
      orcamento: { tetoBRL: 5, gastoHojeBRL: 5 },
      hojeISO: HOJE,
      cambioUsdBrl: CAMBIO,
    });
    expect(r.status).toBe("orcamento");
    expect(transporte).not.toHaveBeenCalled();
  });

  it("erro de rede não derruba a rota: vira falha tratada", async () => {
    const transporte = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const r = await gerarPreDiagnostico({
      respostas: FIXTURES.SOBREVIVENCIA,
      avaliacao: AVALIACAO,
      transporte,
      orcamento: ORCAMENTO_LIVRE,
      hojeISO: HOJE,
      cambioUsdBrl: CAMBIO,
    });
    expect(r.status).toBe("falha");
    if (r.status === "falha") expect(r.erro).toContain("ECONNRESET");
  });
});

describe("coerência entre a IA e o motor", () => {
  it("três fixtures diferentes conferem sem divergência quando a IA acompanha o motor", () => {
    const tres = [
      ["SOBREVIVENCIA", FIXTURES.SOBREVIVENCIA],
      ["ESCALA", FIXTURES.ESCALA],
      ["PRE_ABERTURA", FIXTURES.PRE_ABERTURA],
    ] as const;
    for (const [nome, respostas] of tres) {
      const a = avaliar(respostas);
      const pre: PreDiagnostico = {
        ...VALIDO,
        momento: { valor: a.momento, porque: a.momentoRazao.join("; ") },
        dores: [
          { ...VALIDO.dores[0]!, modulo: a.modulosRanqueados[0]!.nome },
          VALIDO.dores[1]!,
          VALIDO.dores[2]!,
        ],
      };
      expect(conferirCoerencia(pre, a), nome).toEqual([]);
    }
  });

  it("aponta quando a IA troca o momento", () => {
    const divergencias = conferirCoerencia(
      { ...VALIDO, momento: { valor: "CRESCIMENTO", porque: "acho que dá" } },
      AVALIACAO,
    );
    expect(divergencias.join(" ")).toContain("momento");
  });

  it("aponta quando a IA começa por outro módulo", () => {
    const pre: PreDiagnostico = {
      ...VALIDO,
      dores: [{ ...VALIDO.dores[0]!, modulo: "Fidelidade & CRM" }, VALIDO.dores[1]!, VALIDO.dores[2]!],
    };
    expect(conferirCoerencia(pre, AVALIACAO).join(" ")).toContain("módulo #1");
  });

  it("acento e caixa não contam como divergência", () => {
    const pre: PreDiagnostico = {
      ...VALIDO,
      momento: { valor: "sobrevivência", porque: "-" },
      dores: [{ ...VALIDO.dores[0]!, modulo: "gestão   financeira" }, VALIDO.dores[1]!, VALIDO.dores[2]!],
    };
    expect(conferirCoerencia(pre, AVALIACAO)).toEqual([]);
  });
});
