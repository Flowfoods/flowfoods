/**
 * Scoring do lead — porte fiel de `pontuar` / `classificar` / `limpa` do
 * `ledsflowfoods/scripts/montar_pacote.py`.
 *
 * O portal precisa recalcular score porque o Gap Digital chega DEPOIS, no
 * enriquecimento. Se o portal calculasse diferente do script, a planilha e a
 * tela discordariam do mesmo lead — e a planilha é o que o Rodolfo confere.
 * Então: mesma conta, mesmos cortes, mesmos empates.
 *
 * O que o score mede é capacidade e acesso, NÃO fit (`icp-e-scoring.md`).
 */

import { normalizarTelefone } from './telefone';

export interface ScoreBase {
  /** 0–35 — capacidade de pagar, por volume de avaliações e nota. */
  capacidade: number;
  /** 0–20 — acesso ao decisor, pelo tipo de telefone. */
  acessoDecisor: number;
  /** 0–15 — território, pelo bloco. */
  territorio: number;
  /** Soma 0–70. */
  base: number;
}

export function pontuar(
  nota: number,
  avaliacoes: number,
  telefone: string | null | undefined,
  bloco: string,
): ScoreBase {
  const n = Number(nota);
  const a = Math.trunc(Number(avaliacoes));

  let capacidade: number;
  if (a >= 3000) capacidade = 35;
  else if (a >= 1000) capacidade = 30;
  else if (a >= 400) capacidade = 24;
  else if (a >= 150) capacidade = 18;
  else if (a >= 60) capacidade = 12;
  else capacidade = 8;

  // Ajuste por nota, com piso 5 e teto 35 — igual ao script.
  if (n >= 4.6) capacidade = Math.min(35, capacidade + 3);
  else if (n < 4.2) capacidade = Math.max(5, capacidade - 4);

  // Acesso ao decisor. O script decide por dígitos crus; aqui passa pelo
  // normalizador, que rejeita DDD inexistente — mais rígido, nunca mais frouxo.
  const tel = normalizarTelefone(telefone);
  let acessoDecisor: number;
  if (tel.tipo === 'CELULAR') acessoDecisor = 20;
  else if (tel.tipo === 'FIXO') acessoDecisor = 11;
  else acessoDecisor = 0;

  const territorio = { A: 15, B: 12, C: 10, D: 8 }[String(bloco).toUpperCase()] ?? 10;

  return { capacidade, acessoDecisor, territorio, base: capacidade + acessoDecisor + territorio };
}

export type Tier = 'T1' | 'T2' | 'T3';

/**
 * Cortes sobem quando a lista é só celular, porque aí todo mundo pontua 20 em
 * acesso ao decisor e o 20 deixa de discriminar.
 */
export function classificar(base: number, somenteCelular: boolean): Tier {
  const [t1, t2] = somenteCelular ? [60, 48] : [55, 42];
  if (base >= t1) return 'T1';
  if (base >= t2) return 'T2';
  return 'T3';
}

export const TIER_ROTULO: Record<Tier, string> = {
  T1: 'T1 - Prioritario',
  T2: 'T2 - Padrao',
  T3: 'T3 - Lista B',
};

/** Gap Digital (0–30) — manual, preenchido só no enriquecimento. */
export interface GapDigital {
  ifoodRaso?: boolean;
  naoRespondeAvaliacoes?: boolean;
  semCanalProprio?: boolean;
  semFidelidade?: boolean;
}

export function pontuarGapDigital(gap: GapDigital): number {
  return (
    (gap.ifoodRaso ? 10 : 0) +
    (gap.naoRespondeAvaliacoes ? 8 : 0) +
    (gap.semCanalProprio ? 7 : 0) +
    (gap.semFidelidade ? 5 : 0)
  );
}

/**
 * Score final 0–100. Devolve `null` enquanto o Gap Digital não foi apurado —
 * preencher no chute destrói a premissa da abordagem, que é falar de
 * oportunidade real daquela casa.
 */
export function scoreFinal(base: number, gap: number | null | undefined): number | null {
  if (gap == null) return null;
  return base + gap;
}

/**
 * Encurta o nome comercial para caber no gancho. Espelha `limpa` do
 * `montar_pacote.py`, com UMA correção deliberada.
 *
 * DIVERGÊNCIA (docs/AUDITORIA_C3.md, achado #5): no script, os sufixos são
 * testados em ordem e " Campo Grande" vem antes de " - ". Em
 * "Katsuo Culinaria Asiatica - Campo Grande" o primeiro corte deixa
 * "Katsuo Culinaria Asiatica -", e o " - " já não casa mais porque virou " -"
 * no fim da string. O `rstrip(".")` do script só limpa ponto, então o traço
 * órfão sobrevive — e vai para dentro do gancho, que é a primeira linha que o
 * dono do restaurante lê: "Vi que o Katsuo Culinaria Asiatica - está com 4,8".
 *
 * Traço solto é exatamente o sinal de "isso aqui é automático" que a abordagem
 * inteira existe para não dar. Aqui a limpeza final tira qualquer pontuação de
 * borda, que era a intenção evidente do `rstrip`. Patch para o script em
 * docs/PENDENCIAS_RODOLFO.md.
 */
export function nomeCurto(nome: string): string {
  let n = String(nome);
  for (const c of [' Campo Grande', ' Bangu', ' Realengo', ' RJ', ' - ', ' |']) {
    if (n.includes(c)) n = n.split(c)[0];
  }
  return n.trim().replace(/[\s.,\-|–—]+$/u, '').trim();
}
