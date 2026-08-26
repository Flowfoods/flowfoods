import { describe, expect, it } from "vitest";
import {
  config,
  contarPalavras,
  fraseModulo,
  frasesDoMomento,
  moduloExiste,
  nomeModulo,
  peso,
  primeiraAcao,
  termosProibidosEm,
} from "./config";
import type { Dor, ModuloId, Momento } from "./tipos";

describe("config carregada", () => {
  it("passa pelo zod na importação — config quebrada não chega em produção", () => {
    expect(config.versao).toBeTruthy();
    expect(config.etapas).toHaveLength(9);
    expect(Object.keys(config.modulos)).toHaveLength(6);
  });

  it("os seis módulos oficiais estão lá com o nome exato", () => {
    expect(Object.values(config.modulos).map((m) => m.nome).sort()).toEqual([
      "Estrutura de Restaurante",
      "Fidelidade & CRM",
      "Gestão Financeira",
      "SaaS com IA",
      "Treinamento de Equipe",
      "iFood & Delivery",
    ]);
  });

  it("as opções do formulário e os pesos não saem de sincronia", () => {
    // Opção nova no JSON sem peso correspondente quebraria o score em silêncio;
    // aqui ela quebra o teste.
    const opcoesDe = (id: string) => {
      for (const etapa of config.etapas) {
        const p = etapa.perguntas.find((q) => q.id === id);
        if (p?.opcoes) return p.opcoes.map((o) => o.valor);
      }
      throw new Error(`pergunta não encontrada: ${id}`);
    };

    const grupos = [
      ["financeiro", config.pesos.financeiro],
      ["operacao", config.pesos.operacao],
      ["digital", config.pesos.digital],
    ] as const;

    for (const [grupo, mapa] of grupos) {
      for (const [pergunta, pesos] of Object.entries(mapa)) {
        const opcoes = opcoesDe(pergunta);
        expect(Object.keys(pesos).sort(), `${grupo}.${pergunta}`).toEqual([...opcoes].sort());
      }
    }
  });

  it("toda dor do formulário está no mapa de módulos", () => {
    const dores = config.etapas
      .flatMap((e) => e.perguntas)
      .find((p) => p.id === "dores")?.opcoes?.map((o) => o.valor);
    expect(dores).toBeDefined();
    const mapeadas = new Set(Object.keys(config.dorParaModulo));
    for (const dor of dores ?? []) {
      expect(mapeadas.has(dor), dor).toBe(true);
    }
  });

  it("todo módulo citado no mapa de dores existe de verdade", () => {
    for (const [dor, destino] of Object.entries(config.dorParaModulo)) {
      for (const m of [destino.principal, destino.secundario]) {
        if (m !== null) expect(moduloExiste(m), `${dor} → ${m}`).toBe(true);
      }
    }
  });

  it("todo nível de oferta só cita módulo que existe", () => {
    for (const [nivel, cfg] of Object.entries(config.nivelOferta)) {
      for (const m of cfg.modulosFixos) {
        expect(moduloExiste(m), `${nivel} → ${m}`).toBe(true);
      }
    }
  });

  it("a copy nasce marcada para revisão do Rodolfo", () => {
    expect(config.revisar).toBe(true);
  });
});

describe("acessos ao config falham alto, nunca em silêncio", () => {
  it("peso ausente estoura dizendo onde", () => {
    // Resposta que não existe no mapa de pesos.
    expect(() => peso("financeiro.cmv", "mais ou menos")).toThrow(/financeiro\.cmv/u);
    // Grupo/pergunta que não existe.
    expect(() => peso("digital.inexistente", "sim")).toThrow(/digital\.inexistente/u);
  });

  it("módulo, momento e dor desconhecidos estouram", () => {
    expect(() => nomeModulo("inexistente" as ModuloId)).toThrow(/módulo desconhecido/u);
    expect(() => fraseModulo("inexistente" as ModuloId)).toThrow(/módulo desconhecido/u);
    expect(() => frasesDoMomento("QUALQUER" as Momento)).toThrow(/momento sem frase/u);
  });

  it("dor sem ação cai na ação genérica em vez de estourar na cara do dono", () => {
    // Aqui o silêncio é o comportamento certo: melhor uma ação genérica do que
    // uma tela de erro no fim de quatro minutos de formulário.
    expect(primeiraAcao("nunca_vista" as Dor)).toBe(config.primeirasAcoes["outra"]);
  });
});

describe("utilitários de texto", () => {
  it("conta palavras separadas por qualquer espaço", () => {
    expect(contarPalavras("  um   dois\ntrês  ")).toBe(3);
    expect(contarPalavras("")).toBe(0);
  });

  it("acha termo proibido sem se importar com a caixa", () => {
    expect(termosProibidosEm("Cresce 30% GARANTIDO")).toEqual(
      expect.arrayContaining(["%", "garant"]),
    );
    expect(termosProibidosEm("Uma frase limpa e direta.")).toEqual([]);
  });
});
