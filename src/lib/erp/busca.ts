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
