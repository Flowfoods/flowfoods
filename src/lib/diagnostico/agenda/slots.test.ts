import { describe, expect, it } from "vitest";
import { gerarSlots, JANELAS_PADRAO, rotularSlot, slotDisponivel } from "./slots";
import type { OpcoesSlots } from "./slots";

/**
 * Segunda-feira, 24/08/2026, 09:00 em São Paulo (12:00 UTC). Ancorar o "agora"
 * é o ponto: com relógio real, este arquivo passaria hoje e falharia amanhã.
 */
const AGORA = "2026-08-24T12:00:00.000Z";

function opcoes(mudancas: Partial<OpcoesSlots> = {}): OpcoesSlots {
  return {
    agoraISO: AGORA,
    janelas: JANELAS_PADRAO,
    reservas: [],
    bloqueios: [],
    ...mudancas,
  };
}

/** `HH:MM` de São Paulo para um slot em ISO UTC. */
function horaSP(iso: string): string {
  return rotularSlot(iso).split(" às ")[1] ?? "";
}

describe("geração de horários", () => {
  it("gera horários de 30 em 30 minutos dentro da janela", () => {
    const slots = gerarSlots(opcoes({ janelas: [{ diaDaSemana: 2, inicio: "18:30", fim: "21:30" }] }));
    const naTerca = slots.filter((s) => rotularSlot(s).startsWith("ter, 25/08"));
    expect(naTerca.map(horaSP)).toEqual(["18:30", "19:00", "19:30", "20:00", "20:30", "21:00"]);
  });

  it("o último horário cabe inteiro na janela — nada termina depois do fim", () => {
    const slots = gerarSlots(opcoes({ janelas: [{ diaDaSemana: 6, inicio: "09:00", fim: "12:00" }] }));
    const noSabado = slots.filter((s) => rotularSlot(s).startsWith("sáb, 29/08"));
    expect(noSabado.map(horaSP)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
  });

  it("respeita o dia da semana no calendário de São Paulo, não no UTC", () => {
    // 09:00 de sábado em SP é 12:00 UTC do mesmo sábado. Um slot de 21:00 de
    // sexta em SP já é sábado em UTC — se o cálculo escorregar de fuso, ele
    // aparece no dia errado e o cliente marca quando o Rodolfo não atende.
    const slots = gerarSlots(opcoes());
    for (const s of slots) {
      const rotulo = rotularSlot(s);
      const dia = rotulo.slice(0, 3);
      const hora = horaSP(s);
      if (dia === "sáb") expect(hora >= "09:00" && hora < "12:00", rotulo).toBe(true);
      else expect(hora >= "18:30" && hora < "21:30", rotulo).toBe(true);
      expect(dia, rotulo).not.toBe("dom");
    }
  });

  it("nunca oferece horário para daqui a pouco: 12 h de antecedência", () => {
    const slots = gerarSlots(opcoes());
    const limite = Date.parse(AGORA) + 12 * 3600_000;
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(Date.parse(s)).toBeGreaterThanOrEqual(limite);

    // Hoje é segunda 09:00 em SP. Da janela de hoje (18:30–21:30) sobra APENAS
    // o 21:00, que cai exatamente nas 12 h — o limite é "não antes de", não
    // "estritamente depois". Os anteriores estão perto demais e saem.
    const hoje = slots.filter((s) => rotularSlot(s).startsWith("seg, 24/08"));
    expect(hoje.map(horaSP)).toEqual(["21:00"]);
  });

  it("não vai além do horizonte de 21 dias", () => {
    const slots = gerarSlots(opcoes());
    const teto = Date.parse(AGORA) + 21 * 24 * 3600_000;
    for (const s of slots) expect(Date.parse(s)).toBeLessThanOrEqual(teto);
  });

  it("sai em ordem, sem repetir", () => {
    const slots = gerarSlots(opcoes());
    expect([...slots].sort()).toEqual(slots);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("sem janela configurada, não inventa horário", () => {
    expect(gerarSlots(opcoes({ janelas: [] }))).toEqual([]);
  });
});

describe("conflitos", () => {
  const terca1830 = "2026-08-25T21:30:00.000Z";
  const terca1900 = "2026-08-25T22:00:00.000Z";
  const terca1930 = "2026-08-25T22:30:00.000Z";
  const terca2000 = "2026-08-25T23:00:00.000Z";

  it("horário reservado some da lista", () => {
    const com = gerarSlots(
      opcoes({ reservas: [{ inicio: terca1900, fim: terca1930 }] }),
    );
    expect(com).not.toContain(terca1900);
  });

  it("o respiro de 15 min derruba o vizinho colado dos dois lados", () => {
    const slots = gerarSlots(opcoes({ reservas: [{ inicio: terca1900, fim: terca1930 }] }));
    // 18:30 termina 19:00, colado no início da reserva. 19:30 começa colado no fim.
    expect(slots).not.toContain(terca1830);
    expect(slots).not.toContain(terca1930);
    // 20:00 já tem 30 min de folga do fim da reserva: continua livre.
    expect(slots).toContain(terca2000);
  });

  it("bloqueio é parede sem respiro: só come o que ele cobre", () => {
    const slots = gerarSlots(opcoes({ bloqueios: [{ inicio: terca1900, fim: terca1930 }] }));
    expect(slots).not.toContain(terca1900);
    // Sem buffer, o vizinho imediato sobrevive — um compromisso de meia hora
    // não pode apagar uma hora e meia de agenda boa.
    expect(slots).toContain(terca1830);
    expect(slots).toContain(terca1930);
  });

  it("double-booking é recusado na hora de gravar, não na hora de desenhar a tela", () => {
    const o = opcoes();
    expect(slotDisponivel(terca1900, o)).toBe(true);

    // Entre a tela e o clique, outro cliente pegou o mesmo horário.
    const depois = opcoes({ reservas: [{ inicio: terca1900, fim: terca1930 }] });
    expect(slotDisponivel(terca1900, depois)).toBe(false);
  });

  it("horário fora de qualquer janela é recusado, mesmo sem reserva", () => {
    // Terça, 03:00 da manhã em SP.
    expect(slotDisponivel("2026-08-25T06:00:00.000Z", opcoes())).toBe(false);
  });

  it("reserva que cobre a janela inteira zera o dia", () => {
    const slots = gerarSlots(
      opcoes({
        janelas: [{ diaDaSemana: 2, inicio: "18:30", fim: "21:30" }],
        reservas: [
          { inicio: "2026-08-25T21:00:00.000Z", fim: "2026-08-26T01:00:00.000Z" },
        ],
      }),
    );
    expect(slots.filter((s) => rotularSlot(s).startsWith("ter, 25/08"))).toEqual([]);
  });
});

describe("rótulo", () => {
  it("mostra dia e hora de São Paulo", () => {
    expect(rotularSlot("2026-08-29T12:00:00.000Z")).toBe("sáb, 29/08 às 09:00");
    expect(rotularSlot("2026-08-25T21:30:00.000Z")).toBe("ter, 25/08 às 18:30");
  });

  it("recusa entrada inválida em vez de mostrar 'Invalid Date' para o cliente", () => {
    expect(() => rotularSlot("qualquer coisa")).toThrow();
  });
});

describe("entradas inválidas", () => {
  it("horário de janela malformado estoura com mensagem clara", () => {
    expect(() =>
      gerarSlots(opcoes({ janelas: [{ diaDaSemana: 2, inicio: "dezoito", fim: "21:30" }] })),
    ).toThrow(/HH:MM/u);
  });

  it("reserva com data inválida estoura em vez de virar horário livre", () => {
    expect(() =>
      gerarSlots(opcoes({ reservas: [{ inicio: "ontem", fim: "hoje" }] })),
    ).toThrow(/intervalo inválido/u);
  });
});
