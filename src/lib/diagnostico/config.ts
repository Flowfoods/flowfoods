import { z } from "zod";
import bruto from "./diagnostico.config.json";
import type { Dor, ModuloId, Momento, NivelOfertaId } from "./tipos";

/**
 * `config/diagnostico.json` é a fonte da verdade de perguntas, pesos e copy.
 * Ele é versionado e revisável pelo Rodolfo SEM tocar em código — por isso
 * passa por zod aqui na entrada: config quebrada tem que estourar no boot,
 * com o caminho do campo, e não virar score errado num diagnóstico real.
 */

const mapaDePesos = z.record(z.string(), z.number());

const opcaoSchema = z.object({
  valor: z.string(),
  rotulo: z.string(),
});

const perguntaSchema = z.object({
  id: z.string(),
  tipo: z.enum([
    "texto",
    "textoLongo",
    "unica",
    "multipla",
    "ordenada",
    "url",
    "email",
    "celular",
    "consentimento",
  ]),
  rotulo: z.string(),
  ajuda: z.string().optional(),
  obrigatoria: z.boolean(),
  min: z.number().optional(),
  max: z.number().optional(),
  opcoes: z.array(opcaoSchema).optional(),
});

const etapaSchema = z.object({
  id: z.number(),
  titulo: z.string(),
  chamada: z.string().optional(),
  botao: z.string().optional(),
  condicional: z
    .object({ pergunta: z.string(), contemAlgum: z.array(z.string()) })
    .optional(),
  perguntas: z.array(perguntaSchema),
});

const configSchema = z.object({
  versao: z.string(),
  versaoFormulario: z.string(),
  revisar: z.boolean(),
  revisarNota: z.string(),
  modulos: z.record(z.string(), z.object({ nome: z.string(), frase: z.string() })),
  etapas: z.array(etapaSchema),
  pesos: z.object({
    financeiro: z.record(z.string(), mapaDePesos),
    operacao: z.record(z.string(), mapaDePesos),
    digital: z.record(z.string(), mapaDePesos),
  }),
  dorParaModulo: z.record(
    z.string(),
    z.object({
      principal: z.string().nullable(),
      secundario: z.string().nullable(),
    }),
  ),
  pesoDor: z.array(z.number()).length(3),
  pesoDorSecundaria: z.number(),
  nivelOferta: z.record(
    z.string(),
    z.object({
      nome: z.string(),
      composicao: z.string(),
      modulosFixos: z.array(z.string()),
      usaModulosRanqueados: z.number(),
      duracaoSemanas: z.number(),
    }),
  ),
  conflitoBibi: z.object({
    categorias: z.array(z.string()),
    palavrasChave: z.array(z.string()),
    territorios: z.array(z.string()),
  }),
  termosProibidos: z.object({
    substrings: z.array(z.string()),
    porque: z.string(),
  }),
  limitesDeCopy: z.object({
    palavrasLeitura: z.number(),
    palavrasSinal: z.number(),
    palavrasFraseMomento: z.number(),
    palavrasFraseModulo: z.number(),
    palavrasPrimeiraAcao: z.number(),
    porque: z.string(),
  }),
  frasesMomento: z.record(z.string(), z.object({ badge: z.string(), frase: z.string() })),
  sinais: z.array(
    z.object({ id: z.string(), prioridade: z.number(), texto: z.string() }),
  ),
  primeirasAcoes: z.record(z.string(), z.string()),
  cta: z.string(),
});

export type ConfigDiagnostico = z.infer<typeof configSchema>;

export const config: ConfigDiagnostico = configSchema.parse(bruto);

/**
 * Toda consulta dinâmica ao config passa por `Map`, nunca por `objeto[chave]`.
 *
 * Não é preciosismo de lint: as chaves que chegam aqui vêm, no fim da linha, do
 * JSON que o formulário público recebe. Indexar objeto com chave de fora abre
 * caminho para ler `__proto__`/`constructor` e para poluição de protótipo —
 * `Map` simplesmente não tem essa superfície. Os mapas são construídos uma vez,
 * na carga do módulo.
 */
const MODULOS = new Map(Object.entries(config.modulos));
const FRASES_MOMENTO = new Map(Object.entries(config.frasesMomento));
const PRIMEIRAS_ACOES = new Map(Object.entries(config.primeirasAcoes));
const NIVEIS_DE_OFERTA = new Map(Object.entries(config.nivelOferta));

/** Ids de sinal existentes, para o motor não citar sinal que não está na config. */
export const SINAIS_POR_ID = new Map(config.sinais.map((s) => [s.id, s]));

/** Destino de cada dor: `Map` pelo mesmo motivo — a dor vem do formulário. */
export const DOR_PARA_MODULO = new Map(Object.entries(config.dorParaModulo));

/** Pesos achatados em `"grupo.pergunta"` → (resposta → pontos). */
const PESOS = new Map<string, Map<string, number>>();
for (const [grupo, perguntas] of Object.entries(config.pesos)) {
  for (const [pergunta, mapa] of Object.entries(perguntas)) {
    PESOS.set(`${grupo}.${pergunta}`, new Map(Object.entries(mapa)));
  }
}

/**
 * Lê um peso obrigatório. Peso ausente é BUG DE CONFIG, não resposta neutra:
 * devolver 0 em silêncio faria a casa parecer pior do que é e mudaria o momento
 * calculado. Melhor estourar no primeiro diagnóstico do que enviar leitura errada.
 */
export function peso(onde: string, chave: string): number {
  const valor = PESOS.get(onde)?.get(chave);
  if (valor === undefined) {
    throw new Error(
      `[diagnostico] peso ausente em ${onde}: "${chave}". Confira config/diagnostico.json.`,
    );
  }
  return valor;
}

export function nomeModulo(id: ModuloId): string {
  const m = MODULOS.get(id);
  if (!m) throw new Error(`[diagnostico] módulo desconhecido: ${id}`);
  return m.nome;
}

export function fraseModulo(id: ModuloId): string {
  const m = MODULOS.get(id);
  if (!m) throw new Error(`[diagnostico] módulo desconhecido: ${id}`);
  return m.frase;
}

export function moduloExiste(id: string): boolean {
  return MODULOS.has(id);
}

export function frasesDoMomento(momento: Momento): { badge: string; frase: string } {
  const f = FRASES_MOMENTO.get(momento);
  if (!f) throw new Error(`[diagnostico] momento sem frase: ${momento}`);
  return f;
}

export function primeiraAcao(dor: Dor): string {
  const a = PRIMEIRAS_ACOES.get(dor) ?? PRIMEIRAS_ACOES.get("outra");
  if (!a) throw new Error(`[diagnostico] sem primeira ação para a dor: ${dor}`);
  return a;
}

export function nivelOfertaConfig(id: NivelOfertaId) {
  const n = NIVEIS_DE_OFERTA.get(id);
  if (!n) throw new Error(`[diagnostico] nível de oferta desconhecido: ${id}`);
  return n;
}

/** Conta palavras do jeito que a régua de 120 conta: tokens separados por espaço. */
export function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/u).filter(Boolean).length;
}

/**
 * Varre um texto atrás dos termos que NUNCA podem chegar ao dono: percentual,
 * preço, promessa de garantia, "gratuito" solto e "sem compromisso". A leitura
 * é sinal, não venda — e não promete resultado que ninguém pode assegurar.
 */
export function termosProibidosEm(texto: string): string[] {
  const alvo = texto.toLowerCase();
  return config.termosProibidos.substrings.filter((termo) => alvo.includes(termo));
}
