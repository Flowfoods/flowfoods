/**
 * Categorias de insumo (I.1a) — a parte PURA: o catálogo das dez padrão, a chave do nome (sem diferenciar maiúscula nem
 * acento), a leitura do formulário e as frases. Sem banco e sem Next: serve ao servidor (`categorias.ts`), à sugestão
 * pelo nome (`categoria-sugestao.ts`) e ao navegador.
 *
 * Categoria é a NATUREZA do insumo para o CMV gerencial (farinha é Mercearias e secos; coxa de frango é Proteína, mesmo
 * resfriada ou congelada). Não é setor, não é onde fica guardado, não é conservação.
 */

import { z } from 'zod';
import { primeiroErroPorCampo, type Erros } from './insumo-campos';

/** A identidade estável de cada categoria padrão: sobrevive ao renomear. */
export const CHAVES_PADRAO = [
  'PROTEINA',
  'HORTIFRUTI',
  'MERCEARIA',
  'LATICINIOS',
  'CONGELADOS',
  'PANIFICACAO',
  'BEBIDAS',
  'DESCARTAVEIS',
  'LIMPEZA',
  'OUTROS',
] as const;
export type ChaveDeCategoria = (typeof CHAVES_PADRAO)[number];

/** A que recebe o que não deu para decidir: do sistema, não se exclui, desativa nem renomeia. */
export const CHAVE_DO_SISTEMA: ChaveDeCategoria = 'OUTROS';

/** As dez do plano (19/10/2026), com os nomes exatos e a ordem. */
export const CATEGORIAS_PADRAO: readonly { chave: ChaveDeCategoria; nome: string; ordem: number; exemplo: string }[] = [
  { chave: 'PROTEINA', nome: 'Proteína', ordem: 10, exemplo: 'carnes bovinas, aves, suínos, pescados' },
  { chave: 'HORTIFRUTI', nome: 'Hortifruti', ordem: 20, exemplo: 'frutas, legumes, verduras e ervas frescas' },
  { chave: 'MERCEARIA', nome: 'Mercearias e secos', ordem: 30, exemplo: 'arroz, feijão, farinhas, massas, grãos, óleos, temperos e molhos' },
  { chave: 'LATICINIOS', nome: 'Laticínios, frios e embutidos', ordem: 40, exemplo: 'leite, queijo, manteiga, ovos, presunto, bacon e linguiça' },
  { chave: 'CONGELADOS', nome: 'Congelados e industrializados', ordem: 50, exemplo: 'só quando a natureza do produto não diz outra categoria' },
  { chave: 'PANIFICACAO', nome: 'Panificação', ordem: 60, exemplo: 'pães e panificados' },
  { chave: 'BEBIDAS', nome: 'Bebidas', ordem: 70, exemplo: 'refrigerantes, sucos, cervejas, água' },
  { chave: 'DESCARTAVEIS', nome: 'Descartáveis e embalagens', ordem: 80, exemplo: 'caixas, sacolas, guardanapos, copos' },
  { chave: 'LIMPEZA', nome: 'Limpeza e higienização', ordem: 90, exemplo: 'detergente, sanitizante, esponja' },
  { chave: 'OUTROS', nome: 'Outros / a classificar', ordem: 100, exemplo: 'temporário: fica na fila de revisão' },
];

export const NOME_DO_SISTEMA = CATEGORIAS_PADRAO.find((c) => c.chave === CHAVE_DO_SISTEMA)!.nome;

export const NOME_MAXIMO_DA_CATEGORIA = 60;

// ------------------------------------------------- nome sem caixa nem acento

const ACENTOS: Record<string, string> = {
  a: 'áàâãäå',
  e: 'éèêë',
  i: 'íìîï',
  o: 'óòôõö',
  u: 'úùûü',
  c: 'ç',
  n: 'ñ',
};
/** O par de listas do `translate()` do Postgres: a MESMA troca do `chaveDoNome`, para o banco e o código concordarem. */
export const ACENTUADAS = Object.values(ACENTOS).join('') + Object.values(ACENTOS).join('').toUpperCase();
export const SEM_ACENTO = Object.entries(ACENTOS)
  .map(([base, com]) => base.repeat(com.length))
  .join('')
  .repeat(2);
const TROCA = new Map<string, string>([...ACENTUADAS].map((c, i) => [c, SEM_ACENTO[i]]));

/**
 * O nome como o sistema o compara: minúsculo, sem acento, espaços colapsados. "Farinha de Trigo" e "farinha  de trigo"
 * são o mesmo; "Pão" e "pao" também. É a regra do nome único (insumo e categoria) e a base da sugestão.
 */
export function chaveDoNome(nome: string): string {
  let t = '';
  for (const c of nome) t += TROCA.get(c) ?? c;
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------- formulário

const nomeDaCategoria = z
  .string({ message: 'Dê um nome à categoria.' })
  .trim()
  .min(2, 'Dê um nome com pelo menos 2 letras.')
  .max(NOME_MAXIMO_DA_CATEGORIA, `Nome longo demais (máx. ${NOME_MAXIMO_DA_CATEGORIA}).`)
  .transform((s) => s.replace(/\s+/g, ' '));

/** O nome da categoria do formulário: 2 a 60 letras, espaços colapsados; ou os erros por campo. */
export function lerNomeDaCategoria(entrada: unknown): { ok: true; nome: string } | { ok: false; erros: Erros } {
  const r = nomeDaCategoria.safeParse(entrada);
  return r.success ? { ok: true, nome: r.data } : { ok: false, erros: primeiroErroPorCampo(r.error.issues.map((i) => ({ ...i, path: ['nome'] }))) };
}

// ---------------------------------------------------------------- frases

export const FRASE_CATEGORIA_INEXISTENTE = 'Essa categoria não existe mais. Escolha outra da lista.';
export const FRASE_CATEGORIA_DESATIVADA = 'Essa categoria está desativada. Escolha uma ativa.';

/** Como a categoria foi escolhida, em palavras (histórico e detalhe). */
export const COMO_CLASSIFICOU: Record<string, string> = {
  MANUAL: 'escolhida por uma pessoa',
  SUGESTAO: 'sugestão pelo nome, aceita',
  MIGRACAO: 'classificação assistida',
};

/** Item da lista de campos que faltam, na frase do servidor ("Falta: nome, categoria e unidade."). */
export function listaDoQueFalta(campos: readonly string[]): string {
  if (campos.length <= 1) return campos[0] ?? '';
  return `${campos.slice(0, -1).join(', ')} e ${campos[campos.length - 1]}`;
}
