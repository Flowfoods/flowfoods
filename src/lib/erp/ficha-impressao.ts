/**
 * Impressão da Ficha com preços e custos — leitura sob pedido (decisão de 31/10/2026).
 *
 * A página de impressão sai sempre sem valores. Quando a pessoa escolhe "Com preços e custos", a ação do servidor
 * confere a permissão (quem chama: `fichas.ver` + `precos.ver`) e só então lê aqui os valores da MESMA versão da ficha
 * que a tela mostra, pelo portão do parceiro. Nada é gravado: é a leitura que o detalhe gerencial já faz.
 */

import { createHash } from 'node:crypto';
import { custoPorCanal, materiaisDaFicha } from './canais';
import type { CmvDoCanal } from './cmv-produto-campos';
import { fichaNaTela, obterFicha } from './fichas';
import { fichaNoPapel, type FichaNoPapel } from './ficha-papel';
import type { ClienteDoParceiro } from './tenant';
import { SELECAO_DA_VALIDADE, validadesDaLinha } from './validade';
import type { MaterialDaFichaNoPapel } from './ficha-unificada-campos';
import type { Unidade } from './unidades';

export type ImpressaoFinanceira = { ok: true; ficha: FichaNoPapel; canais: CmvDoCanal[] | null } | { ok: false; erro: string };
export type ImpressaoOperacional = { ok: true; ficha: FichaNoPapel } | { ok: false; erro: string };

export const FICHA_MUDOU_NA_IMPRESSAO = 'A ficha foi alterada depois que esta página abriu. Recarregue a página para imprimir a versão atual.';

const textoCurto = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64;

/** Hash apenas do papel operacional; preço/custo/faixas não tornam a receita antiga por si só. */
function comVersaoOperacional(ficha: FichaNoPapel): FichaNoPapel {
  const papel = [1, ficha.id, ficha.nome, ficha.tipo, ficha.ativa, ficha.versao, ficha.descricao,
    ficha.rendimentoMilesimos, ficha.unidadeRendimento, ficha.validades, ficha.consumoImediato,
    ficha.foto, ficha.passosPreparo, ficha.modoPreparo,
    ficha.itens.map(i => [i.id, i.nome, i.preparo, i.quantidadeMilesimos, i.unidade, i.fatorCorrecaoMilesimos]),
    ficha.materiais.map(m => [m.canal, m.nome, m.unidade, m.quantidadeMilesimos])];
  return { ...ficha, versaoOperacional: createHash('sha256').update(JSON.stringify(papel)).digest('hex') };
}

async function materiaisNoPapel(tx: ClienteDoParceiro, id: string): Promise<MaterialDaFichaNoPapel[]> {
  return (await materiaisDaFicha(tx, id)).lista.map(({ canal, nome, unidade, quantidadeMilesimos }) => ({ canal, nome, unidade, quantidadeMilesimos }));
}

/** Leitor mínimo operacional: não lê custos, compras, preços, taxas, metas ou histórico. */
export async function obterFichaParaImpressao(cliente: ClienteDoParceiro, id: string): Promise<FichaNoPapel | null> {
  if (!textoCurto(id)) return null;
  return cliente.transacao(async tx => {
    const f = await tx.fichaTecnica.findUnique({ where: { id }, select: {
      id: true, nome: true, tipo: true, ativa: true, atualizadoEm: true, descricao: true,
      rendimentoMilesimos: true, unidadeRendimento: true, ...SELECAO_DA_VALIDADE, consumoImediato: true,
      fotoArquivo: true, passosPreparo: true, modoPreparo: true,
      itens: { orderBy: { ordem: 'asc' }, select: { id: true, subfichaId: true, quantidadeMilesimos: true,
        fatorCorrecaoMilesimos: true, insumo: { select: { nome: true, unidade: true } },
        subficha: { select: { nome: true, unidadeRendimento: true } } } },
    } });
    if (!f) return null;
    const materiais = await materiaisNoPapel(tx, id);
    return comVersaoOperacional({ id: f.id, nome: f.nome, tipo: f.tipo, ativa: f.ativa, versao: f.atualizadoEm.toISOString(),
      versaoOperacional: '', materiais, descricao: f.descricao, rendimentoMilesimos: f.rendimentoMilesimos,
      unidadeRendimento: f.unidadeRendimento, validades: validadesDaLinha(f), consumoImediato: f.consumoImediato,
      foto: f.fotoArquivo?.slice(0, 12) ?? null, passosPreparo: f.passosPreparo, modoPreparo: f.modoPreparo,
      verCustos: false, custo: null, itens: f.itens.map(i => ({ id: i.id, nome: i.subficha?.nome ?? i.insumo?.nome ?? '?',
        preparo: i.subfichaId !== null, quantidadeMilesimos: i.quantidadeMilesimos,
        unidade: (i.subficha?.unidadeRendimento ?? i.insumo?.unidade ?? 'UN') as Unidade,
        fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos, custo: null })) });
  }, { repetivel: true });
}

export async function lerImpressaoOperacional(cliente: ClienteDoParceiro, id: unknown, versao: unknown): Promise<ImpressaoOperacional> {
  if (!textoCurto(id) || !textoCurto(versao)) return { ok: false, erro: 'Pedido de impressão inválido. Recarregue a página.' };
  const ficha = await obterFichaParaImpressao(cliente, id);
  if (!ficha) return { ok: false, erro: 'Ficha não encontrada.' };
  return ficha.versaoOperacional === versao ? { ok: true, ficha } : { ok: false, erro: FICHA_MUDOU_NA_IMPRESSAO };
}

/** Só após permissão; versão é o hash operacional, nunca o ISO isolado da receita. */
export async function lerImpressaoFinanceira(cliente: ClienteDoParceiro, id: unknown, versao: unknown): Promise<ImpressaoFinanceira> {
  if (!textoCurto(id) || !textoCurto(versao)) return { ok: false, erro: 'Pedido de impressão inválido. Recarregue a página.' };
  return cliente.transacao(async tx => {
    const ficha = await obterFicha(tx, id, { verPrecos: true });
    if (!ficha) return { ok: false as const, erro: 'Ficha não encontrada.' };
    const papel = comVersaoOperacional(fichaNoPapel(fichaNaTela(ficha, true), await materiaisNoPapel(tx, id)));
    if (papel.versaoOperacional !== versao) return { ok: false as const, erro: FICHA_MUDOU_NA_IMPRESSAO };
    const canais = (await custoPorCanal(tx, ficha))?.cmv ?? null;
    return { ok: true as const, ficha: papel, canais };
  }, { repetivel: true });
}
