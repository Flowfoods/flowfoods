import { describe, expect, it } from "vitest";
import { avaliar } from "./motor/avaliar";
import { BASE } from "./fixtures";
import {
  etapa3Schema,
  etapa7Schema,
  etapa8Schema,
  etapa5Aplicavel,
  etapasAplicaveis,
  montarRespostas,
  normalizarCelular,
  rotuloDeProgresso,
} from "./formulario";

/** As respostas do BASE no formato cru que chega do formulário. */
function bruto(mudancas: Record<string, unknown> = {}): Record<string, unknown> {
  const { delivery, ...resto } = BASE;
  return { ...resto, ...delivery, ...mudancas };
}

describe("celular", () => {
  it("aceita os formatos que o dono digita de verdade", () => {
    const esperado = "5521999990001";
    for (const entrada of [
      "21999990001",
      "(21) 99999-0001",
      "5521999990001",
      "+55 21 99999 0001",
      "  21 9 9999 0001 ",
    ]) {
      expect(normalizarCelular(entrada), entrada).toBe(esperado);
    }
  });

  it("recusa fixo — a leitura e o lembrete vão por WhatsApp", () => {
    expect(normalizarCelular("2133334444")).toBeNull();
    expect(normalizarCelular("552133334444")).toBeNull();
  });

  it("recusa DDD que não existe", () => {
    expect(normalizarCelular("00999990001")).toBeNull();
    expect(normalizarCelular("20999990001")).toBeNull();
  });

  it("recusa número curto, longo ou vazio", () => {
    for (const n of ["", "9999", "219999900011111"]) {
      expect(normalizarCelular(n), n).toBeNull();
    }
  });
});

describe("consentimento", () => {
  it("sem consentimento, o envio é recusado", () => {
    const r = montarRespostas(bruto({ consentimento: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.some((e) => e.campo === "consentimento")).toBe(true);
  });

  it("consentimento ausente também é recusado — não é o mesmo que aceito", () => {
    const dados = bruto();
    delete dados["consentimento"];
    expect(montarRespostas(dados).ok).toBe(false);
  });

  it("só `true` passa", () => {
    expect(etapa8Schema.safeParse({ ...bruto(), consentimento: "sim" }).success).toBe(false);
    expect(etapa8Schema.safeParse({ ...bruto(), consentimento: true }).success).toBe(true);
  });
});

describe("etapa 5 é condicional", () => {
  it("aparece para quem marcou iFood ou outros apps", () => {
    expect(etapa5Aplicavel(["salao", "ifood"])).toBe(true);
    expect(etapa5Aplicavel(["outros_apps"])).toBe(true);
  });

  it("some para quem só vende no salão e no balcão", () => {
    expect(etapa5Aplicavel(["salao", "balcao"])).toBe(false);
    expect(etapa5Aplicavel(["salao", "delivery_proprio"])).toBe(false);
  });

  it("quem não vende por app não precisa responder a etapa 5", () => {
    const r = montarRespostas(bruto({ canais: ["salao", "balcao"], notaIfood: undefined }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.respostas.delivery).toBeUndefined();
  });

  it("quem vende por app e pula a etapa 5 é recusado", () => {
    const dados = bruto({ canais: ["salao", "ifood"] });
    delete dados["notaIfood"];
    const r = montarRespostas(dados);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.some((e) => e.etapa === 5)).toBe(true);
  });

  it("o HUD conta só as etapas que este dono vai ver", () => {
    expect(etapasAplicaveis(["salao", "ifood"])).toHaveLength(8);
    expect(etapasAplicaveis(["salao"])).toHaveLength(7);
    expect(rotuloDeProgresso(3, ["salao", "ifood"])).toBe("SCAN 03/08");
    // Sem a etapa 5, a etapa 6 é a quinta da fila — e o HUD não pode mentir.
    expect(rotuloDeProgresso(6, ["salao"])).toBe("SCAN 05/07");
  });
});

describe("validação por etapa", () => {
  it("recusa valor que não está entre as opções", () => {
    expect(etapa3Schema.safeParse({ ...bruto(), cmv: "mais ou menos" }).success).toBe(false);
  });

  it("exige pelo menos uma dificuldade e no máximo três", () => {
    expect(etapa7Schema.safeParse({ ...bruto(), dores: [] }).success).toBe(false);
    expect(
      etapa7Schema.safeParse({
        ...bruto(),
        dores: ["equipe", "custos_altos", "marketing", "vendas_caindo"],
      }).success,
    ).toBe(false);
  });

  it("recusa dor repetida — repetir inflaria o módulo sem o dono dizer nada a mais", () => {
    expect(
      etapa7Schema.safeParse({ ...bruto(), dores: ["equipe", "equipe"] }).success,
    ).toBe(false);
  });

  it("aponta a etapa de cada erro, para o formulário saber onde voltar", () => {
    const r = montarRespostas(bruto({ cmv: "chute", dores: [], whatsapp: "123" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(new Set(r.erros.map((e) => e.etapa))).toEqual(new Set([3, 7, 8]));
    }
  });

  it("não estoura exceção com entrada lixo — devolve erros", () => {
    for (const lixo of [null, undefined, {}, [], "texto", 42]) {
      const r = montarRespostas(lixo);
      expect(r.ok).toBe(false);
    }
  });

  it("campo opcional em branco vira ausente, não string vazia", () => {
    const r = montarRespostas(bruto({ ifoodUrl: "", instagram: "", email: "", tiraSono: "" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.respostas.ifoodUrl).toBeUndefined();
      expect(r.respostas.instagram).toBeUndefined();
      expect(r.respostas.email).toBeUndefined();
      expect(r.respostas.tiraSono).toBeUndefined();
    }
  });

  it("recusa URL de iFood que não é URL", () => {
    const r = montarRespostas(bruto({ ifoodUrl: "minha loja no ifood" }));
    expect(r.ok).toBe(false);
  });

  it("o que sai de montarRespostas alimenta o motor sem retoque", () => {
    const r = montarRespostas(bruto());
    expect(r.ok).toBe(true);
    if (r.ok) {
      const a = avaliar(r.respostas);
      expect(a.momento).toBe(avaliar(BASE).momento);
      expect(a.leitura.palavras).toBeLessThanOrEqual(120);
    }
  });

  it("normaliza o WhatsApp na entrada, não depois", () => {
    const r = montarRespostas(bruto({ whatsapp: "(21) 99999-0001" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.respostas.whatsapp).toBe("5521999990001");
  });
});

describe("link do iFood — opcional e tolerante", () => {
  it("aceita o que o dono realmente cola, e normaliza para https", () => {
    for (const entrada of [
      "ifood.com.br/delivery/rio-de-janeiro/pizzaria",
      "www.ifood.com.br/delivery/x",
      "  https://ifood.com.br/delivery/x  ",
      "HTTPS://IFOOD.COM.BR/x",
    ]) {
      const r = montarRespostas(bruto({ ifoodUrl: entrada }));
      expect(r.ok, entrada).toBe(true);
      if (r.ok) expect(r.respostas.ifoodUrl, entrada).toMatch(/^https:\/\//u);
    }
  });

  it("em branco continua sendo ausente, não erro", () => {
    const r = montarRespostas(bruto({ ifoodUrl: "" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.respostas.ifoodUrl).toBeUndefined();
  });

  it("recusa o que não é endereço, com mensagem que o dono entende", () => {
    const r = montarRespostas(bruto({ ifoodUrl: "minha loja no ifood" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const erro = r.erros.find((e) => e.campo === "ifoodUrl");
      expect(erro?.mensagem).toContain("não parece um endereço");
      // A regressão que motivou tudo isto: o erro chegava como "Invalid url"
      // na etapa 8, depois de quatro minutos de respostas.
      expect(erro?.etapa).toBe(2);
    }
  });
});
