/**
 * Busca por trecho de nome que ignora MAIÚSCULA e ACENTO ("acai" acha "Polpa de açaí", "ype" acha "Ypê"), com o texto digitado
 * sempre literal (`%`, `_` e `\` são letras, nunca curingas). O Prisma só sabe ignorar a caixa (`mode: 'insensitive'`), então a
 * busca por acento é uma consulta SQL parametrizada que devolve os ids; quem chama filtra por eles. A troca de letras é a MESMA
 * do nome único (`chaveDoNome`, `translate()` do Postgres): o banco e o código concordam, e não precisa de extensão nova.
 */

import type { ClienteDoParceiro } from './tenant';
import { ACENTUADAS, chaveDoNome, SEM_ACENTO } from './categoria-campos';

/** O padrão do LIKE para o texto digitado (sem caixa, sem acento, literal), ou null quando não sobra o que buscar. */
export function padraoDaBusca(texto: string): string | null {
  const chave = chaveDoNome(texto.slice(0, 80));
  if (!chave) return null;
  return `%${chave.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Os insumos DESTE parceiro (o cliente é do portão) cujo nome ou marca de referência contém o texto. `null` = sem texto para
 * buscar (não filtra). `limite` corta a lista (a busca do ⌘K); sem ele vêm todos os que casam, do nome mais próximo ao mais longo.
 */
export async function idsDeInsumoPelaBusca(tx: ClienteDoParceiro, texto: string, opcoes: { limite?: number; soNome?: boolean } = {}): Promise<string[] | null> {
  const padrao = padraoDaBusca(texto);
  if (!padrao) return null;
  const limite = opcoes.limite ?? 5000;
  const linhas = await tx.sql<{ id: string }>`
    SELECT "id" FROM "Insumo"
    WHERE "parceiroId" = ${tx.parceiroId}
      AND (
        lower(translate(normalize("nome", NFC), ${ACENTUADAS}, ${SEM_ACENTO})) LIKE ${padrao} ESCAPE '\\'
        OR (${!opcoes.soNome} AND lower(translate(normalize(COALESCE("marcaReferencia", ''), NFC), ${ACENTUADAS}, ${SEM_ACENTO})) LIKE ${padrao} ESCAPE '\\')
      )
    ORDER BY length("nome"), "nome", "id"
    LIMIT ${limite}`;
  return linhas.map((l) => l.id);
}

/**
 * L.3 (herança da L.2): a MESMA busca sem acento para as fichas técnicas (pelo nome). `null` = sem texto para buscar. Quem chama
 * filtra por estes ids (a lista de fichas e a busca rápida do topo).
 */
export async function idsDeFichaPelaBusca(tx: ClienteDoParceiro, texto: string, opcoes: { limite?: number } = {}): Promise<string[] | null> {
  const padrao = padraoDaBusca(texto);
  if (!padrao) return null;
  const linhas = await tx.sql<{ id: string }>`
    SELECT "id" FROM "FichaTecnica"
    WHERE "parceiroId" = ${tx.parceiroId}
      AND lower(translate(normalize("nome", NFC), ${ACENTUADAS}, ${SEM_ACENTO})) LIKE ${padrao} ESCAPE '\\'
    ORDER BY length("nome"), "nome", "id"
    LIMIT ${opcoes.limite ?? 5000}`;
  return linhas.map((l) => l.id);
}

/** L.3: a busca sem acento do cadastro de fornecedores, pelo nome fantasia ou pela razão social. `null` = sem texto para buscar. */
export async function idsDeFornecedorPelaBusca(tx: ClienteDoParceiro, texto: string): Promise<string[] | null> {
  const padrao = padraoDaBusca(texto);
  if (!padrao) return null;
  const linhas = await tx.sql<{ id: string }>`
    SELECT "id" FROM "Fornecedor"
    WHERE "parceiroId" = ${tx.parceiroId}
      AND (
        lower(translate(normalize("nome", NFC), ${ACENTUADAS}, ${SEM_ACENTO})) LIKE ${padrao} ESCAPE '\\'
        OR lower(translate(normalize(COALESCE("razaoSocial", ''), NFC), ${ACENTUADAS}, ${SEM_ACENTO})) LIKE ${padrao} ESCAPE '\\'
      )
    ORDER BY length("nome"), "nome", "id"
    LIMIT 5000`;
  return linhas.map((l) => l.id);
}
