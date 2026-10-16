/**
 * Precificação dentro da ficha técnica (1.9) — regra com banco, sem tela.
 * Sempre um `ClienteDoParceiro`: embalagem, produto e taxa de outro parceiro
 * não existem para estas funções (portão + RLS; e a FK composta recusa no
 * banco). A conta é a pura (`canal-campos.ts`); o custo da ficha é o da
 * cascata (1.3) com o último preço (1.5) — nada é gravado, tudo se deriva na
 * leitura (decisões 53, 57, 65).
 *
 * - a ficha de PRATO tem um produto de venda "da casa" (`ProdutoVenda` sem
 *   marca, nome = o da ficha), criado na primeira gravação das embalagens e
 *   renomeado junto com a ficha; as embalagens por canal são dele
 *   (`ProdutoEmbalagem`). Marca e nome de venda próprios: 1.10+;
 * - gravar as embalagens trava a ficha (`FOR NO KEY UPDATE`) e confere a
 *   impressão da lista lida: duas abas, a segunda recebe "alguém alterou";
 * - os insumos citados são lidos travados (`FOR SHARE`: a unidade não muda no
 *   meio) e só tipo Embalagem entram;
 * - a taxa do iFood é do parceiro (`CanalConfig` IFOOD): editar é condicional
 *   ao `atualizadoEm` lido; criar em corrida = único (parceiro, canal);
 * - todo gravar leva o histórico (só o que mudou) na MESMA transação.
 */

import type { ClienteDoParceiro } from './tenant';
import { checkVioladoDe, ehErroDeUnicidade } from './tenant';
import { anexarUltimasCompras } from './compras-custo';
import { SELECAO_DO_INSUMO } from './ficha-custos';
import { custoDoInsumo, type CustoDaFicha } from './ficha-campos';
import { diferenca, type Erros } from './insumo-campos';
import { listarHistorico } from './historico';
import {
  camadasDoCanal,
  CAMPO_DO_CANAL,
  CANAIS_COM_EMBALAGEM,
  ehCanalComEmbalagem,
  impressaoDasEmbalagens,
  lerEmbalagens,
  lerTaxaDoCanal,
  ORDEM_DOS_CANAIS,
  retratoDasEmbalagens,
  type CamadasDoCanal,
  type CanalComEmbalagem,
  type EmbalagemDigitada,
  type EmbalagemDoCadastro,
  type EmbalagemDoCanal,
  type EmbalagemParaCusto,
  type TaxaDoCanal,
} from './canal-campos';
import { formatarPontosBase, type CustoExato, type Unidade } from './unidades';

export type ResultadoDoCanal = { ok: true; id: string; mudou: string[] } | { ok: false; erros: Erros; conflito?: boolean; naoEncontrado?: boolean };

class Recusa extends Error {
  constructor(readonly resultado: Extract<ResultadoDoCanal, { ok: false }>) {
    super('recusa');
  }
}

export const MENSAGEM_CONFLITO_DAS_EMBALAGENS =
  'Alguém mudou as embalagens desta ficha agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';
export const MENSAGEM_CONFLITO_DA_TAXA = 'Alguém mudou a taxa do iFood agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';

const ID = /^[a-z0-9]{1,64}$/i;

// ------------------------------------------------------------------- ler

/** Embalagens gravadas do produto da ficha, na ordem da tela: canal, nome. */
async function embalagensGravadas(tx: ClienteDoParceiro, fichaId: string) {
  const produto = await tx.produtoVenda.findFirst({
    where: { fichaId, marcaId: null },
    select: {
      id: true,
      embalagens: { select: { canal: true, insumoId: true, quantidadeMilesimos: true, insumo: { select: { ...SELECAO_DO_INSUMO, tipo: true } } } },
    },
  });
  const lista = (produto?.embalagens ?? [])
    .filter((e) => ehCanalComEmbalagem(e.canal))
    .map((e) => ({
      canal: e.canal as CanalComEmbalagem,
      insumoId: e.insumoId,
      quantidadeMilesimos: e.quantidadeMilesimos,
      insumo: { ...e.insumo, unidade: e.insumo.unidade as Unidade, ultimaCompra: null as CustoExato | null },
    }))
    .sort(
      (a, b) =>
        CANAIS_COM_EMBALAGEM.indexOf(a.canal) - CANAIS_COM_EMBALAGEM.indexOf(b.canal) ||
        a.insumo.nome.localeCompare(b.insumo.nome, 'pt-BR') ||
        (a.insumoId < b.insumoId ? -1 : 1),
    );
  return { produtoId: produto?.id ?? null, lista };
}

/** A taxa do iFood do parceiro (null = não configurada). */
async function taxaDoIfood(tx: ClienteDoParceiro) {
  return tx.canalConfig.findFirst({ where: { canal: 'IFOOD' }, select: { id: true, taxaBp: true, taxaPagamentoBp: true, atualizadoEm: true } });
}

/**
 * O custo por canal da ficha de PRATO, em camadas, com o custo da ficha que a
 * tela já calculou (a cascata: não se lê duas vezes). Pré-preparo não se
 * vende: null.
 */
export async function custoPorCanal(cliente: ClienteDoParceiro, ficha: { id: string; tipo: string; custo: CustoDaFicha }) {
  if (ficha.tipo !== 'PRATO') return null;
  return cliente.transacao(async (tx) => {
    const [{ produtoId, lista }, cfg] = await Promise.all([embalagensGravadas(tx, ficha.id), taxaDoIfood(tx)]);
    // 1.5: a embalagem custa o último preço da nota (uma consulta para a leitura inteira).
    await anexarUltimasCompras(
      tx,
      lista.map((e) => e.insumo),
    );
    const taxa: TaxaDoCanal | null = cfg ? { comissaoBp: cfg.taxaBp, pagamentoBp: cfg.taxaPagamentoBp } : null;
    const paraCusto = (canal: CanalComEmbalagem): EmbalagemParaCusto[] =>
      lista
        .filter((e) => e.canal === canal)
        .map((e) => ({ insumoId: e.insumoId, nome: e.insumo.nome, unidade: e.insumo.unidade, quantidadeMilesimos: e.quantidadeMilesimos, insumo: e.insumo }));
    const canais: CamadasDoCanal[] = ORDEM_DOS_CANAIS.map((canal) =>
      camadasDoCanal({
        canal,
        custoDaFicha: ficha.custo,
        embalagens: canal === 'LOJA' ? [] : paraCusto(canal),
        // Na 1.9 só o iFood cobra sobre o preço; loja e delivery próprio, não.
        taxa: canal === 'IFOOD' ? (taxa ?? 'naoConfigurada') : null,
      }),
    );
    return {
      produtoId,
      impressao: impressaoDasEmbalagens(lista),
      embalagens: lista.map((e) => ({
        canal: e.canal,
        insumoId: e.insumoId,
        nome: e.insumo.nome,
        unidade: e.insumo.unidade,
        ativo: e.insumo.ativo,
        tipo: e.insumo.tipo,
        quantidadeMilesimos: e.quantidadeMilesimos,
      })),
      taxaDoIfood: taxa,
      canais,
    };
  });
}

export type CustoPorCanal = NonNullable<Awaited<ReturnType<typeof custoPorCanal>>>;

/**
 * Embalagens que o formulário oferece: insumos tipo Embalagem ativos e as que
 * já estão na ficha (desativadas ou que mudaram de tipo, marcadas), com o
 * custo de referência para a prévia.
 */
export async function embalagensParaEscolher(cliente: ClienteDoParceiro, jaNaFicha: readonly string[] = []) {
  const lidos = await cliente.insumo.findMany({
    where: { OR: [{ tipo: 'EMBALAGEM', ativo: true }, { id: { in: [...jaNaFicha] } }] },
    orderBy: { nome: 'asc' },
    select: { ...SELECAO_DO_INSUMO, tipo: true },
  });
  const comCompra = lidos.map((i) => ({ ...i, ultimaCompra: null as CustoExato | null }));
  await anexarUltimasCompras(cliente, comCompra);
  return comCompra.map((i) => ({
    id: i.id,
    nome: i.nome,
    unidade: i.unidade as Unidade,
    ativo: i.ativo,
    embalagem: i.tipo === 'EMBALAGEM',
    custo: custoDoInsumo(i) as CustoExato | null,
  }));
}

export type EmbalagemDoFormulario = Awaited<ReturnType<typeof embalagensParaEscolher>>[number];

// ------------------------------------------------------------ gravar embalagens

/**
 * Troca as embalagens dos dois canais da ficha (a lista inteira, como a tela
 * mandou). `impressao` = a lista que a tela leu: se o banco tiver outra,
 * conflito e nada muda.
 */
export async function salvarEmbalagens(
  cliente: ClienteDoParceiro,
  fichaId: string,
  entrada: { impressao: unknown; linhas: readonly EmbalagemDigitada[] },
  autorNome = 'Sistema',
): Promise<ResultadoDoCanal> {
  if (!ID.test(fichaId)) return { ok: false, erros: { geral: 'Ficha não encontrada.' }, naoEncontrado: true };
  try {
    return await cliente.transacao(async (tx) => {
      // A ficha travada: duas gravações das embalagens dela entram uma de cada vez (e a 2ª confere a impressão).
      const [f] = await tx.sql<{ id: string; nome: string; tipo: string; ativa: boolean }>`
        SELECT "id", "nome", "tipo"::text AS "tipo", "ativa" FROM "FichaTecnica"
        WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${fichaId}
        FOR NO KEY UPDATE`;
      if (!f) throw new Recusa({ ok: false, erros: { geral: 'Ficha não encontrada.' }, naoEncontrado: true });
      if (f.tipo !== 'PRATO') throw new Recusa({ ok: false, erros: { geral: 'Pré-preparo não se vende: embalagem por canal é da ficha de prato.' } });
      if (!f.ativa) throw new Recusa({ ok: false, erros: { geral: 'Ficha desativada: reative antes de editar.' } });
      const atual = await embalagensGravadas(tx, f.id);
      if (typeof entrada.impressao !== 'string' || entrada.impressao !== impressaoDasEmbalagens(atual.lista)) {
        throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DAS_EMBALAGENS }, conflito: true });
      }
      // Os insumos citados, travados (FOR SHARE) e só deste parceiro.
      const ids = Array.from(new Set(entrada.linhas.map((l) => l.insumoId).filter((x) => typeof x === 'string' && ID.test(x))));
      if (ids.length) await tx.sql`SELECT 1 FROM "Insumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ANY(${ids}::text[]) FOR SHARE`;
      const lidos = ids.length
        ? await tx.insumo.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, unidade: true, tipo: true, ativo: true } })
        : [];
      const cadastro = new Map<string, EmbalagemDoCadastro>(lidos.map((i) => [i.id, { ...i, unidade: i.unidade as Unidade }]));
      const lido = lerEmbalagens(entrada.linhas, cadastro, new Set(atual.lista.map((e) => `${e.canal}:${e.insumoId}`)));
      if (!lido.ok) throw new Recusa({ ok: false, erros: lido.erros });

      const nomes = new Map<string, { nome: string; unidade: Unidade }>([
        ...atual.lista.map((e) => [e.insumoId, { nome: e.insumo.nome, unidade: e.insumo.unidade }] as const),
        ...lidos.map((i) => [i.id, { nome: i.nome, unidade: i.unidade as Unidade }] as const),
      ]);
      const antes = { nome: f.nome, ...retratoDasEmbalagens(atual.lista, nomes) };
      const depois = { nome: f.nome, ...retratoDasEmbalagens(lido.dados, nomes) };
      const mudanca = diferenca(antes, depois);
      if (!mudanca) return { ok: true as const, id: f.id, mudou: [] };

      let produtoId = atual.produtoId;
      if (!produtoId) {
        // O produto de venda da casa: sem marca, nome = o da ficha (o nome acompanha a ficha ao renomear).
        const p = await tx.produtoVenda.create({ data: { parceiroId: tx.parceiroId, fichaId: f.id, nome: f.nome }, select: { id: true } });
        produtoId = p.id;
      }
      await tx.produtoEmbalagem.deleteMany({ where: { produtoId, canal: { in: [...CANAIS_COM_EMBALAGEM] } } });
      if (lido.dados.length) {
        await tx.produtoEmbalagem.createMany({
          data: lido.dados.map((e: EmbalagemDoCanal) => ({
            parceiroId: tx.parceiroId,
            produtoId: produtoId!,
            canal: e.canal,
            insumoId: e.insumoId,
            quantidadeMilesimos: e.quantidadeMilesimos,
          })),
        });
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'FichaTecnica',
          entidadeId: f.id,
          acao: 'ALTEROU',
          antes: mudanca.antes,
          depois: mudanca.depois,
          autorNome,
        },
      });
      return { ok: true as const, id: f.id, mudou: mudanca.campos };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    // Dois "primeiros" produtos da mesma ficha (a trava da ficha já serializa; fica o seguro).
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DAS_EMBALAGENS }, conflito: true };
    if (checkVioladoDe(e)) return { ok: false, erros: { geral: 'Algum número passou do limite (até 1.000 por porção). Confira e salve de novo.' } };
    throw e;
  }
}

/** Campos do histórico que a gravação das embalagens mexe (para a frase do "feito"). */
export const CAMPOS_DAS_EMBALAGENS = Object.values(CAMPO_DO_CANAL);

// ------------------------------------------------------------ taxa do iFood

/** Retrato da taxa para o histórico ("23%"). */
const retratoDaTaxa = (t: TaxaDoCanal) => ({ nome: 'iFood', comissao: formatarPontosBase(t.comissaoBp), pagamento: formatarPontosBase(t.pagamentoBp) });

/** A taxa do iFood do parceiro e as últimas alterações dela. */
export async function obterTaxaDoIfood(cliente: ClienteDoParceiro) {
  return cliente.transacao(async (tx) => {
    const cfg = await taxaDoIfood(tx);
    const historico = cfg ? await listarHistorico(tx, { de: [{ entidade: 'CanalConfig', ids: [cfg.id] }], limite: 10 }) : [];
    return {
      taxa: cfg ? ({ comissaoBp: cfg.taxaBp, pagamentoBp: cfg.taxaPagamentoBp } satisfies TaxaDoCanal) : null,
      versao: cfg ? cfg.atualizadoEm.toISOString() : '',
      historico,
    };
  });
}

/**
 * Configura a taxa do iFood do parceiro (comissão + pagamento online, %).
 * `versao` = o `atualizadoEm` lido ('' = a tela leu "não configurada").
 */
export async function salvarTaxaDoIfood(
  cliente: ClienteDoParceiro,
  entrada: { comissao: unknown; pagamento: unknown; versao: unknown },
  autorNome = 'Sistema',
): Promise<ResultadoDoCanal> {
  const lido = lerTaxaDoCanal(entrada);
  if (!lido.ok) return lido;
  const t = lido.dados;
  const versao = typeof entrada.versao === 'string' ? entrada.versao : '';
  try {
    return await cliente.transacao(async (tx) => {
      const atual = await taxaDoIfood(tx);
      if ((atual ? atual.atualizadoEm.toISOString() : '') !== versao)
        throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DA_TAXA }, conflito: true });
      if (!atual) {
        const novo = await tx.canalConfig.create({
          data: { parceiroId: tx.parceiroId, canal: 'IFOOD', taxaBp: t.comissaoBp, taxaPagamentoBp: t.pagamentoBp },
          select: { id: true },
        });
        await tx.historicoAlteracao.create({
          data: { parceiroId: tx.parceiroId, entidade: 'CanalConfig', entidadeId: novo.id, acao: 'CRIOU', depois: retratoDaTaxa(t), autorNome },
        });
        return { ok: true as const, id: novo.id, mudou: ['comissao', 'pagamento'] };
      }
      const antes = retratoDaTaxa({ comissaoBp: atual.taxaBp, pagamentoBp: atual.taxaPagamentoBp });
      const mudanca = diferenca(antes, retratoDaTaxa(t));
      if (!mudanca) return { ok: true as const, id: atual.id, mudou: [] };
      const r = await tx.canalConfig.updateMany({
        where: { id: atual.id, atualizadoEm: atual.atualizadoEm },
        data: { taxaBp: t.comissaoBp, taxaPagamentoBp: t.pagamentoBp },
      });
      if (r.count !== 1) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DA_TAXA }, conflito: true });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'CanalConfig',
          entidadeId: atual.id,
          acao: 'ALTEROU',
          antes: mudanca.antes,
          depois: mudanca.depois,
          autorNome,
        },
      });
      return { ok: true as const, id: atual.id, mudou: mudanca.campos };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    // Duas "primeiras" configurações juntas: o único (parceiro, canal) deixa uma; a outra relê.
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DA_TAXA }, conflito: true };
    throw e;
  }
}
