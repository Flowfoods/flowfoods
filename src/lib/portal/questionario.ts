/**
 * Questionário do Portal do cliente.
 *
 * O conteúdo mora num JSON por cliente, copiado byte a byte do arquivo que o
 * Rodolfo fechou com o consultor (`questionarios/*.json`). Este módulo só LÊ:
 * nenhum texto é reescrito, abreviado ou "melhorado" aqui. O teste
 * `portal-questionario.test.ts` fixa o hash do arquivo — se alguém editar uma
 * vírgula, o portão acusa.
 *
 * O que este módulo acrescenta é estrutura: a lista plana de itens (arquivo ou
 * pergunta), com o bloco de cada um, para a tela, o painel e o disco.
 */

import valentins from './questionarios/valentins.json';

export const MARCACOES = ['NAO_TENHO', 'NAO_SEI', 'AGORA_NAO'] as const;
export type Marcacao = (typeof MARCACOES)[number];

/**
 * Rótulo na tela. É a grafia do próprio texto de abertura ("marque NÃO TENHO
 * (não existe hoje), NÃO SEI (...) ou AGORA NÃO (...)"), não uma invenção.
 */
export const ROTULO_MARCACAO: Record<Marcacao, string> = {
  NAO_TENHO: 'NÃO TENHO',
  NAO_SEI: 'NÃO SEI',
  AGORA_NAO: 'AGORA NÃO',
};

interface ItemArquivoBruto {
  id: string;
  nome: string;
  detalhe: string;
}

interface ItemPerguntaBruto {
  id: string;
  texto: string;
}

export interface QuestionarioBruto {
  marca: string;
  versao: string;
  marcacoes: string[];
  arquivos_e_acessos: { bloco: string; titulo: string; itens: ItemArquivoBruto[] }[];
  perguntas: { bloco: string; titulo: string; itens: ItemPerguntaBruto[] }[];
  texto_de_abertura: {
    instrucao: string;
    marcacoes: string;
    fechamento: string;
    assinatura: string;
    tagline: string;
  };
}

export type TipoItem = 'ARQUIVO' | 'PERGUNTA';

export interface Item {
  id: string;
  tipo: TipoItem;
  /**
   * Pasta no disco e agrupamento no painel. Arquivos usam a letra do bloco
   * (`A`…`E`); perguntas, `P` + o número (`P1`…`P6`) — senão o bloco "1" das
   * perguntas e um eventual bloco "1" de arquivos cairiam na mesma pasta.
   */
  bloco: string;
  blocoTitulo: string;
  /** Nome do item (arquivos) ou texto da pergunta. */
  rotulo: string;
  /** Complemento do item de arquivo; vazio quando o JSON não traz. */
  detalhe: string;
}

export interface Bloco {
  bloco: string;
  titulo: string;
  tipo: TipoItem;
  itens: Item[];
}

export interface Questionario {
  chave: string;
  marca: string;
  versao: string;
  blocos: Bloco[];
  itens: Item[];
  abertura: QuestionarioBruto['texto_de_abertura'];
}

/** Monta a estrutura a partir do JSON. Exportada para o teste. */
export function montarQuestionario(chave: string, q: QuestionarioBruto): Questionario {
  const blocos: Bloco[] = [
    ...q.arquivos_e_acessos.map((b) => ({
      bloco: b.bloco,
      titulo: b.titulo,
      tipo: 'ARQUIVO' as const,
      itens: b.itens.map((i) => ({
        id: i.id,
        tipo: 'ARQUIVO' as const,
        bloco: b.bloco,
        blocoTitulo: b.titulo,
        rotulo: i.nome,
        detalhe: i.detalhe,
      })),
    })),
    ...q.perguntas.map((b) => ({
      bloco: `P${b.bloco}`,
      titulo: b.titulo,
      tipo: 'PERGUNTA' as const,
      itens: b.itens.map((i) => ({
        id: i.id,
        tipo: 'PERGUNTA' as const,
        bloco: `P${b.bloco}`,
        blocoTitulo: b.titulo,
        rotulo: i.texto,
        detalhe: '',
      })),
    })),
  ];

  return {
    chave,
    marca: q.marca,
    versao: q.versao,
    blocos,
    itens: blocos.flatMap((b) => b.itens),
    abertura: q.texto_de_abertura,
  };
}

const REGISTRO: Record<string, Questionario> = {
  valentins: montarQuestionario('valentins', valentins as QuestionarioBruto),
};

export const QUESTIONARIOS_DISPONIVEIS = Object.keys(REGISTRO);

export function questionario(chave: string): Questionario | null {
  return REGISTRO[chave] ?? null;
}

export function acharItem(q: Questionario, itemId: string): Item | null {
  return q.itens.find((i) => i.id === itemId) ?? null;
}

export function ehMarcacao(v: unknown): v is Marcacao {
  return typeof v === 'string' && (MARCACOES as readonly string[]).includes(v);
}
