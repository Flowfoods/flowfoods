/**
 * Impressão da Ficha com preços e custos — leitura sob pedido (decisão de 31/10/2026).
 *
 * A página de impressão sai sempre sem valores. Quando a pessoa escolhe "Com preços e custos", a ação do servidor
 * confere a permissão (quem chama: `fichas.ver` + `precos.ver`) e só então lê aqui os valores da MESMA versão da ficha
 * que a tela mostra, pelo portão do parceiro. Nada é gravado: é a leitura que o detalhe gerencial já faz.
 */

import { custoPorCanal } from './canais';
import type { CmvDoCanal } from './cmv-produto-campos';
import { fichaNaTela, obterFicha } from './fichas';
import { fichaNoPapel, type FichaNoPapel } from './ficha-papel';
import type { ClienteDoParceiro } from './tenant';

export type ImpressaoFinanceira = { ok: true; ficha: FichaNoPapel; canais: CmvDoCanal[] | null } | { ok: false; erro: string };

export const FICHA_MUDOU_NA_IMPRESSAO = 'A ficha foi alterada depois que esta página abriu. Recarregue a página para imprimir a versão atual.';

const textoCurto = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64;

/** Só para quem já passou pela permissão na ação. `versao` = o `atualizadoEm` (ISO) que a tela mostra. */
export async function lerImpressaoFinanceira(cliente: ClienteDoParceiro, id: unknown, versao: unknown): Promise<ImpressaoFinanceira> {
  if (!textoCurto(id) || !textoCurto(versao)) return { ok: false, erro: 'Pedido de impressão inválido. Recarregue a página.' };
  return cliente.transacao(async tx => {
    const ficha = await obterFicha(tx, id, { verPrecos: true });
    if (!ficha) return { ok: false as const, erro: 'Ficha não encontrada.' };
    if (ficha.versao !== versao) return { ok: false as const, erro: FICHA_MUDOU_NA_IMPRESSAO };
    const canais = (await custoPorCanal(tx, ficha))?.cmv ?? null;
    return { ok: true as const, ficha: fichaNoPapel(fichaNaTela(ficha, true)), canais };
  }, { repetivel: true });
}
