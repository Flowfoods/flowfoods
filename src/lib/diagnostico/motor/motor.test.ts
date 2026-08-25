import { describe, expect, it } from "vitest";
import { avaliar } from "./avaliar";
import { detectarFlags } from "./flags";
import { definirMomento } from "./momento";
import { calcularScores } from "./scores";
import { comBase, FIXTURES } from "../fixtures";

describe("scores", () => {
  it("financeiro e operação ficam entre 0 e 10 em todos os cenários", () => {
    for (const [nome, r] of Object.entries(FIXTURES)) {
      const s = calcularScores(r);
      expect(s.financeiro, nome).toBeGreaterThanOrEqual(0);
      expect(s.financeiro, nome).toBeLessThanOrEqual(10);
      expect(s.operacao, nome).toBeGreaterThanOrEqual(0);
      expect(s.operacao, nome).toBeLessThanOrEqual(10);
      if (s.digital !== null) {
        expect(s.digital, nome).toBeGreaterThanOrEqual(0);
        expect(s.digital, nome).toBeLessThanOrEqual(10);
      }
    }
  });

  it("quem não vende por app tem digital N/A, não zero", () => {
    expect(calcularScores(FIXTURES.SEM_DELIVERY).digital).toBeNull();
    expect(calcularScores(FIXTURES.PRE_ABERTURA).digital).toBeNull();
  });

  it("N/A no digital não empurra a casa para SOBREVIVÊNCIA", () => {
    // O risco concreto de tratar N/A como 0: uma casa saudável de salão cairia
    // no momento de quem está sangrando, e receberia a proposta errada.
    expect(avaliar(FIXTURES.SEM_DELIVERY).momento).not.toBe("SOBREVIVENCIA");
  });

  it("as respostas de topo somam 10 e as de piso somam 0", () => {
    const topo = comBase({
      cmv: "sei",
      dre: "sim",
      margemPrato: "sim",
      resultado3Meses: "lucro",
      gerente: "sim",
      rotatividade: "baixa",
      treinamento: "processo",
      fichasTecnicas: "sim",
      horasOperacao: "menos_4",
    });
    expect(calcularScores(topo).financeiro).toBe(10);
    expect(calcularScores(topo).operacao).toBe(10);

    const piso = comBase({
      cmv: "nao_sei",
      dre: "nao",
      margemPrato: "nao",
      resultado3Meses: "nao_sei",
      gerente: "nao",
      rotatividade: "alta",
      treinamento: "nenhum",
      fichasTecnicas: "nao",
      horasOperacao: "h12_mais",
    });
    expect(calcularScores(piso).financeiro).toBe(0);
    expect(calcularScores(piso).operacao).toBe(0);
  });
});

describe("momento — um fixture por momento", () => {
  const esperado = {
    PRE_ABERTURA: "PRE_ABERTURA",
    SOBREVIVENCIA: "SOBREVIVENCIA",
    ESTABILIZACAO: "ESTABILIZACAO",
    CRESCIMENTO: "CRESCIMENTO",
    ESCALA: "ESCALA",
  } as const;

  for (const [nome, momento] of Object.entries(esperado)) {
    it(`${nome} cai em ${momento}`, () => {
      const r = FIXTURES[nome as keyof typeof FIXTURES];
      expect(avaliar(r).momento).toBe(momento);
    });
  }

  it("guarda a razão de ter chegado nesse momento", () => {
    const a = avaliar(FIXTURES.SOBREVIVENCIA);
    expect(a.momentoRazao.length).toBeGreaterThan(0);
    expect(a.momentoRazao.join(" ")).toContain("prejuízo");
  });
});

describe("momento — precedência", () => {
  it("PRÉ-ABERTURA ganha até de quem está no prejuízo", () => {
    const r = comBase({ lojas: "vou_abrir", resultado3Meses: "prejuizo" });
    expect(definirMomento(r, calcularScores(r)).momento).toBe("PRE_ABERTURA");
  });

  it("SOBREVIVÊNCIA ganha de ESCALA: enquanto sangra, não se fala de crescer", () => {
    // Financeiro 8 e duas lojas com gerente bateriam ESCALA. O prejuízo vem antes.
    const r = comBase({
      lojas: "duas_tres",
      gerente: "sim",
      cmv: "sei",
      dre: "sim",
      margemPrato: "sim",
      resultado3Meses: "prejuizo",
      rotatividade: "baixa",
      treinamento: "processo",
      fichasTecnicas: "sim",
    });
    const s = calcularScores(r);
    expect(s.financeiro).toBe(8);
    expect(definirMomento(r, s).momento).toBe("SOBREVIVENCIA");
  });

  it("SOBREVIVÊNCIA também por financeiro e operação no piso, sem prejuízo declarado", () => {
    const r = comBase({
      cmv: "nao_sei",
      dre: "nao",
      margemPrato: "nao",
      resultado3Meses: "empate",
      gerente: "nao",
      rotatividade: "alta",
      treinamento: "nenhum",
      fichasTecnicas: "parcial",
      horasOperacao: "h12_mais",
    });
    const s = calcularScores(r);
    expect(s.financeiro).toBeLessThanOrEqual(3);
    expect(s.operacao).toBeLessThanOrEqual(3);
    expect(definirMomento(r, s).momento).toBe("SOBREVIVENCIA");
  });

  it("ESCALA ganha de CRESCIMENTO quando as duas regras batem", () => {
    const r = comBase({
      lojas: "duas_tres",
      gerente: "sim",
      cmv: "sei",
      dre: "sim",
      margemPrato: "sim",
      resultado3Meses: "lucro",
      rotatividade: "baixa",
      treinamento: "processo",
      fichasTecnicas: "sim",
      objetivo6meses: "crescer_abrir",
    });
    expect(definirMomento(r, calcularScores(r)).momento).toBe("ESCALA");
  });

  it("CRESCIMENTO exige objetivo de crescimento: sem ele, é ESTABILIZAÇÃO", () => {
    const forte = {
      cmv: "sei",
      dre: "sim",
      margemPrato: "sim",
      resultado3Meses: "lucro",
      gerente: "sim",
      rotatividade: "media",
      treinamento: "dia_a_dia",
    } as const;
    const querCrescer = comBase({ ...forte, objetivo6meses: "vender_delivery" });
    const soQuerOrganizar = comBase({ ...forte, objetivo6meses: "organizar" });

    expect(definirMomento(querCrescer, calcularScores(querCrescer)).momento).toBe("CRESCIMENTO");
    expect(definirMomento(soQuerOrganizar, calcularScores(soQuerOrganizar)).momento).toBe(
      "ESTABILIZACAO",
    );
  });
});

describe("módulos ranqueados", () => {
  it("a 1ª dor pesa mais que a 3ª", () => {
    const financeiroPrimeiro = avaliar(
      comBase({ dores: ["custos_altos", "poucos_voltam", "marketing"] }),
    );
    const financeiroPorUltimo = avaliar(
      comBase({ dores: ["poucos_voltam", "marketing", "custos_altos"] }),
    );
    const pontos = (a: ReturnType<typeof avaliar>, m: string) =>
      a.modulosRanqueados.find((x) => x.modulo === m)?.pontos ?? 0;

    expect(pontos(financeiroPrimeiro, "financeiro")).toBeGreaterThan(
      pontos(financeiroPorUltimo, "financeiro"),
    );
  });

  it("quem ainda vai abrir começa por Estrutura de Restaurante", () => {
    expect(avaliar(FIXTURES.PRE_ABERTURA).modulosRanqueados[0]?.modulo).toBe("estrutura");
  });

  it("nota baixa no app empurra iFood & Delivery, mesmo sem ele citar como dor", () => {
    const semNota = comBase({
      dores: ["equipe"],
      delivery: { ...FIXTURES.ESTABILIZACAO.delivery!, notaIfood: "n48_mais" },
    });
    const notaBaixa = comBase({
      dores: ["equipe"],
      delivery: { ...FIXTURES.ESTABILIZACAO.delivery!, notaIfood: "n_abaixo_40" },
    });
    const pontosIfood = (r: typeof semNota) =>
      avaliar(r).modulosRanqueados.find((m) => m.modulo === "ifood")?.pontos ?? 0;

    expect(pontosIfood(notaBaixa)).toBe(pontosIfood(semNota) + 2);
  });

  it('"não sei" a nota NÃO conta como nota baixa — não dá pra afirmar o que ninguém mediu', () => {
    const naoSei = comBase({
      dores: ["equipe"],
      delivery: { ...FIXTURES.ESTABILIZACAO.delivery!, notaIfood: "nao_sei" },
    });
    const boa = comBase({
      dores: ["equipe"],
      delivery: { ...FIXTURES.ESTABILIZACAO.delivery!, notaIfood: "n48_mais" },
    });
    const pontosIfood = (r: typeof naoSei) =>
      avaliar(r).modulosRanqueados.find((m) => m.modulo === "ifood")?.pontos ?? 0;

    expect(pontosIfood(naoSei)).toBe(pontosIfood(boa));
  });

  it("caderno ou planilha com duas lojas acende SaaS com IA", () => {
    const umaLoja = avaliar(comBase({ lojas: "uma", sistema: "caderno_nada" }));
    const duasLojas = avaliar(comBase({ lojas: "duas_tres", sistema: "caderno_nada" }));
    const saas = (a: ReturnType<typeof avaliar>) =>
      a.modulosRanqueados.find((m) => m.modulo === "saas")?.pontos ?? 0;

    expect(saas(duasLojas)).toBe(saas(umaLoja) + 2);
  });

  it("campanha sem retorno medido acende iFood e Financeiro juntos", () => {
    const delivery = FIXTURES.ESTABILIZACAO.delivery!;
    const semSaber = avaliar(
      comBase({ dores: ["outra"], delivery: { ...delivery, campanhas: "sem_saber" } }),
    );
    const controlado = avaliar(
      comBase({ dores: ["outra"], delivery: { ...delivery, campanhas: "com_controle" } }),
    );
    const p = (a: ReturnType<typeof avaliar>, m: string) =>
      a.modulosRanqueados.find((x) => x.modulo === m)?.pontos ?? 0;

    expect(p(semSaber, "ifood")).toBe(p(controlado, "ifood") + 1);
    expect(p(semSaber, "financeiro")).toBe(p(controlado, "financeiro") + 1);
  });

  it("erro de pedido todo dia acende Equipe e iFood", () => {
    const delivery = FIXTURES.ESTABILIZACAO.delivery!;
    const todoDia = avaliar(
      comBase({ dores: ["outra"], delivery: { ...delivery, cancelamentos: "dia" } }),
    );
    const raro = avaliar(
      comBase({ dores: ["outra"], delivery: { ...delivery, cancelamentos: "raro" } }),
    );
    const p = (a: ReturnType<typeof avaliar>, m: string) =>
      a.modulosRanqueados.find((x) => x.modulo === m)?.pontos ?? 0;

    expect(p(todoDia, "equipe")).toBe(p(raro, "equipe") + 1);
    expect(p(todoDia, "ifood")).toBe(p(raro, "ifood") + 1);
  });

  it("mais de 12 horas por dia na operação acende Estrutura e Equipe", () => {
    const p = (r: Parameters<typeof avaliar>[0], m: string) =>
      avaliar(r).modulosRanqueados.find((x) => x.modulo === m)?.pontos ?? 0;
    const atolado = comBase({ dores: ["outra"], horasOperacao: "h12_mais" });
    const folgado = comBase({ dores: ["outra"], horasOperacao: "h4_8" });

    expect(p(atolado, "estrutura")).toBe(p(folgado, "estrutura") + 1);
    expect(p(atolado, "equipe")).toBe(p(folgado, "equipe") + 1);
  });

  it("a faixa de 4 a 6 lojas conta como duas ou mais", () => {
    const p = (r: Parameters<typeof avaliar>[0]) =>
      avaliar(r).modulosRanqueados.find((x) => x.modulo === "saas")?.pontos ?? 0;
    expect(p(comBase({ lojas: "quatro_seis", sistema: "caderno_nada", dores: ["outra"] }))).toBe(2);
  });

  it("dor sem módulo mapeado não distribui ponto nenhum", () => {
    const a = avaliar(comBase({ dores: ["outra"] }));
    expect(a.modulosRanqueados.every((m) => !m.razoes.some((r) => r.includes("outra")))).toBe(true);
  });

  it("cada ponto tem razão registrada — o ranking é auditável", () => {
    for (const m of avaliar(FIXTURES.SOBREVIVENCIA).modulosRanqueados) {
      if (m.pontos > 0) expect(m.razoes.length, m.modulo).toBeGreaterThan(0);
      else expect(m.razoes, m.modulo).toHaveLength(0);
    }
  });

  it("empate desempata sempre igual, em qualquer execução", () => {
    // Sem dor declarada e sem sinal nenhum, os seis módulos empatam em zero.
    const neutro = comBase({
      dores: ["outra"],
      cmv: "sei",
      dre: "sim",
      margemPrato: "sim",
      resultado3Meses: "lucro",
      gerente: "sim",
      rotatividade: "baixa",
      treinamento: "processo",
      fichasTecnicas: "sim",
      horasOperacao: "menos_4",
      sistema: "pdv_erp",
      baseClientes: "organizada",
      delivery: {
        notaIfood: "n48_mais",
        respondeAvaliacoes: "sempre",
        campanhas: "com_controle",
        cancelamentos: "raro",
        fotos: "profissionais",
      },
    });
    const ordem = avaliar(neutro).modulosRanqueados.map((m) => m.modulo);
    expect(new Set(avaliar(neutro).modulosRanqueados.map((m) => m.pontos))).toEqual(new Set([0]));
    expect(avaliar(neutro).modulosRanqueados.map((m) => m.modulo)).toEqual(ordem);
    expect(ordem).toEqual(["financeiro", "estrutura", "ifood", "equipe", "crm", "saas"]);
  });
});

describe("nível de oferta", () => {
  const porMomento = {
    PRE_ABERTURA: "projeto_estrutura",
    SOBREVIVENCIA: "focada_estancar",
    ESTABILIZACAO: "focada_organizar",
    ESCALA: "parceria",
  } as const;

  for (const [fixture, nivel] of Object.entries(porMomento)) {
    it(`${fixture} sugere ${nivel}`, () => {
      expect(avaliar(FIXTURES[fixture as keyof typeof FIXTURES]).nivelOferta.id).toBe(nivel);
    });
  }

  it("CRESCIMENTO com delivery pesado e CRM fraco vira Parceria", () => {
    const r = comBase({
      cmv: "sei",
      dre: "sim",
      margemPrato: "sim",
      resultado3Meses: "lucro",
      gerente: "sim",
      objetivo6meses: "vender_delivery",
      percentualDelivery: "d80_mais",
      baseClientes: "nao_tenho",
      fidelidade: "nunca",
    });
    const a = avaliar(r);
    expect(a.momento).toBe("CRESCIMENTO");
    expect(a.nivelOferta.id).toBe("parceria");
  });

  it("CRESCIMENTO com base organizada e fidelidade fica na Consultoria Completa", () => {
    const r = comBase({
      cmv: "sei",
      dre: "sim",
      margemPrato: "sim",
      resultado3Meses: "lucro",
      gerente: "sim",
      objetivo6meses: "vender_delivery",
      percentualDelivery: "d80_mais",
      baseClientes: "organizada",
      fidelidade: "tenho",
    });
    const a = avaliar(r);
    expect(a.momento).toBe("CRESCIMENTO");
    expect(a.nivelOferta.id).toBe("completa");
  });

  it("o nível nunca repete módulo", () => {
    for (const [nome, r] of Object.entries(FIXTURES)) {
      const m = avaliar(r).nivelOferta.modulos;
      expect(new Set(m).size, nome).toBe(m.length);
    }
  });

  it("Estancar sempre carrega Gestão Financeira", () => {
    expect(avaliar(FIXTURES.SOBREVIVENCIA).nivelOferta.modulos).toContain("financeiro");
  });
});

describe("flags", () => {
  it("REDE em quem tem sete lojas ou mais", () => {
    expect(detectarFlags(FIXTURES.REDE)).toContain("REDE");
    expect(detectarFlags(FIXTURES.ESTABILIZACAO)).not.toContain("REDE");
  });

  it("CONFLITO é categoria E território — nunca um dos dois sozinho", () => {
    expect(detectarFlags(FIXTURES.CONFLITO)).toContain("CONFLITO");

    const acaiLonge = comBase({
      categoria: "acai_sucos",
      bairroCidade: "Campo Grande, Rio de Janeiro",
    });
    expect(detectarFlags(acaiLonge)).not.toContain("CONFLITO");

    const hamburgerNaTijuca = comBase({
      categoria: "hamburgueria",
      bairroCidade: "Tijuca, Rio de Janeiro",
    });
    expect(detectarFlags(hamburgerNaTijuca)).not.toContain("CONFLITO");
  });

  it("CONFLITO pega pelo nome, mesmo com categoria Outro e sem acento", () => {
    const r = comBase({
      restaurante: "Acai da Serra",
      categoria: "outro",
      bairroCidade: "TIJUCA, RJ",
    });
    expect(detectarFlags(r)).toContain("CONFLITO");
  });

  it("CONFLITO reconhece o território escrito de várias formas", () => {
    for (const bairro of ["Norte Shopping", "norteshopping", "Botafogo", "Rio Sul", "riosul"]) {
      const r = comBase({ categoria: "acai_sucos", bairroCidade: bairro });
      expect(detectarFlags(r), bairro).toContain("CONFLITO");
    }
  });

  it("PRIORIDADE é pressa somada a prejuízo", () => {
    expect(detectarFlags(FIXTURES.PRIORIDADE)).toContain("PRIORIDADE");

    const soPressa = comBase({ urgencia: "pra_ontem", resultado3Meses: "lucro" });
    expect(detectarFlags(soPressa)).not.toContain("PRIORIDADE");
  });

  it("OBJECAO_ALTA exige as três condições juntas", () => {
    expect(detectarFlags(FIXTURES.OBJECAO_ALTA)).toContain("OBJECAO_ALTA");

    const duasDeTres = comBase({
      faturamento: "nao_dizer",
      urgencia: "planejando",
      jaContratouConsultoria: "nunca",
    });
    expect(detectarFlags(duasDeTres)).not.toContain("OBJECAO_ALTA");
  });

  it("DECISAO_COMPARTILHADA quando não decide sozinho", () => {
    expect(detectarFlags(comBase({ quemDecide: "socios" }))).toContain("DECISAO_COMPARTILHADA");
    expect(detectarFlags(comBase({ quemDecide: "familia" }))).toContain("DECISAO_COMPARTILHADA");
    expect(detectarFlags(comBase({ quemDecide: "so_eu" }))).not.toContain(
      "DECISAO_COMPARTILHADA",
    );
  });
});

describe("determinismo", () => {
  it("mesma entrada, mesma saída — sempre", () => {
    for (const [nome, r] of Object.entries(FIXTURES)) {
      expect(avaliar(r), nome).toEqual(avaliar(r));
    }
  });

  it("a ordem das chaves da entrada não muda o resultado", () => {
    const original = FIXTURES.ESTABILIZACAO;
    const embaralhado = Object.fromEntries(
      Object.entries(original).reverse(),
    ) as typeof original;
    expect(avaliar(embaralhado)).toEqual(avaliar(original));
  });

  it("a avaliação carrega a versão do formulário e do config", () => {
    const a = avaliar(FIXTURES.ESTABILIZACAO);
    expect(a.versaoFormulario).toBeTruthy();
    expect(a.versaoConfig).toBeTruthy();
  });
});
