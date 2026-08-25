import { describe, expect, it } from "vitest";
import { config, contarPalavras, termosProibidosEm } from "../config";
import { comBase, FIXTURES } from "../fixtures";
import { avaliar } from "./avaliar";
import { montarLeitura, selecionarSinais, validarBibliotecas } from "./leitura";
import { calcularScores } from "./scores";
import type { ModuloId, Momento } from "../tipos";

const MOMENTOS = Object.keys(config.frasesMomento) as Momento[];
const MODULOS = Object.keys(config.modulos) as ModuloId[];
const DORES = Object.keys(config.primeirasAcoes);
const SINAIS = config.sinais.map((s) => s.id);

/** Nome de restaurante propositalmente comprido: é o pior caso do orçamento. */
const NOME_COMPRIDO = "Restaurante e Pizzaria Dona Maria da Penha";

function maisLongo(textos: string[]): string {
  return textos.reduce((a, b) => (contarPalavras(b) > contarPalavras(a) ? b : a));
}

describe("bibliotecas de copy", () => {
  it("passam no próprio lint: nenhum termo proibido, nenhum teto estourado", () => {
    expect(validarBibliotecas()).toEqual([]);
  });

  it("nenhum texto de biblioteca contém termo proibido", () => {
    const todos = [
      ...config.sinais.map((s) => [`sinal ${s.id}`, s.texto] as const),
      ...Object.entries(config.frasesMomento).map(
        ([k, v]) => [`momento ${k}`, `${v.badge} ${v.frase}`] as const,
      ),
      ...Object.entries(config.modulos).map(
        ([k, v]) => [`módulo ${k}`, `${v.nome} ${v.frase}`] as const,
      ),
      ...Object.entries(config.primeirasAcoes).map(([k, v]) => [`ação ${k}`, v] as const),
      ["cta", config.cta] as const,
    ];
    for (const [onde, texto] of todos) {
      expect(termosProibidosEm(texto), onde).toEqual([]);
    }
  });

  it("toda dor do mapa tem uma primeira ação", () => {
    const comAcao = new Set(Object.keys(config.primeirasAcoes));
    for (const dor of Object.keys(config.dorParaModulo)) {
      expect(comAcao.has(dor), dor).toBe(true);
    }
  });

  it("todo sinal tem prioridade única — senão a ordem dos três vira sorte", () => {
    const prioridades = config.sinais.map((s) => s.prioridade);
    expect(new Set(prioridades).size).toBe(prioridades.length);
  });
});

/**
 * Um lint que só sabe dizer "está tudo bem" não protege nada. Estes testes
 * quebram o config de propósito para provar que ele ACUSA — sem isso, o teste
 * verde acima poderia estar passando porque a função não olha nada.
 */
describe("o lint de copy pega problema de verdade", () => {
  const quebrar = (mudanca: Partial<typeof config>) =>
    validarBibliotecas({ ...config, ...mudanca } as typeof config);

  it("acusa sinal com palavra demais", () => {
    const problemas = quebrar({
      sinais: [
        {
          id: "inchado",
          prioridade: 99,
          // 11 palavras é o teto exato; esta tem 16 e precisa ser acusada.
          texto:
            "Uma frase deliberadamente comprida que passa do teto combinado para sinal e segue falando sem parar.",
        },
      ],
    });
    expect(problemas.some((p) => p.onde === "sinal inchado" && p.problema.includes("teto"))).toBe(
      true,
    );
  });

  it("acusa percentual e preço na copy", () => {
    const problemas = quebrar({
      sinais: [
        { id: "com_percentual", prioridade: 98, texto: "Sua margem caiu 30%." },
        { id: "com_preco", prioridade: 97, texto: "Você perdeu R$ 4 mil." },
      ],
    });
    expect(problemas.filter((p) => p.problema.includes("termo proibido"))).toHaveLength(2);
  });

  it("acusa promessa de garantia e oferta de graça", () => {
    const problemas = quebrar({
      sinais: [
        { id: "promessa", prioridade: 96, texto: "Resultado garantido em trinta dias." },
        { id: "de_graca", prioridade: 95, texto: "É gratuito e sem compromisso." },
      ],
    });
    expect(problemas.filter((p) => p.problema.includes("termo proibido")).length).toBeGreaterThanOrEqual(2);
  });

  it("acusa dor sem primeira ação — o dono sairia sem nada pra fazer hoje", () => {
    const semAcao = { ...config.primeirasAcoes };
    delete (semAcao as Record<string, string>)["equipe"];
    const problemas = quebrar({ primeirasAcoes: semAcao });
    expect(problemas).toContainEqual({ onde: "primeira ação equipe", problema: "faltando" });
  });

  it("acusa sinal que o motor cita e o config não tem", () => {
    const problemas = quebrar({ sinais: [] });
    expect(problemas.some((p) => p.problema.includes("ausente do config"))).toBe(true);
  });
});

describe("leitura inicial — varredura de todas as combinações", () => {
  const base = comBase({ restaurante: NOME_COMPRIDO });
  const scores = calcularScores(base);

  it("momento × módulo × dor, com os três sinais mais longos", () => {
    // Os três sinais mais compridos juntos são o teto de palavras possível.
    const tresMaiores = [...config.sinais]
      .sort((a, b) => contarPalavras(b.texto) - contarPalavras(a.texto))
      .slice(0, 3)
      .map((s) => s.id);

    let combinacoes = 0;
    for (const momento of MOMENTOS) {
      for (const modulo of MODULOS) {
        for (const dor of DORES) {
          const r = comBase({
            restaurante: NOME_COMPRIDO,
            dores: [dor as (typeof base.dores)[number]],
          });
          const l = montarLeitura(r, scores, momento, modulo, tresMaiores);
          const onde = `${momento}/${modulo}/${dor}`;
          expect(termosProibidosEm(l.textoCompleto), onde).toEqual([]);
          expect(l.palavras, onde).toBeLessThanOrEqual(config.limitesDeCopy.palavrasLeitura);
          combinacoes++;
        }
      }
    }
    expect(combinacoes).toBe(MOMENTOS.length * MODULOS.length * DORES.length);
  });

  it("todo trio possível de sinais, no pior momento/módulo/ação", () => {
    const maiorPor = <T>(pares: Array<[string, T]>, tamanho: (v: T) => number): string =>
      pares.reduce((a, b) => (tamanho(b[1]) > tamanho(a[1]) ? b : a))[0];

    const piorMomento = maiorPor(Object.entries(config.frasesMomento), (v) =>
      contarPalavras(v.frase),
    ) as Momento;
    const piorModulo = maiorPor(Object.entries(config.modulos), (v) =>
      contarPalavras(`${v.nome} ${v.frase}`),
    ) as ModuloId;
    const piorDor = maiorPor(Object.entries(config.primeirasAcoes), contarPalavras);
    const r = comBase({
      restaurante: NOME_COMPRIDO,
      dores: [piorDor as (typeof base.dores)[number]],
    });

    let trios = 0;
    for (let i = 0; i < SINAIS.length; i++) {
      const a = SINAIS.at(i)!;
      for (let j = i + 1; j < SINAIS.length; j++) {
        const b = SINAIS.at(j)!;
        for (let k = j + 1; k < SINAIS.length; k++) {
          const c = SINAIS.at(k)!;
          const l = montarLeitura(r, scores, piorMomento, piorModulo, [a, b, c]);
          const onde = `${a}+${b}+${c}`;
          expect(termosProibidosEm(l.textoCompleto), onde).toEqual([]);
          expect(l.palavras, onde).toBeLessThanOrEqual(config.limitesDeCopy.palavrasLeitura);
          trios++;
        }
      }
    }
    // C(n,3) — a conta fecha, então nenhum trio ficou de fora.
    const n = SINAIS.length;
    expect(trios).toBe((n * (n - 1) * (n - 2)) / 6);
  });

  it("a emenda entre textos não fabrica termo proibido", () => {
    // Cada texto passa sozinho; o risco que sobra é a junção ("garan" + "tia").
    const maiorSinal = maisLongo(config.sinais.map((s) => s.texto));
    expect(maiorSinal).toBeTruthy();
    for (const momento of MOMENTOS) {
      const l = montarLeitura(base, scores, momento, "financeiro");
      expect(termosProibidosEm(l.texto.replace(/\s+/gu, ""))).toEqual([]);
    }
  });
});

describe("leitura inicial — forma", () => {
  it("todos os fixtures geram leitura dentro das regras", () => {
    for (const [nome, r] of Object.entries(FIXTURES)) {
      const l = avaliar(r).leitura;
      expect(termosProibidosEm(l.textoCompleto), nome).toEqual([]);
      expect(l.palavras, nome).toBeLessThanOrEqual(120);
      expect(l.texto, nome).toContain(r.restaurante);
    }
  });

  it("termina na chamada para ação — nada vem depois", () => {
    const l = avaliar(FIXTURES.ESTABILIZACAO).leitura;
    expect(l.textoCompleto.trimEnd().endsWith(`[ ${l.cta} ]`)).toBe(true);
    expect(l.cta).toBe(config.cta);
  });

  it("mostra exatamente três sinais", () => {
    for (const [nome, r] of Object.entries(FIXTURES)) {
      expect(avaliar(r).leitura.sinaisUsados, nome).toHaveLength(3);
    }
  });

  it("mesmo a casa mais saudável possível acende três sinais", () => {
    // Sem o piso de sinais, esta casa geraria uma leitura sem uma bala sequer.
    const impecavel = comBase({
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
      fidelidade: "tenho",
      lojas: "uma",
      percentualDelivery: "d0_20",
      delivery: {
        notaIfood: "n48_mais",
        respondeAvaliacoes: "sempre",
        campanhas: "com_controle",
        cancelamentos: "raro",
        fotos: "profissionais",
      },
    });
    expect(avaliar(impecavel).leitura.sinaisUsados).toHaveLength(3);
  });

  it("o sinal mais grave vem primeiro", () => {
    const a = avaliar(FIXTURES.SOBREVIVENCIA);
    expect(a.leitura.sinaisUsados[0]).toBe("prejuizo_recente");
  });

  it("os sinais saem em ordem de prioridade, sem repetir", () => {
    for (const [nome, r] of Object.entries(FIXTURES)) {
      const ids = selecionarSinais(r, calcularScores(r), avaliar(r).momento);
      const prioridades = ids.map(
        (id) => config.sinais.find((s) => s.id === id)?.prioridade ?? -1,
      );
      expect(new Set(ids).size, nome).toBe(ids.length);
      expect([...prioridades].sort((x, y) => x - y), nome).toEqual(prioridades);
    }
  });

  it("quem não vende por app não recebe sinal sobre app", () => {
    const l = avaliar(FIXTURES.SEM_DELIVERY).leitura;
    for (const id of ["nota_baixa", "nota_desconhecida", "avaliacoes_sem_resposta", "sem_fotos"]) {
      expect(l.sinaisUsados).not.toContain(id);
    }
  });

  it("a leitura é a mesma para respostas iguais", () => {
    expect(avaliar(FIXTURES.CRESCIMENTO).leitura).toEqual(
      avaliar(FIXTURES.CRESCIMENTO).leitura,
    );
  });
});
