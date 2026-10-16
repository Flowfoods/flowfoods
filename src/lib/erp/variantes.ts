/**
 * Outras embalagens de compra de um insumo (`InsumoVariante`, 1.1): caixa,
 * fardo, outra marca. Conteúdo na MESMA unidade do insumo; preço e frete por
 * embalagem; custo de referência calculado como o do insumo. A embalagem do
 * próprio insumo continua sendo a padrão. Fornecedor por embalagem é 1.5.
 *
 * Variante não tem `atualizadoEm`: editar é condicional aos VALORES lidos
 * (`versaoDaVariante` na tela + `updateMany` com os mesmos valores no where).
 * Toda gravação trava a linha do insumo em FOR SHARE antes de ler a unidade:
 * uma troca de unidade concorrente espera, ou é recusada.
 */

import type { ClienteDoParceiro } from './tenant';
import { ehErroDeUnicidade } from './tenant';
import { diferenca, lerFormVariante, retratoDaVariante, versaoDaVariante, type Erros } from './insumo-campos';

export type ResultadoVariante =
  | { ok: true; id: string; nome: string; mudou: string[] }
  | { ok: false; erros: Erros; conflito?: boolean; naoEncontrado?: boolean };

export const MENSAGEM_CONFLITO_EMBALAGEM =
  'Alguém alterou esta embalagem agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';
const REPETIDA = 'Este insumo já tem uma embalagem com esse nome.';

class Recusa extends Error {
  constructor(readonly resultado: Extract<ResultadoVariante, { ok: false }>) {
    super('recusa');
  }
}

/** Insumo do parceiro, com a linha travada em FOR SHARE até o fim da transação. */
async function insumoTravado(tx: ClienteDoParceiro, insumoId: string) {
  await tx.sql`SELECT 1 FROM "Insumo" WHERE "id" = ${insumoId} AND "parceiroId" = ${tx.parceiroId} FOR SHARE`;
  const insumo = await tx.insumo.findUnique({
    where: { id: insumoId },
    select: { id: true, nome: true, unidade: true, ativo: true, fichaQueProduz: { select: { nome: true } } },
  });
  if (!insumo) throw new Recusa({ ok: false, erros: { geral: 'Insumo não encontrado.' }, naoEncontrado: true });
  if (insumo.fichaQueProduz) {
    throw new Recusa({ ok: false, erros: { geral: `“${insumo.nome}” é pré-preparo: o custo vem da ficha “${insumo.fichaQueProduz.nome}”, sem embalagem de compra.` } });
  }
  if (!insumo.ativo) {
    throw new Recusa({ ok: false, erros: { geral: 'Insumo desativado: reative antes de mexer nas embalagens.' } });
  }
  return insumo;
}

async function emTransacao(
  cliente: ClienteDoParceiro,
  fn: (tx: ClienteDoParceiro) => Promise<ResultadoVariante>,
): Promise<ResultadoVariante> {
  try {
    return await cliente.transacao(fn);
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { nome: REPETIDA } };
    throw e;
  }
}

export async function cadastrarVariante(
  cliente: ClienteDoParceiro,
  insumoId: string,
  entrada: Record<string, unknown>,
  autorNome = 'Sistema',
): Promise<ResultadoVariante> {
  return emTransacao(cliente, async (tx) => {
    const insumo = await insumoTravado(tx, insumoId);
    const lido = lerFormVariante(entrada, insumo.unidade);
    if (!lido.ok) throw new Recusa(lido);
    const d = lido.dados;
    const nova = await tx.insumoVariante.create({
      data: {
        parceiroId: tx.parceiroId,
        insumoId: insumo.id,
        nome: d.nome,
        conteudoMilesimos: d.conteudoMilesimos,
        precoEmbalagemCentavos: d.precoEmbalagemCentavos,
        taxaEntregaCentavos: d.taxaEntregaCentavos,
        codigoBarras: d.codigoBarras,
      },
      select: { id: true, nome: true },
    });
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'InsumoVariante',
        entidadeId: nova.id,
        acao: 'CRIOU',
        depois: retratoDaVariante(d, insumo),
        autorNome,
      },
    });
    return { ok: true, ...nova, mudou: [] };
  });
}

/** `entrada.versao` = `versaoDaVariante` dos valores que a tela leu. */
export async function editarVariante(
  cliente: ClienteDoParceiro,
  insumoId: string,
  varianteId: string,
  entrada: Record<string, unknown>,
  autorNome = 'Sistema',
): Promise<ResultadoVariante> {
  return emTransacao(cliente, async (tx) => {
    const insumo = await insumoTravado(tx, insumoId);
    const atual = await tx.insumoVariante.findFirst({ where: { id: varianteId, insumoId } });
    if (!atual) throw new Recusa({ ok: false, erros: { geral: 'Embalagem não encontrada.' }, naoEncontrado: true });
    if (versaoDaVariante(atual) !== entrada.versao) {
      throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_EMBALAGEM }, conflito: true });
    }
    const lido = lerFormVariante(entrada, insumo.unidade);
    if (!lido.ok) throw new Recusa(lido);
    const d = lido.dados;
    const mudanca = diferenca(retratoDaVariante(atual, insumo), retratoDaVariante(d, insumo));
    if (!mudanca) return { ok: true, id: atual.id, nome: atual.nome, mudou: [] };
    // Condicional nos valores lidos: quem gravou no meio faz isto mudar 0 linhas.
    const r = await tx.insumoVariante.updateMany({
      where: {
        id: atual.id,
        insumoId,
        nome: atual.nome,
        conteudoMilesimos: atual.conteudoMilesimos,
        precoEmbalagemCentavos: atual.precoEmbalagemCentavos,
        taxaEntregaCentavos: atual.taxaEntregaCentavos,
        codigoBarras: atual.codigoBarras,
        ativo: atual.ativo,
      },
      data: {
        nome: d.nome,
        conteudoMilesimos: d.conteudoMilesimos,
        precoEmbalagemCentavos: d.precoEmbalagemCentavos,
        taxaEntregaCentavos: d.taxaEntregaCentavos,
        codigoBarras: d.codigoBarras,
      },
    });
    if (r.count === 0) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_EMBALAGEM }, conflito: true });
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'InsumoVariante',
        entidadeId: atual.id,
        acao: 'ALTEROU',
        antes: mudanca.antes,
        depois: mudanca.depois,
        autorNome,
      },
    });
    return { ok: true, id: atual.id, nome: d.nome, mudou: mudanca.campos };
  });
}

export async function mudarSituacaoVariante(
  cliente: ClienteDoParceiro,
  insumoId: string,
  varianteId: string,
  ativo: boolean,
  motivoTexto: unknown,
  autorNome = 'Sistema',
): Promise<ResultadoVariante> {
  const motivo = typeof motivoTexto === 'string' ? motivoTexto.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null;
  return emTransacao(cliente, async (tx) => {
    const insumo = await insumoTravado(tx, insumoId);
    const atual = await tx.insumoVariante.findFirst({ where: { id: varianteId, insumoId }, select: { id: true, nome: true } });
    if (!atual) throw new Recusa({ ok: false, erros: { geral: 'Embalagem não encontrada.' }, naoEncontrado: true });
    const r = await tx.insumoVariante.updateMany({ where: { id: atual.id, insumoId, ativo: !ativo }, data: { ativo } });
    if (r.count === 0) {
      throw new Recusa({
        ok: false,
        erros: { geral: ativo ? 'Esta embalagem já está ativa.' : 'Esta embalagem já estava desativada.' },
        conflito: true,
      });
    }
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'InsumoVariante',
        entidadeId: atual.id,
        acao: ativo ? 'REATIVOU' : 'DESATIVOU',
        antes: { insumo: insumo.nome, nome: atual.nome, ativo: !ativo },
        depois: { insumo: insumo.nome, nome: atual.nome, ativo },
        motivo,
        autorNome,
      },
    });
    return { ok: true, id: atual.id, nome: atual.nome, mudou: ['ativo'] };
  });
}
