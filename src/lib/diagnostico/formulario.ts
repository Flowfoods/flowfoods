import { z } from "zod";
import { config } from "./config";
import { normalizarUrl } from "./texto";
import type { Respostas } from "./tipos";

/**
 * Validação por ETAPA, não só no envio final.
 *
 * O formulário salva sozinho a cada etapa (o dono responde no intervalo do
 * trabalho, no 4G, e vai perder a conexão no meio). Cada etapa que chega ao
 * servidor é validada isolada: sem isso, o autosave viraria uma porta lateral
 * para gravar resposta inválida que ninguém mais confere.
 */

// ────────────────────────────── celular ──────────────────────────────

/** DDDs que existem de verdade no Brasil. Pega erro de digitação, não só formato. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41,
  42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71,
  73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98,
  99,
]);

/**
 * Normaliza para `55DDD9XXXXXXXX` ou devolve `null`.
 *
 * Só aceita CELULAR: nove dígitos começando em 9. Fixo é recusado de propósito —
 * a leitura e o lembrete da conversa vão por WhatsApp, e um número de mesa
 * significa mensagem que nunca chega e lead que parece morto sem ser.
 */
export function normalizarCelular(entrada: string): string | null {
  let digitos = entrada.replace(/\D/gu, "");
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    digitos = digitos.slice(2);
  }
  if (digitos.length !== 11) return null;

  const ddd = Number(digitos.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return null;
  if (digitos[2] !== "9") return null;

  return `55${digitos}`;
}

export const celularSchema = z
  .string()
  .transform((v) => normalizarCelular(v))
  .refine((v): v is string => v !== null, {
    message: "Preciso de um celular com WhatsApp, com DDD.",
  });

// ────────────────────────────── etapas ──────────────────────────────

const textoCurto = (max: number) => z.string().trim().min(1).max(max);

export const etapa1Schema = z.object({
  restaurante: textoCurto(80),
  categoria: z.enum([
    "hamburgueria",
    "pizzaria",
    "japones",
    "caseira",
    "bar",
    "acai_sucos",
    "cafeteria_padaria",
    "churrascaria",
    "frutos_do_mar",
    "arabe",
    "doceria",
    "outro",
  ]),
  lojas: z.enum(["vou_abrir", "uma", "duas_tres", "quatro_seis", "sete_mais"]),
  tempoOperacao: z.enum(["nao_abri", "menos_1_ano", "um_tres", "tres_dez", "dez_mais"]),
  bairroCidade: textoCurto(80),
});

export const etapa2Schema = z.object({
  canais: z
    .array(z.enum(["salao", "delivery_proprio", "ifood", "outros_apps", "balcao"]))
    .min(1, "Marca pelo menos um canal."),
  percentualDelivery: z.enum(["d0_20", "d20_40", "d40_60", "d60_80", "d80_mais", "nao_sei"]),
  // Opcional e TOLERANTE: aceita "ifood.com.br/x" e normaliza para https://.
  // Antes exigia URL completa e derrubava o envio inteiro, na etapa 8, por um
  // campo que o dono nem precisava preencher.
  ifoodUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : normalizarUrl(v)))
    .refine((v) => v !== null, {
      message: "Esse link não parece um endereço. Cola a URL da sua loja no iFood.",
    })
    .transform((v) => v ?? undefined),
  instagram: z.string().trim().max(40).optional().or(z.literal("")),
});

export const etapa3Schema = z.object({
  faturamento: z.enum([
    "ate_30k",
    "f30_60k",
    "f60_120k",
    "f120_250k",
    "f250k_mais",
    "nao_dizer",
  ]),
  cmv: z.enum(["sei", "ideia", "nao_sei"]),
  dre: z.enum(["sim", "as_vezes", "nao"]),
  margemPrato: z.enum(["sim", "parcial", "nao"]),
  resultado3Meses: z.enum(["lucro", "empate", "prejuizo", "nao_sei"]),
});

export const etapa4Schema = z.object({
  equipePorLoja: z.enum(["e1_5", "e6_12", "e13_25", "e25_mais"]),
  gerente: z.enum(["sim", "nao"]),
  rotatividade: z.enum(["baixa", "media", "alta"]),
  treinamento: z.enum(["processo", "dia_a_dia", "nenhum"]),
  fichasTecnicas: z.enum(["sim", "parcial", "nao"]),
  horasOperacao: z.enum(["menos_4", "h4_8", "h8_12", "h12_mais"]),
});

export const etapa5Schema = z.object({
  notaIfood: z.enum(["n48_mais", "n45_47", "n40_44", "n_abaixo_40", "nao_sei"]),
  respondeAvaliacoes: z.enum(["sempre", "as_vezes", "nunca"]),
  campanhas: z.enum(["com_controle", "sem_saber", "nao_faco"]),
  cancelamentos: z.enum(["raro", "semana", "dia"]),
  fotos: z.enum(["profissionais", "celular", "sem_fotos"]),
});

export const etapa6Schema = z.object({
  baseClientes: z.enum(["organizada", "whatsapp", "nao_tenho"]),
  fidelidade: z.enum(["tenho", "ja_tentei", "nunca"]),
  mensagens: z.enum(["regularmente", "as_vezes", "nunca"]),
  sistema: z.enum(["pdv_erp", "planilhas", "caderno_nada"]),
});

export const etapa7Schema = z.object({
  dores: z
    .array(
      z.enum([
        "vendas_caindo",
        "margem_apertada",
        "nao_sei_numeros",
        "equipe",
        "ifood_nao_performa",
        "operacao_baguncada",
        "custos_altos",
        "cardapio_grande",
        "poucos_voltam",
        "abrir_nova_loja",
        "abrir_primeira_loja",
        "marketing",
        "outra",
      ]),
    )
    .min(1, "Escolhe pelo menos uma dificuldade.")
    .max(3)
    // Ordem importa (1ª dor vale 3, 2ª vale 2, 3ª vale 1) e repetição inflaria
    // o módulo escolhido sem que o dono tenha dito nada a mais.
    .refine((d) => new Set(d).size === d.length, "Não repete a mesma dificuldade."),
  tiraSono: z.string().trim().max(1000).optional().or(z.literal("")),
  objetivo6meses: z.enum([
    "parar_perder",
    "organizar",
    "vender_delivery",
    "crescer_abrir",
    "sair_operacao",
  ]),
  urgencia: z.enum(["pra_ontem", "este_mes", "planejando"]),
  quemDecide: z.enum(["so_eu", "socios", "familia"]),
  jaContratouConsultoria: z.enum(["deu_certo", "nao_deu_certo", "nunca"]),
});

export const etapa8Schema = z.object({
  nome: textoCurto(80),
  whatsapp: celularSchema,
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  melhorHorario: z.enum(["manha", "tarde", "noite"]),
  // Sem consentimento não existe diagnóstico. `z.literal(true)` recusa `false`
  // e recusa ausente — é a trava, não um aviso na tela.
  consentimento: z.literal(true, {
    error: "Preciso do seu ok para usar as respostas.",
  }),
});

export const ETAPAS_SCHEMAS = {
  1: etapa1Schema,
  2: etapa2Schema,
  3: etapa3Schema,
  4: etapa4Schema,
  5: etapa5Schema,
  6: etapa6Schema,
  7: etapa7Schema,
  8: etapa8Schema,
} as const;

export type NumeroDeEtapa = keyof typeof ETAPAS_SCHEMAS;

/**
 * A etapa 5 só existe para quem vende por app. Perguntar nota do iFood a quem
 * só tem salão é pedir chute — e chute vira score digital falso.
 */
export function etapa5Aplicavel(canais: readonly string[]): boolean {
  const cond = config.etapas.find((e) => e.id === 5)?.condicional;
  if (!cond) return true;
  return cond.contemAlgum.some((c) => canais.includes(c));
}

/** As etapas que este respondente vai ver, na ordem. */
export function etapasAplicaveis(canais: readonly string[]): number[] {
  return config.etapas
    .filter((e) => e.id !== 0)
    .filter((e) => (e.id === 5 ? etapa5Aplicavel(canais) : true))
    .map((e) => e.id);
}

/** Rótulo do HUD de progresso: `SCAN 03/08`. */
export function rotuloDeProgresso(etapaAtual: number, canais: readonly string[]): string {
  const etapas = etapasAplicaveis(canais);
  const posicao = etapas.indexOf(etapaAtual) + 1;
  const total = etapas.length;
  const doisDigitos = (n: number) => String(Math.max(n, 0)).padStart(2, "0");
  return `SCAN ${doisDigitos(posicao)}/${doisDigitos(total)}`;
}

// ────────────────────────── montagem final ──────────────────────────

const semVazio = (v: string | undefined): string | undefined =>
  v === undefined || v.trim() === "" ? undefined : v;

/**
 * Junta as oito etapas nas respostas que o motor consome. Valida tudo de novo,
 * inclusive as etapas que já passaram: entre o autosave e o envio pode ter
 * passado dias, versão nova de formulário, ou uma requisição forjada.
 *
 * Devolve `{ ok: false, erros }` em vez de lançar — o formulário precisa dizer
 * ao dono qual etapa voltar, não estourar 500 depois de quatro minutos de
 * respostas.
 */
export function montarRespostas(bruto: unknown):
  | { ok: true; respostas: Respostas }
  | { ok: false; erros: Array<{ etapa: number; campo: string; mensagem: string }> } {
  const erros: Array<{ etapa: number; campo: string; mensagem: string }> = [];
  const dados = (bruto ?? {}) as Record<string, unknown>;

  // `Map`, e não objeto indexado: o que entra aqui é JSON de fora, e indexar
  // objeto com chave não confiável é porta para poluição de protótipo.
  const parciais = new Map<number, Record<string, unknown>>();
  for (const [numero, schema] of Object.entries(ETAPAS_SCHEMAS)) {
    const etapa = Number(numero);

    if (etapa === 5) {
      const canais = Array.isArray(dados["canais"]) ? (dados["canais"] as string[]) : [];
      if (!etapa5Aplicavel(canais)) continue;
    }

    const resultado = schema.safeParse(dados);
    if (resultado.success) {
      parciais.set(etapa, resultado.data as Record<string, unknown>);
    } else {
      for (const issue of resultado.error.issues) {
        erros.push({
          etapa,
          campo: issue.path.join(".") || "(formulário)",
          mensagem: issue.message,
        });
      }
    }
  }

  if (erros.length > 0) return { ok: false, erros };

  const p = (n: number) => parciais.get(n) ?? {};
  const e2 = p(2);
  const e5 = parciais.get(5);
  const e7 = p(7);
  const e8 = p(8);

  const respostas = {
    ...p(1),
    ...e2,
    ifoodUrl: semVazio(e2["ifoodUrl"] as string | undefined),
    instagram: semVazio(e2["instagram"] as string | undefined),
    ...p(3),
    ...p(4),
    delivery: e5,
    ...p(6),
    ...e7,
    tiraSono: semVazio(e7["tiraSono"] as string | undefined),
    ...e8,
    email: semVazio(e8["email"] as string | undefined),
  } as unknown as Respostas;

  return { ok: true, respostas };
}
